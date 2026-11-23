'use strict';

const { app, BrowserWindow, session, ipcMain, shell, dialog, webContents, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { isThirdParty, shouldBlock } = require('./privacy');
const I18N = require('./i18n');
const Bookmarks = require('./bookmarks-import');
// Garde IPC : seule la frame principale de src/index.html peut appeler le processus principal.
const ipcSur = require('./ipc-garde').creerIpcSur(ipcMain, {
  page: path.join(__dirname, 'index.html'),
  estFenetre: (wc) => !!BrowserWindow.fromWebContents(wc),
});
const tr = I18N.t;

const isDev = process.argv.includes('--dev');

// Dossier des modèles IA locaux (hors Git, hors source). Créé à la demande.
const AI_MODELS_DIR = () => path.join(app.getPath('userData'), 'ai-models');
// Garde-fou téléchargement : aucun modèle n'est téléchargé sans autorisation explicite.
// Activé uniquement si KDL_AI_ALLOW_DOWNLOAD=1 (défini par l'utilisateur en connaissance de cause).
const AI_DOWNLOAD_ALLOWED = () => process.env.KDL_AI_ALLOW_DOWNLOAD === '1';

// Session réellement utilisée par les <webview> (doit matcher la partition de l'UI).
const PARTITION = 'persist:kdl';
const browseSession = () => session.fromPartition(PARTITION);
// Bureau localisé (XDG) : « Bureau », « Desktop »… et non un dossier français en dur.
const DL_DIR = path.join(app.getPath('desktop'), 'kdl-telechargements');

// --- Confidentialité : pas de télémétrie, blocage cookies tiers optionnel ---
app.setPath('userData', path.join(app.getPath('userData')));

let mainWindow = null;            // dernière fenêtre normale active (dialogues, messages)
let privSeq = 0;                  // numéro des fenêtres de navigation privée
let setupBrowseSession = () => {}; // défini au démarrage : protections communes à toute session de navigation
const allWins = () => BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
const dlgParent = () => BrowserWindow.getFocusedWindow() || mainWindow || undefined;
function broadcast(ch, data) { for (const w of allWins()) w.webContents.send(ch, data); }

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

// Langue de l'interface : langue du système par défaut, puis celle choisie dans le renderer.
ipcSur.handle('kdl:set-lang', (_e, lang) => ({ lang: I18N.setLang(lang) }));
// Thème : « system » tant que l'utilisateur n'a rien choisi, sinon son choix (light / dark).
ipcSur.handle('kdl:theme-source', (_e, src) => {
  nativeTheme.themeSource = ['light', 'dark'].includes(src) ? src : 'system';
  return { themeSource: nativeTheme.themeSource };
});
// Thème du système vu par Electron. Sous Linux, prefers-color-scheme reste « light » dans les pages
// même quand le système est sombre (nativeTheme.shouldUseDarkColors = true) : le renderer lit donc
// cette valeur au démarrage (synchrone, anti-flash) puis reçoit ses changements.
ipcSur.onSync('kdl:system-dark', () => nativeTheme.shouldUseDarkColors);
nativeTheme.on('updated', () => {
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('kdl:system-theme', nativeTheme.shouldUseDarkColors); } catch { /* fenêtre fermée */ }
  }
});

function createWindow(opts = {}) {
  const priv = !!opts.private;
  // Fenêtre privée : session en mémoire propre à la fenêtre (rien n'est écrit sur le disque),
  // effacée à sa fermeture. Fenêtre normale : session persistante habituelle.
  const part = priv ? 'kdl-private-' + (++privSeq) : PARTITION;
  if (priv) setupBrowseSession(session.fromPartition(part));
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 480,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#08121d' : '#EEF0EC',
    icon: path.join(__dirname, '..', 'assets', 'icon-256.png'),
    title: priv ? 'KDL Privacy Dev Browser — privé' : 'KDL Privacy Dev Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,        // requis pour <webview>
      spellcheck: false
    }
  });

  // Durcissement <webview> : aucune page ne reçoit de preload ni de Node, partition imposée.
  if (!priv || !mainWindow) mainWindow = win;
  win.on('focus', () => { if (!priv) mainWindow = win; });
  win.webContents.on('will-attach-webview', (_e, wp, params) => {
    delete wp.preload; delete wp.preloadURL;
    wp.nodeIntegration = false; wp.nodeIntegrationInSubFrames = false;
    wp.contextIsolation = true; wp.sandbox = true; wp.webSecurity = true;
    params.partition = part;
  });

  // La fenêtre principale ne quitte jamais src/index.html (lien glissé sur la barre d'outils, redirection…).
  win.webContents.on('will-navigate', (ev) => ev.preventDefault());
  win.webContents.on('will-redirect', (ev) => ev.preventDefault());

  win.removeMenu();
  win.loadFile(path.join(__dirname, 'index.html'), priv ? { query: { private: '1' } } : undefined);

  if (isDev) win.webContents.openDevTools({ mode: 'detach' });

  // Toute fenêtre/onglet externe demandé par l'UI -> navigateur système, jamais une fenêtre Electron sans contrôle.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    if (priv) session.fromPartition(part).clearStorageData().catch(() => {});
    if (mainWindow === win) mainWindow = allWins().find((w) => w !== win) || null;
  });
  return win;
}

