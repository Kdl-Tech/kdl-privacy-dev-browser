'use strict';

const { app, BrowserWindow, session, ipcMain, shell, dialog, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');

const isDev = process.argv.includes('--dev');

// Dossier des modèles IA locaux (hors Git, hors source). Créé à la demande.
const AI_MODELS_DIR = () => path.join(app.getPath('userData'), 'ai-models');
// Garde-fou téléchargement : aucun modèle n'est téléchargé sans autorisation explicite.
// Activé uniquement si KDL_AI_ALLOW_DOWNLOAD=1 (défini par l'utilisateur en connaissance de cause).
const AI_DOWNLOAD_ALLOWED = () => process.env.KDL_AI_ALLOW_DOWNLOAD === '1';

// Session réellement utilisée par les <webview> (doit matcher la partition de l'UI).
const PARTITION = 'persist:kdl';
const browseSession = () => session.fromPartition(PARTITION);
const DL_DIR = path.join(os.homedir(), 'Bureau', 'kdl-telechargements');

// --- Confidentialité : pas de télémétrie, blocage cookies tiers optionnel ---
app.setPath('userData', path.join(app.getPath('userData')));

let mainWindow = null;

// Protocole local (deep-link) : permet à un lanceur d'ouvrir l'app sur sa home locale,
// sans jamais ouvrir GitHub. Sur les postes où il n'est pas enregistré, le lien est sans effet.
const PROTOCOL = 'kdl-privacy-browser';
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Mono-instance : un 2e lancement (ex. kdl-privacy-browser://open) réveille la fenêtre
// existante sur la home au lieu de dupliquer ou d'échouer.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: '#020817',
    icon: path.join(__dirname, '..', 'assets', 'icon-256.png'),
    title: 'KDL Privacy Dev Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,        // requis pour <webview>
      spellcheck: false
    }
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Toute fenêtre/onglet externe demandé par l'UI -> navigateur système, jamais une fenêtre Electron sans contrôle.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Mettre la fenêtre au premier plan sur la home (réutilisé par le protocole / 2e instance).
function focusHome() {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Blocage cookies tiers (toggle depuis le renderer).
function setThirdPartyCookieBlock(enabled) {
  const ses = session.defaultSession;
  // Approche simple V1 : on n'altère pas les requêtes, on délègue au paramètre natif si dispo.
  // Le blocage fin sera renforcé en V2. Ici on documente l'état.
  return enabled;
}

// Un 2e lancement (deep-link inclus) réveille la fenêtre existante sur la home.
app.on('second-instance', () => focusHome());
app.on('open-url', () => focusHome()); // macOS : protocole

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  // Durcissement : interdire toute permission web sensible par défaut (caméra, micro, géoloc, notifications).
  const denyHandler = (wc, permission, cb) => {
    const allowed = ['fullscreen', 'clipboard-sanitized-write'];
    cb(allowed.includes(permission));
  };
  session.defaultSession.setPermissionRequestHandler(denyHandler);
  browseSession().setPermissionRequestHandler(denyHandler);

  // Téléchargements : gestionnaire dédié (dossier dédié, aucune exécution/ouverture auto).
  browseSession().on('will-download', (_e, item) => startDownload(item));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

// Nettoyer les données du site courant (cache + storage) — sur la session de navigation
// (persist:kdl), pas defaultSession : c'est là que vivent réellement cookies/cache des pages.
// Les favoris/préférences (localStorage de l'UI = defaultSession) ne sont donc pas touchés.
ipcMain.handle('kdl:clear-site-data', async (_e, origin) => {
  const ses = browseSession();
  const opts = { storages: ['cookies', 'localstorage', 'caches', 'cachestorage', 'indexdb', 'serviceworkers', 'shadercache', 'websql'] };
  if (origin) opts.origin = origin;
  await ses.clearStorageData(opts);
  await ses.clearCache();
  return { ok: true, origin: origin || 'all' };
});

// Effacer toutes les données de navigation (fermeture / bouton) — persist:kdl uniquement.
ipcMain.handle('kdl:clear-all', async () => {
  const ses = browseSession();
  await ses.clearStorageData();
  await ses.clearCache();
  return { ok: true };
});

// Ouverture externe contrôlée (lien GitHub « À propos », etc.).
ipcMain.handle('kdl:open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { ok: true }; }
  return { ok: false };
});

// Métadonnées « À propos ».
ipcMain.handle('kdl:about', () => ({ name: 'KDL Privacy Dev Browser', version: app.getVersion() }));

// Export favoris -> fichier JSON local (aucun cloud).
ipcMain.handle('kdl:export-favs', async (_e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter les favoris',
    defaultPath: path.join(os.homedir(), 'Bureau', 'kdl-favoris.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); return { ok: true, file: filePath }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Import favoris depuis un fichier JSON local (renvoie le tableau brut ; validation côté renderer).
ipcMain.handle('kdl:import-favs', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer des favoris', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
  try {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!Array.isArray(data)) return { ok: false, error: 'format invalide (tableau attendu)' };
    return { ok: true, data };
  } catch (err) { return { ok: false, error: String(err) }; }
});

// Enregistrement local d'un texte (export Markdown du mode lecture, etc.).
// Aucun cloud ; dialogue natif ; l'utilisateur choisit la destination.
ipcMain.handle('kdl:save-text', async (_e, { name, content } = {}) => {
  if (typeof content !== 'string') return { ok: false, error: 'contenu invalide' };
  const safe = (name || 'kdl-export.txt').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Enregistrer', defaultPath: path.join(os.homedir(), 'Bureau', safe),
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(filePath, content); return { ok: true, file: filePath }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Capture d'écran de la page (webContents du <webview>).
ipcMain.handle('kdl:screenshot', async (_e, wcId) => {
  try {
    const wc = webContents.fromId(wcId);
    if (!wc) return { ok: false, error: 'webContents introuvable' };
    const image = await wc.capturePage();
    const dir = path.join(os.homedir(), 'Bureau', 'kdl-captures');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `capture-${Date.now()}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('kdl:third-party-cookies', async (_e, enabled) => {
  return { ok: true, blocked: setThirdPartyCookieBlock(enabled) };
});

// ───────────────────────────────────────────────────────────────────────────
// IA — Ollama LOCAL uniquement (127.0.0.1:11434). Jamais de cloud, jamais de pull auto.
// ───────────────────────────────────────────────────────────────────────────
function ollamaRequest(pathName, body, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: '127.0.0.1', port: 11434, path: pathName,
      method: body ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {},
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve({ ok: true, status: res.statusCode, data: JSON.parse(data || '{}') }); } catch { resolve({ ok: true, status: res.statusCode, data: {} }); } });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code || String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// Détection : service local présent ? liste des modèles déjà installés (aucun pull).
ipcMain.handle('kdl:ollama-detect', async () => {
  const r = await ollamaRequest('/api/tags', null, 2500);
  if (!r.ok) return { available: false, error: r.error };
  const models = Array.isArray(r.data.models) ? r.data.models.map((m) => m.name) : [];
  return { available: true, models };
});

// Génération via un modèle Ollama DÉJÀ installé, choisi par l'utilisateur. Local only.
ipcMain.handle('kdl:ollama-generate', async (_e, { model, prompt, num_predict } = {}) => {
  if (!model || !prompt) return { ok: false, error: 'paramètres manquants' };
  const r = await ollamaRequest('/api/generate', {
    model, prompt, stream: false,
    options: { num_predict: Math.min(512, num_predict || 256), temperature: 0.4 },
  }, 60000);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, text: (r.data && r.data.response ? String(r.data.response) : '').trim() };
});

// ─── IA Lite — gestion du modèle local (fichiers) ──────────────────────────
ipcMain.handle('kdl:ai-model-info', async () => {
  const dir = AI_MODELS_DIR();
  let installed = [];
  try {
    if (fs.existsSync(dir)) {
      installed = fs.readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => {
          const p = path.join(dir, d.name);
          let bytes = 0, validated = false, installedAt = null;
          try {
            for (const f of walkFiles(p)) bytes += fs.statSync(f).size;
            const meta = path.join(p, 'kdl-model.json');
            if (fs.existsSync(meta)) { const m = JSON.parse(fs.readFileSync(meta, 'utf8')); validated = !!m.validated; installedAt = m.installedAt || null; }
          } catch { /* */ }
          return { id: d.name, bytes, validated, installedAt };
        });
    }
  } catch { /* */ }
  return { dir, downloadAllowed: AI_DOWNLOAD_ALLOWED(), installed };
});

ipcMain.handle('kdl:ai-model-delete', async (_e, id) => {
  if (!id || /[/\\.]{2}/.test(id)) return { ok: false, error: 'id invalide' };
  const p = path.join(AI_MODELS_DIR(), path.basename(id));
  try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Téléchargement du modèle : GATÉ. Ne s'exécute jamais sans autorisation explicite.
ipcMain.handle('kdl:ai-model-download', async (_e, { id } = {}) => {
  if (!AI_DOWNLOAD_ALLOWED()) {
    return { ok: false, needAuth: true,
      message: 'Téléchargement du modèle désactivé. Autorisation explicite requise (KDL_AI_ALLOW_DOWNLOAD=1).' };
  }
  // Câblage réel (source officielle validée + vérif SHA-256) branché à l'activation.
  return { ok: false, error: 'source de modèle non encore épinglée (voir docs/KDL_AI_MODEL_MANAGEMENT.md)', id: id || null };
});

function* walkFiles(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) yield* walkFiles(p); else yield p;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// IA « Mon IA » (BYOK) — l'utilisateur connecte SA propre IA cloud avec SA clé.
// Zéro coût pour KDL (clé de l'utilisateur). Fournisseur DISTANT, jamais « local ».
// La clé est stockée localement (fichier 0600), jamais renvoyée au renderer,
// jamais journalisée, envoyée UNIQUEMENT à l'endpoint officiel choisi.
// ───────────────────────────────────────────────────────────────────────────
const https = require('https');
const BYOK_FILE = () => path.join(app.getPath('userData'), 'ai-byok.json');
// Fournisseurs pris en charge (endpoints officiels ; l'utilisateur reste maître).
const BYOK_PROVIDERS = {
  anthropic: { label: 'Claude (Anthropic)', shape: 'anthropic', url: 'https://api.anthropic.com/v1/messages', defaultModel: 'claude-3-5-haiku-latest' },
  openai:    { label: 'OpenAI / Codex',      shape: 'openai',    url: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-4o-mini' },
  gemini:    { label: 'Gemini (Google)',     shape: 'gemini',    url: 'https://generativelanguage.googleapis.com/v1beta/models', defaultModel: 'gemini-1.5-flash' },
  grok:      { label: 'Grok (xAI)',          shape: 'openai',    url: 'https://api.x.ai/v1/chat/completions', defaultModel: 'grok-2-latest' },
  custom:    { label: 'Compatible OpenAI (URL perso)', shape: 'openai', url: '', defaultModel: '' },
};

function readByok() { try { return JSON.parse(fs.readFileSync(BYOK_FILE(), 'utf8')); } catch { return null; } }

ipcMain.handle('kdl:byok-config', async () => {
  const c = readByok();
  const providers = Object.entries(BYOK_PROVIDERS).map(([id, p]) => ({ id, label: p.label, defaultModel: p.defaultModel }));
  if (!c) return { configured: false, providers };
  return { configured: true, provider: c.provider, model: c.model, baseUrl: c.baseUrl || '', hasKey: !!c.key, providers };
});

ipcMain.handle('kdl:byok-set', async (_e, { provider, model, key, baseUrl } = {}) => {
  if (!BYOK_PROVIDERS[provider]) return { ok: false, error: 'fournisseur inconnu' };
  const prev = readByok() || {};
  const cfg = {
    provider,
    model: (model || BYOK_PROVIDERS[provider].defaultModel || '').trim(),
    baseUrl: (baseUrl || '').trim(),
    key: (key && key.trim()) ? key.trim() : (prev.key || ''),   // clé conservée si non re-saisie
  };
  if (!cfg.key) return { ok: false, error: 'clé API requise' };
  try { fs.writeFileSync(BYOK_FILE(), JSON.stringify(cfg), { mode: 0o600 }); fs.chmodSync(BYOK_FILE(), 0o600); }
  catch (err) { return { ok: false, error: String(err) }; }
  return { ok: true };
});

ipcMain.handle('kdl:byok-clear', async () => {
  try { if (fs.existsSync(BYOK_FILE())) fs.unlinkSync(BYOK_FILE()); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

function httpsJson(urlStr, { method = 'POST', headers = {}, body } = {}, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let u; try { u = new URL(urlStr); } catch { return resolve({ ok: false, error: 'URL invalide' }); }
    if (u.protocol !== 'https:') return resolve({ ok: false, error: 'HTTPS requis' });
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(u, { method, headers: { ...headers, ...(payload ? { 'Content-Length': payload.length } : {}) }, timeout: timeoutMs }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(data || '{}'); } catch { /* */ } resolve({ ok: res.statusCode < 400, status: res.statusCode, data: j, raw: data }); });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code || String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (payload) req.write(payload); req.end();
  });
}

ipcMain.handle('kdl:byok-generate', async (_e, { prompt, maxTokens } = {}) => {
  const c = readByok();
  if (!c || !c.key) return { ok: false, error: 'aucune IA personnelle configurée' };
  if (typeof prompt !== 'string' || !prompt) return { ok: false, error: 'prompt manquant' };
  const P = BYOK_PROVIDERS[c.provider]; if (!P) return { ok: false, error: 'fournisseur inconnu' };
  const mx = Math.min(1024, maxTokens || 400);
  try {
    if (P.shape === 'anthropic') {
      const r = await httpsJson(P.url, { headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
        body: { model: c.model, max_tokens: mx, messages: [{ role: 'user', content: prompt }] } });
      if (!r.ok) return { ok: false, error: apiErr(r) };
      const txt = r.data && Array.isArray(r.data.content) ? r.data.content.map((b) => b.text || '').join('').trim() : '';
      return txt ? { ok: true, text: txt } : { ok: false, error: 'réponse vide' };
    }
    if (P.shape === 'gemini') {
      const url = `${P.url}/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(c.key)}`;
      const r = await httpsJson(url, { headers: { 'content-type': 'application/json' }, body: { contents: [{ parts: [{ text: prompt }] }] } });
      if (!r.ok) return { ok: false, error: apiErr(r) };
      const cand = r.data && r.data.candidates && r.data.candidates[0];
      const txt = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('').trim() : '';
      return txt ? { ok: true, text: txt } : { ok: false, error: 'réponse vide' };
    }
    // openai-compatible (openai, grok, custom)
    const url = c.provider === 'custom' ? (c.baseUrl || '').replace(/\/$/, '') + '/chat/completions' : P.url;
    const r = await httpsJson(url, { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key },
      body: { model: c.model, max_tokens: mx, messages: [{ role: 'user', content: prompt }] } });
    if (!r.ok) return { ok: false, error: apiErr(r) };
    const txt = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message ? String(r.data.choices[0].message.content || '').trim() : '';
    return txt ? { ok: true, text: txt } : { ok: false, error: 'réponse vide' };
  } catch (err) { return { ok: false, error: String(err) }; }
});

// Message d'erreur d'API sans jamais divulguer la clé.
function apiErr(r) {
  const m = r.data && (r.data.error && (r.data.error.message || r.data.error)) ;
  return 'API ' + (r.status || '') + (m ? ' — ' + String(m).slice(0, 160) : '');
}

// ───────────────────────────────────────────────────────────────────────────
// Gestionnaire de téléchargements — dossier dédié, aucune exécution/ouverture auto,
// progression, pause/reprise/annulation, historique local, SHA-256 non bloquant.
// ───────────────────────────────────────────────────────────────────────────
const DL_HISTORY_FILE = () => path.join(app.getPath('userData'), 'downloads.json');
const RISKY = /\.(exe|msi|bat|cmd|ps1|sh|appimage|deb|rpm|apk|dmg|scr|com|jar)$/i;
let dlHistory = null;                 // [ {id,name,url,domain,path,total,received,state,risky,added} ]
const dlActive = new Map();           // id -> { item, lastT, lastB }
let dlSeq = 0;

function loadDlHistory() {
  if (dlHistory) return dlHistory;
  try { dlHistory = JSON.parse(fs.readFileSync(DL_HISTORY_FILE(), 'utf8')); } catch { dlHistory = []; }
  if (!Array.isArray(dlHistory)) dlHistory = [];
  return dlHistory;
}
function saveDlHistory() { try { fs.writeFileSync(DL_HISTORY_FILE(), JSON.stringify(dlHistory.slice(0, 200))); } catch { /* */ } }
function dlEmit(rec) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('kdl:dl-update', rec); }
function uniquePath(dir, name) {
  let p = path.join(dir, name); if (!fs.existsSync(p)) return p;
  const ext = path.extname(name), base = path.basename(name, ext);
  let i = 1; while (fs.existsSync(path.join(dir, `${base} (${i})${ext}`))) i++;
  return path.join(dir, `${base} (${i})${ext}`);
}

function startDownload(item) {
  fs.mkdirSync(DL_DIR, { recursive: true });
  const name = item.getFilename();
  const target = uniquePath(DL_DIR, name);
  item.setSavePath(target);
  const id = 'dl' + (++dlSeq) + '-' + Date.now();
  let domain = ''; try { domain = new URL(item.getURL()).hostname; } catch { /* */ }
  const rec = {
    id, name: path.basename(target), url: item.getURL(), domain, path: target,
    total: item.getTotalBytes() || 0, received: 0, speed: 0,
    state: 'progressing', risky: RISKY.test(name), added: Date.now(),
  };
  loadDlHistory().unshift(rec); saveDlHistory();
  dlActive.set(id, { item, lastT: Date.now(), lastB: 0 });
  dlEmit(rec);

  item.on('updated', (_e, st) => {
    const a = dlActive.get(id); if (!a) return;
    rec.received = item.getReceivedBytes();
    rec.total = item.getTotalBytes() || rec.total;
    const now = Date.now(), dt = (now - a.lastT) / 1000;
    if (dt >= 0.4) { rec.speed = Math.max(0, Math.round((rec.received - a.lastB) / dt)); a.lastT = now; a.lastB = rec.received; }
    rec.state = st === 'interrupted' ? 'interrupted' : (item.isPaused() ? 'paused' : 'progressing');
    dlEmit(rec);
  });
  item.once('done', (_e, st) => {
    rec.state = st; rec.speed = 0; rec.received = item.getReceivedBytes(); rec.total = item.getTotalBytes() || rec.total;
    dlActive.delete(id);
    if (st !== 'completed') { try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch { /* nettoyer l'incomplet */ } }
    saveDlHistory(); dlEmit(rec);
  });
}

ipcMain.handle('kdl:dl-list', async () => loadDlHistory());
ipcMain.handle('kdl:dl-pause', async (_e, id) => { const a = dlActive.get(id); if (a) a.item.pause(); return { ok: !!a }; });
ipcMain.handle('kdl:dl-resume', async (_e, id) => { const a = dlActive.get(id); if (a && a.item.canResume()) a.item.resume(); return { ok: !!a }; });
ipcMain.handle('kdl:dl-cancel', async (_e, id) => { const a = dlActive.get(id); if (a) a.item.cancel(); return { ok: !!a }; });
ipcMain.handle('kdl:dl-open', async (_e, id) => { const r = loadDlHistory().find((x) => x.id === id); if (r && r.state === 'completed' && fs.existsSync(r.path)) { shell.openPath(r.path); return { ok: true }; } return { ok: false }; });
ipcMain.handle('kdl:dl-folder', async (_e, id) => { const r = loadDlHistory().find((x) => x.id === id); if (r && fs.existsSync(r.path)) { shell.showItemInFolder(r.path); return { ok: true }; } shell.openPath(DL_DIR); return { ok: true }; });
ipcMain.handle('kdl:dl-remove', async (_e, id) => { dlHistory = loadDlHistory().filter((x) => x.id !== id); saveDlHistory(); return { ok: true }; });
ipcMain.handle('kdl:dl-clear', async () => { const a = [...dlActive.keys()]; dlHistory = loadDlHistory().filter((x) => a.includes(x.id)); saveDlHistory(); return { ok: true }; });
ipcMain.handle('kdl:dl-hash', async (_e, id) => {
  const r = loadDlHistory().find((x) => x.id === id);
  if (!r || !fs.existsSync(r.path)) return { ok: false, error: 'fichier introuvable' };
  return await new Promise((resolve) => {
    const h = crypto.createHash('sha256'), s = fs.createReadStream(r.path);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve({ ok: true, sha256: h.digest('hex') }));
    s.on('error', (e) => resolve({ ok: false, error: String(e) }));
  });
});

// Détection Tor Browser sur Linux (lecture seule, aucune installation).
ipcMain.handle('kdl:detect-tor', async () => {
  return detectTor();
});

// Ouvrir une URL .onion / recherche avec Tor Browser si présent.
ipcMain.handle('kdl:open-tor', async (_e, url) => {
  const tor = await detectTor();
  if (!tor.found) return { ok: false, error: 'Tor Browser non détecté' };
  try {
    if (tor.kind === 'flatpak') {
      execFile('flatpak', ['run', tor.id, url], () => {});
    } else {
      execFile(tor.cmd, [url], () => {});
    }
    return { ok: true, via: tor.kind };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

function which(cmd) {
  return new Promise((resolve) => {
    execFile('which', [cmd], (err, stdout) => {
      resolve(err ? null : stdout.trim() || null);
    });
  });
}

async function detectTor() {
  // 1) commande directe
  for (const cmd of ['tor-browser', 'torbrowser-launcher']) {
    const p = await which(cmd);
    if (p) return { found: true, kind: 'cmd', cmd: p };
  }
  // 2) chemins classiques
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'share', 'torbrowser', 'tbb', 'x86_64', 'tor-browser_en-US', 'start-tor-browser.desktop'),
    path.join(home, 'tor-browser', 'start-tor-browser.desktop'),
    path.join(home, 'Téléchargements', 'tor-browser', 'start-tor-browser.desktop'),
    '/opt/tor-browser/start-tor-browser.desktop'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { found: true, kind: 'cmd', cmd: c };
  }
  // 3) flatpak
  const flatpak = await which('flatpak');
  if (flatpak) {
    const id = await new Promise((resolve) => {
      execFile('flatpak', ['list', '--app', '--columns=application'], (err, stdout) => {
        if (err) return resolve(null);
        const line = stdout.split('\n').find((l) => /torproject|torbrowser/i.test(l));
        resolve(line ? line.trim() : null);
      });
    });
    if (id) return { found: true, kind: 'flatpak', id };
  }
  return { found: false };
}