// Mettre la fenêtre au premier plan sur la home (réutilisé par le protocole / 2e instance).
function focusHome() {
  if (!mainWindow || mainWindow.isDestroyed()) { createWindow(); return; }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// Bloqueur de pisteurs et de publicités (liste embarquée, actif par défaut).
const TRACKERS = new Set(require('./bloqueur-liste'));
let blockTrackers = true;
const blockedCount = new Map(); // webContentsId -> { top, n }
function installTrackerBlocker(ses) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    if (!blockTrackers) return cb({});
    let top = '';
    try { top = d.webContents && !d.webContents.isDestroyed() ? d.webContents.getURL() : ''; } catch { /* */ }
    if (!top || !shouldBlock(d.url, top, d.resourceType, TRACKERS)) return cb({});
    const id = d.webContents.id, c = blockedCount.get(id);
    if (c && c.top === top) c.n++; else blockedCount.set(id, { top, n: 1 });
    cb({ cancel: true });
  });
}

// Blocage cookies tiers (toggle depuis le renderer).
let block3p = false;
function setThirdPartyCookieBlock(enabled) { block3p = !!enabled; return block3p; }

// Retire Cookie (sortant) et Set-Cookie (entrant) des requêtes tierces de la session de navigation.
function installCookieFilter(ses) {
  const top = (d) => { try { return d.webContents && !d.webContents.isDestroyed() ? d.webContents.getURL() : ''; } catch { return ''; } };
  const third = (d) => block3p && d.resourceType !== 'mainFrame' && isThirdParty(d.url, top(d));
  ses.webRequest.onBeforeSendHeaders((d, cb) => {
    const h = d.requestHeaders;
    if (third(d)) for (const k of Object.keys(h)) if (/^cookie$/i.test(k)) delete h[k];
    cb({ requestHeaders: h });
  });
  ses.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    if (third(d)) for (const k of Object.keys(h)) if (/^set-cookie$/i.test(k)) delete h[k];
    cb({ responseHeaders: h });
  });
}

// Un 2e lancement (deep-link inclus) réveille la fenêtre existante sur la home.
app.on('second-instance', () => focusHome());
app.on('open-url', () => focusHome()); // macOS : protocole

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  // Permissions : refus par défaut des permissions sensibles ; choix par site respecté.
  const AUTO_ALLOW = ['fullscreen', 'clipboard-sanitized-write'];
  const handler = (wc, permission, cb, details) => {
    if (AUTO_ALLOW.includes(permission)) return cb(true);
    let origin = ''; try { origin = new URL((details && details.requestingUrl) || wc.getURL()).origin; } catch { /* */ }
    const decision = getPerm(origin, permission);
    cb(decision === 'allow');            // défaut (null) = refus
  };
  session.defaultSession.setPermissionRequestHandler(handler);
  // Mêmes protections pour toute session de navigation (normale et fenêtres privées).
  setupBrowseSession = (ses) => {
    ses.setPermissionRequestHandler(handler);
    installCookieFilter(ses);
    installTrackerBlocker(ses);
    // Téléchargements : gestionnaire dédié (dossier dédié, aucune exécution/ouverture auto).
    ses.on('will-download', (e, item, wc) => {
      if (tdlShouldTake(item.getURL())) {          // confié à TurboDL (repli local si absent)
        e.preventDefault();
        tdlTakeOver(item.getURL(), wc && !wc.isDestroyed() ? wc.getURL() : '');
        return;
      }
      startDownload(item);
    });
  };
  setupBrowseSession(browseSession());

  // Liens magnet cliqués dans une page : envoyés à TurboDL.
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    // WebRTC : ne pas divulguer les IP locales/VPN via les candidats ICE.
    wc.setWebRTCIPHandlingPolicy('default_public_interface_only');
    // window.open / target=_blank : nouvel onglet contrôlé, jamais de fenêtre Electron libre.
    wc.setWindowOpenHandler(({ url }) => {
      // Nouvel onglet dans la fenêtre qui contient la page (et donc dans sa session).
      const host = wc.hostWebContents;
      if (/^https?:/i.test(url) && host && !host.isDestroyed()) host.send('kdl:open-tab', url);
      return { action: 'deny' };
    });
    // Raccourcis du navigateur quand la page web a le focus (Ctrl+T, Ctrl+F, Ctrl+H, F11…) :
    // relayés à la fenêtre. Copier/coller, annuler, tout sélectionner restent à la page.
    wc.on('before-input-event', (ev, input) => {
      if (input.type !== 'keyDown') return;
      const k = String(input.key || '').toLowerCase();
      const c = input.control || input.meta;
      const hit = (c && !input.alt && ['t', 'w', 'n', 'h', 'f', 'p', 's', 'u', 'd', 'j', 'l', 'r', 'q', 'tab', '+', '=', '-', '0'].includes(k))
        || (c && input.shift && ['t', 'n', 'b', 'o', 'i', 'm'].includes(k))
        || ['f11', 'f12', 'f5'].includes(k)
        || (input.alt && !c && (k === 'arrowleft' || k === 'arrowright'));
      const host = wc.hostWebContents;
      if (!hit || !host || host.isDestroyed()) return;
      ev.preventDefault();
      host.send('kdl:shortcut', { key: input.key, control: input.control, meta: input.meta, shift: input.shift, alt: input.alt });
    });
    wc.on('will-navigate', (ev, url) => {
      if (/^magnet:/i.test(url)) { ev.preventDefault(); tdlSend(url, wc.getURL()).then((r) => tdlNotify(r, url)); }
    });
  });

  I18N.setLang(I18N.normalize(app.getLocale()) || 'fr');
  createWindow();

  // Mise à jour automatique via GitHub Releases (uniquement en version installée).
  // electron-updater vérifie l'empreinte SHA-512 publiée (latest.yml) avant d'installer.
  // L'état est aussi montré dans la barre d'outils : bouton « Mettre à jour » qui pulse.
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater');
      majUpdater = autoUpdater;
      autoUpdater.autoDownload = true;
      autoUpdater.on('update-available', (info) => majSignaler('disponible', info && info.version));
      autoUpdater.on('error', () => { if (majEtat.etat === 'disponible') majSignaler('aucune', null); });
      autoUpdater.on('update-downloaded', (info) => {
        majSignaler('telechargee', info && info.version);
        dialog.showMessageBox({
          type: 'info', buttons: [tr('upd.restart'), tr('upd.later')], defaultId: 0,
          title: tr('upd.title'),
          message: tr('upd.message', { v: info && info.version ? info.version : tr('upd.new') }),
          detail: tr('upd.detail'),
        }).then((r) => { if (r.response === 0) autoUpdater.quitAndInstall(); });
      });
      autoUpdater.checkForUpdatesAndNotify();
      // Navigateur laissé ouvert des jours : nouvelle vérification toutes les 6 h.
      setInterval(() => { if (majEtat.etat === 'aucune') autoUpdater.checkForUpdates().catch(() => {}); }, 6 * 3600 * 1000);
    } catch { /* electron-updater indisponible : démarrage normal */ }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Mise à jour : état partagé avec la barre d'outils (bouton qui pulse, règle KDL TECH 22/11/2026).
//   aucune → disponible (téléchargement en cours) → telechargee (un clic : installer et redémarrer).
let majUpdater = null;
let majEtat = { etat: 'aucune', version: null };
function majSignaler(etat, version) {
  majEtat = { etat, version: version ? String(version).slice(0, 40) : null };
  for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('kdl:maj', majEtat); } catch { /* fenêtre fermée */ } }
}
ipcSur.handle('kdl:maj-etat', () => majEtat);
ipcSur.handle('kdl:maj-installer', () => {
  if (!majUpdater) return { ok: false, raison: 'dev' };
  if (majEtat.etat !== 'telechargee') return { ok: false, raison: majEtat.etat === 'disponible' ? 'en_cours' : 'a_jour' };
  setImmediate(() => majUpdater.quitAndInstall());
  return { ok: true };
});

// « Effacer à la fermeture » : fiable ici (le beforeunload du renderer n'attend pas l'IPC async).
let clearOnClose = false, clearedOnQuit = false;
ipcSur.handle('kdl:clear-on-close', (_e, on) => { clearOnClose = !!on; return { ok: true }; });
app.on('before-quit', (e) => {
  if (!clearOnClose || clearedOnQuit) return;
  e.preventDefault(); clearedOnQuit = true;
  const ses = browseSession();
  ses.clearStorageData().then(() => ses.clearCache()).catch(() => {}).finally(() => app.quit());
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
ipcSur.handle('kdl:clear-site-data', async (_e, origin) => {
  const ses = browseSession();
  const opts = { storages: ['cookies', 'localstorage', 'caches', 'cachestorage', 'indexdb', 'serviceworkers', 'shadercache', 'websql'] };
  if (origin) opts.origin = origin;
  await ses.clearStorageData(opts);
  await ses.clearCache();
  return { ok: true, origin: origin || 'all' };
});

// Effacer toutes les données de navigation (fermeture / bouton) — persist:kdl uniquement.
ipcSur.handle('kdl:clear-all', async () => {
  const ses = browseSession();
  await ses.clearStorageData();
  await ses.clearCache();
  return { ok: true };
});

// Ouverture externe contrôlée (lien GitHub « À propos », etc.).
ipcSur.handle('kdl:open-external', (_e, url) => {
  if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { ok: true }; }
  return { ok: false };
});

// Métadonnées « À propos ».
// Fenêtres, plein écran, quitter, enregistrer la page (menu « comme Chrome »).
ipcSur.handle('kdl:new-window', (_e, priv) => { createWindow({ private: !!priv }); return { ok: true }; });
ipcSur.handle('kdl:fullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return { ok: false };
  w.setFullScreen(!w.isFullScreen()); return { ok: true, on: w.isFullScreen() };
});
ipcSur.handle('kdl:quit', () => { app.quit(); return { ok: true }; });
ipcSur.handle('kdl:save-page', async (e, wcId) => {
  const wc = webContents.fromId(Number(wcId));
  if (!wc || wc.isDestroyed() || wc.getType() !== 'webview' || wc.hostWebContents !== e.sender) return { ok: false };
  const base = (wc.getTitle() || 'page').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || 'page';
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender) || dlgParent(), {
    defaultPath: path.join(app.getPath('downloads'), base + '.html'),
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try { await wc.savePage(filePath, 'HTMLComplete'); return { ok: true, file: filePath }; }
  catch (err) { return { ok: false, error: String(err && err.message || err) }; }
});

ipcSur.handle('kdl:about', () => ({ name: 'KDL Privacy Dev Browser', version: app.getVersion() }));

// Export favoris -> fichier JSON local (aucun cloud).
ipcSur.handle('kdl:export-favs', async (_e, data) => {
  const { canceled, filePath } = await dialog.showSaveDialog(dlgParent(), {
    title: tr('dlg.exportFavs'),
    defaultPath: path.join(app.getPath('desktop'), 'kdl-favoris.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); return { ok: true, file: filePath }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Import favoris : fichier local choisi par l'utilisateur — JSON KDL ou HTML (format Netscape,
// exporté par tous les navigateurs). Renvoie des favoris nettoyés ; fusion côté renderer.
ipcSur.handle('kdl:import-favs', async (_e, kind) => {
  const html = kind === 'html';
  const { canceled, filePaths } = await dialog.showOpenDialog(dlgParent(), {
    title: tr('dlg.importFavs'), properties: ['openFile'],
    filters: html ? [{ name: 'HTML', extensions: ['html', 'htm'] }] : [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };
  try { return { ok: true, data: Bookmarks.readUserFile(filePaths[0], html ? 'html' : 'json') }; }
  catch { return { ok: false, error: tr('favs.invalidFile') }; }
});

// Favoris des autres navigateurs installés (Chrome, Edge, Brave, Opera, Vivaldi, Chromium, Firefox).
// Lecture 100 % locale ; les chemins restent ici, le renderer ne connaît que des identifiants.
let bmSources = new Map();
ipcSur.handle('kdl:bm-detect', async () => {
  let found = [];
  try { found = Bookmarks.detectSources(); } catch { found = []; }
  bmSources = new Map(found.map((s) => [s.id, s]));
  return found.map((s) => {
    let count = 0; let error = '';
    try { count = Bookmarks.readSource(s).length; }
    catch (err) { error = s.kind === 'firefox' ? 'firefox' : 'read'; }
    return { id: s.id, browserId: s.browserId, browser: s.browser, profile: s.profile, kind: s.kind, count, error };
  });
});
ipcSur.handle('kdl:bm-read', async (_e, ids) => {
  const items = []; let failed = 0;
  for (const id of Array.isArray(ids) ? ids.slice(0, 64) : []) {
    const s = bmSources.get(String(id));
    if (!s) { failed++; continue; }
    try { items.push(...Bookmarks.readSource(s)); } catch { failed++; }
  }
  return { ok: true, data: items, failed };
});

// Enregistrement local d'un texte (export Markdown du mode lecture, etc.).
// Aucun cloud ; dialogue natif ; l'utilisateur choisit la destination.
ipcSur.handle('kdl:save-text', async (_e, { name, content } = {}) => {
  if (typeof content !== 'string') return { ok: false, error: tr('err.badContent') };
  const safe = (name || 'kdl-export.txt').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const { canceled, filePath } = await dialog.showSaveDialog(dlgParent(), {
    title: tr('common.save'), defaultPath: path.join(app.getPath('desktop'), safe),
  });
  if (canceled || !filePath) return { ok: false, canceled: true };
  try { fs.writeFileSync(filePath, content); return { ok: true, file: filePath }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Capture d'écran de la page (webContents du <webview>).
ipcSur.handle('kdl:screenshot', async (_e, wcId) => {
  try {
    const wc = webContents.fromId(wcId);
    if (!wc) return { ok: false, error: tr('err.noWc') };
    const image = await wc.capturePage();
    const dir = path.join(app.getPath('desktop'), 'kdl-captures');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `capture-${Date.now()}.png`);
    fs.writeFileSync(file, image.toPNG());
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcSur.handle('kdl:trackers', async (_e, enabled) => { blockTrackers = enabled !== false; return { ok: true, enabled: blockTrackers }; });
ipcSur.handle('kdl:trackers-count', async (_e, wcId) => {
  const c = blockedCount.get(Number(wcId));
  let top = '';
  try { const { webContents } = require('electron'); const wc = webContents.fromId(Number(wcId)); top = wc ? wc.getURL() : ''; } catch { /* */ }
  return { enabled: blockTrackers, count: c && c.top === top ? c.n : 0, list: TRACKERS.size };
});

ipcSur.handle('kdl:third-party-cookies', async (_e, enabled) => {
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
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: tr('err.timeout') }); });
    if (payload) req.write(payload);
    req.end();
  });
}

// Détection : service local présent ? liste des modèles déjà installés (aucun pull).
ipcSur.handle('kdl:ollama-detect', async () => {
  const r = await ollamaRequest('/api/tags', null, 2500);
  if (!r.ok) return { available: false, error: r.error };
  const models = Array.isArray(r.data.models) ? r.data.models.map((m) => m.name) : [];
  return { available: true, models };
});

// Génération via un modèle Ollama DÉJÀ installé, choisi par l'utilisateur. Local only.
ipcSur.handle('kdl:ollama-generate', async (_e, { model, prompt, num_predict } = {}) => {
  if (!model || !prompt) return { ok: false, error: tr('err.missingParams') };
  const r = await ollamaRequest('/api/generate', {
    model, prompt, stream: false,
    options: { num_predict: Math.min(512, num_predict || 256), temperature: 0.4 },
  }, 60000);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, text: (r.data && r.data.response ? String(r.data.response) : '').trim() };
});

// ─── IA Lite — gestion du modèle local (fichiers) ──────────────────────────
ipcSur.handle('kdl:ai-model-info', async () => {
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

ipcSur.handle('kdl:ai-model-delete', async (_e, id) => {
  if (!id || /[/\\.]{2}/.test(id)) return { ok: false, error: tr('err.badId') };
  const p = path.join(AI_MODELS_DIR(), path.basename(id));
  try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

// Téléchargement du modèle : GATÉ. Ne s'exécute jamais sans autorisation explicite.
ipcSur.handle('kdl:ai-model-download', async (_e, { id } = {}) => {
  if (!AI_DOWNLOAD_ALLOWED()) {
    return { ok: false, needAuth: true,
      message: tr('err.dlDisabled') };
  }
  // Câblage réel (source officielle validée + vérif SHA-256) branché à l'activation.
  return { ok: false, error: tr('err.notPinned'), id: id || null };
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

ipcSur.handle('kdl:byok-config', async () => {
  const c = readByok();
  const providers = Object.entries(BYOK_PROVIDERS).map(([id, p]) => ({ id, label: id === 'custom' ? tr('byok.custom') : p.label, defaultModel: p.defaultModel }));
  if (!c) return { configured: false, providers };
  return { configured: true, provider: c.provider, model: c.model, baseUrl: c.baseUrl || '', hasKey: !!c.key, providers };
});

ipcSur.handle('kdl:byok-set', async (_e, { provider, model, key, baseUrl } = {}) => {
  if (!BYOK_PROVIDERS[provider]) return { ok: false, error: tr('err.unknownProvider') };
  const prev = readByok() || {};
  const cfg = {
    provider,
    model: (model || BYOK_PROVIDERS[provider].defaultModel || '').trim(),
    baseUrl: (baseUrl || '').trim(),
    key: (key && key.trim()) ? key.trim() : (prev.key || ''),   // clé conservée si non re-saisie
  };
  if (!cfg.key) return { ok: false, error: tr('err.keyRequired') };
  try { fs.writeFileSync(BYOK_FILE(), JSON.stringify(cfg), { mode: 0o600 }); fs.chmodSync(BYOK_FILE(), 0o600); }
  catch (err) { return { ok: false, error: String(err) }; }
  return { ok: true };
});

ipcSur.handle('kdl:byok-clear', async () => {
  try { if (fs.existsSync(BYOK_FILE())) fs.unlinkSync(BYOK_FILE()); return { ok: true }; }
  catch (err) { return { ok: false, error: String(err) }; }
});

function httpsJson(urlStr, { method = 'POST', headers = {}, body } = {}, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let u; try { u = new URL(urlStr); } catch { return resolve({ ok: false, error: tr('err.badUrl') }); }
    if (u.protocol !== 'https:') return resolve({ ok: false, error: tr('err.httpsRequired') });
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(u, { method, headers: { ...headers, ...(payload ? { 'Content-Length': payload.length } : {}) }, timeout: timeoutMs }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(data || '{}'); } catch { /* */ } resolve({ ok: res.statusCode < 400, status: res.statusCode, data: j, raw: data }); });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.code || String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: tr('err.timeout') }); });
    if (payload) req.write(payload); req.end();
  });
}

ipcSur.handle('kdl:byok-generate', async (_e, { prompt, maxTokens } = {}) => {
  const c = readByok();
  if (!c || !c.key) return { ok: false, error: tr('err.noByok') };
  if (typeof prompt !== 'string' || !prompt) return { ok: false, error: tr('err.noPrompt') };
  const P = BYOK_PROVIDERS[c.provider]; if (!P) return { ok: false, error: tr('err.unknownProvider') };
  const mx = Math.min(1024, maxTokens || 400);
  try {
    if (P.shape === 'anthropic') {
      const r = await httpsJson(P.url, { headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01' },
        body: { model: c.model, max_tokens: mx, messages: [{ role: 'user', content: prompt }] } });
      if (!r.ok) return { ok: false, error: apiErr(r) };
      const txt = r.data && Array.isArray(r.data.content) ? r.data.content.map((b) => b.text || '').join('').trim() : '';
      return txt ? { ok: true, text: txt } : { ok: false, error: tr('err.empty') };
    }
    if (P.shape === 'gemini') {
      const url = `${P.url}/${encodeURIComponent(c.model)}:generateContent?key=${encodeURIComponent(c.key)}`;
      const r = await httpsJson(url, { headers: { 'content-type': 'application/json' }, body: { contents: [{ parts: [{ text: prompt }] }] } });
      if (!r.ok) return { ok: false, error: apiErr(r) };
      const cand = r.data && r.data.candidates && r.data.candidates[0];
      const txt = cand && cand.content && cand.content.parts ? cand.content.parts.map((p) => p.text || '').join('').trim() : '';
      return txt ? { ok: true, text: txt } : { ok: false, error: tr('err.empty') };
    }
    // openai-compatible (openai, grok, custom)
    const url = c.provider === 'custom' ? (c.baseUrl || '').replace(/\/$/, '') + '/chat/completions' : P.url;
    const r = await httpsJson(url, { headers: { 'content-type': 'application/json', authorization: 'Bearer ' + c.key },
      body: { model: c.model, max_tokens: mx, messages: [{ role: 'user', content: prompt }] } });
    if (!r.ok) return { ok: false, error: apiErr(r) };
    const txt = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message ? String(r.data.choices[0].message.content || '').trim() : '';
    return txt ? { ok: true, text: txt } : { ok: false, error: tr('err.empty') };
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
function dlEmit(rec) { broadcast('kdl:dl-update', rec); }
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

ipcSur.handle('kdl:dl-list', async () => loadDlHistory());
ipcSur.handle('kdl:dl-pause', async (_e, id) => { const a = dlActive.get(id); if (a) a.item.pause(); return { ok: !!a }; });
ipcSur.handle('kdl:dl-resume', async (_e, id) => { const a = dlActive.get(id); if (a && a.item.canResume()) a.item.resume(); return { ok: !!a }; });
ipcSur.handle('kdl:dl-cancel', async (_e, id) => { const a = dlActive.get(id); if (a) a.item.cancel(); return { ok: !!a }; });
ipcSur.handle('kdl:dl-open', async (_e, id) => { const r = loadDlHistory().find((x) => x.id === id); if (r && r.state === 'completed' && fs.existsSync(r.path)) { shell.openPath(r.path); return { ok: true }; } return { ok: false }; });
ipcSur.handle('kdl:dl-folder', async (_e, id) => { const r = loadDlHistory().find((x) => x.id === id); if (r && fs.existsSync(r.path)) { shell.showItemInFolder(r.path); return { ok: true }; } shell.openPath(DL_DIR); return { ok: true }; });
ipcSur.handle('kdl:dl-remove', async (_e, id) => { dlHistory = loadDlHistory().filter((x) => x.id !== id); saveDlHistory(); return { ok: true }; });
ipcSur.handle('kdl:dl-clear', async () => { const a = [...dlActive.keys()]; dlHistory = loadDlHistory().filter((x) => a.includes(x.id)); saveDlHistory(); return { ok: true }; });
// ─── Centre de confidentialité — permissions par site + cookies/données ────
const PERM_FILE = () => path.join(app.getPath('userData'), 'permissions.json');
let permStore = null;
function loadPerms() { if (permStore) return permStore; try { permStore = JSON.parse(fs.readFileSync(PERM_FILE(), 'utf8')); } catch { permStore = {}; } return permStore; }
function savePerms() { try { fs.writeFileSync(PERM_FILE(), JSON.stringify(permStore)); } catch { /* */ } }
function getPerm(origin, name) { const s = loadPerms(); return (s[origin] && s[origin][name]) || null; }

ipcSur.handle('kdl:perm-get', async (_e, origin) => (loadPerms()[origin] || {}));
ipcSur.handle('kdl:perm-set', async (_e, { origin, name, value }) => {
  const s = loadPerms(); if (!origin || !name) return { ok: false };
  s[origin] = s[origin] || {};
  if (value === 'default' || value == null) delete s[origin][name]; else s[origin][name] = value;
  if (!Object.keys(s[origin]).length) delete s[origin];
  savePerms(); return { ok: true };
});
ipcSur.handle('kdl:perm-reset', async (_e, origin) => { const s = loadPerms(); delete s[origin]; savePerms(); return { ok: true }; });

// Infos site : cookies + estimation stockage (session de navigation persist:kdl).
ipcSur.handle('kdl:site-info', async (_e, origin) => {
  const ses = browseSession();
  let cookies = 0;
  try { const c = await ses.cookies.get(origin ? { domain: new URL(origin).hostname } : {}); cookies = c.length; } catch { /* */ }
  const perms = loadPerms()[origin] || {};
  return { cookies, perms };
});
// Effacer cookies d'un site (sans toucher aux favoris/préférences UI).
ipcSur.handle('kdl:site-clear-cookies', async (_e, origin) => {
  const ses = browseSession();
  try {
    const host = origin ? new URL(origin).hostname : null;
    const list = await ses.cookies.get(host ? { domain: host } : {});
    for (const c of list) {
      const url = (c.secure ? 'https://' : 'http://') + (c.domain.startsWith('.') ? c.domain.slice(1) : c.domain) + c.path;
      try { await ses.cookies.remove(url, c.name); } catch { /* */ }
    }
    return { ok: true, removed: list.length };
  } catch (err) { return { ok: false, error: String(err) }; }
});

ipcSur.handle('kdl:dl-hash', async (_e, id) => {
  const r = loadDlHistory().find((x) => x.id === id);
  if (!r || !fs.existsSync(r.path)) return { ok: false, error: tr('err.fileNotFound') };
  return await new Promise((resolve) => {
    const h = crypto.createHash('sha256'), s = fs.createReadStream(r.path);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve({ ok: true, sha256: h.digest('hex') }));
    s.on('error', (e) => resolve({ ok: false, error: String(e) }));
  });
});

// Détection Tor Browser sur Linux (lecture seule, aucune installation).
ipcSur.handle('kdl:detect-tor', async () => {
  return detectTor();
});

// Ouvrir une URL .onion / recherche avec Tor Browser si présent.
ipcSur.handle('kdl:open-tor', async (_e, url) => {
  const tor = await detectTor();
  if (!tor.found) return { ok: false, error: tr('tor.notDetected') };
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

// ===========================================================================
// TurboDL : gestionnaire de téléchargements KDL TECH (pont local 127.0.0.1)
// Même protocole que l'extension navigateur de TurboDL : rien ne sort de la machine.
// ===========================================================================
const TDL_PORT = 47321;
const TDL_ORIGIN = 'chrome-extension://meihfeagmipglccincpdabodlikepcmo';
const TDL_FILE = () => path.join(app.getPath('userData'), 'turbodl.json');
const tdlBypass = new Set();                 // liens rendus au gestionnaire intégré
let tdlCfg = null;
function tdlConfig() {
  if (!tdlCfg) { try { tdlCfg = JSON.parse(fs.readFileSync(TDL_FILE(), 'utf8')); } catch { tdlCfg = {}; } }
  return tdlCfg;
}
function tdlSave() { try { fs.writeFileSync(TDL_FILE(), JSON.stringify(tdlCfg)); } catch { /* */ } }

function tdlPost(route, body, timeout) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = http.request({
      host: '127.0.0.1', port: TDL_PORT, path: route, method: 'POST', timeout,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, Origin: TDL_ORIGIN },
    }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (c) => { if (buf.length < 65536) buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false, error: tr('err.unreadable') }); } });
    });
    req.on('timeout', () => req.destroy(new Error(tr('err.timeout'))));
    req.on('error', () => resolve({ ok: false, offline: true, error: tr('tdl.offline') }));
    req.end(data);
  });
}

async function tdlSend(url, referrer) {
  url = String(url || '').trim();
  if (!/^(https?:|magnet:)/i.test(url)) return { ok: false, error: tr('tdl.unsupported') };
  const body = { url, referrer: referrer || '', userAgent: browseSession().getUserAgent() };
  if (/^https?:/i.test(url)) {
    try {   // cookies du site : nécessaires pour les liens de téléchargement protégés
      const ck = await browseSession().cookies.get({ url });
      if (ck.length) body.cookies = ck.map((c) => `${c.name}=${c.value}`).join('; ');
    } catch { /* */ }
  }
  return tdlPost('/add', body, 30000);
}

function tdlNotify(r, url) {
  if (allWins().length) broadcast('kdl:tdl-event', { ok: !!r.ok, error: r.error || '', name: r.name || '', url });
}

function tdlShouldTake(url) {
  if (!tdlConfig().intercept || tdlBypass.has(url)) { tdlBypass.delete(url); return false; }
  return /^https?:/i.test(url);
}

async function tdlTakeOver(url, referrer) {
  const r = await tdlSend(url, referrer);
  tdlNotify(r, url);
  if (!r.ok) { tdlBypass.add(url); browseSession().downloadURL(url); }   // repli : gestionnaire intégré
}

ipcSur.handle('kdl:tdl-status', async () => {
  const r = await tdlPost('/ping', {}, 2500);
  return { running: !!r.ok, version: r.version || '', intercept: !!tdlConfig().intercept };
});
ipcSur.handle('kdl:tdl-send', async (_e, { url, referrer } = {}) => tdlSend(url, referrer));
ipcSur.handle('kdl:tdl-intercept', async (_e, on) => { tdlConfig().intercept = !!on; tdlSave(); return { ok: true, intercept: !!on }; });
ipcSur.handle('kdl:tdl-launch', async () => {
  const cands = [path.join(os.homedir(), 'Desktop', 'TurboDL.exe'), path.join(os.homedir(), 'Bureau', 'TurboDL.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'TurboDL', 'TurboDL.exe')];
  const exe = cands.find((p) => p && fs.existsSync(p));
  if (exe) { const err = await shell.openPath(exe); return { ok: !err, error: err }; }
  shell.openExternal('https://kdl-tech.fr/logiciels/turbodl/');
  return { ok: false, error: tr('tdl.notFoundPage') };
});
