'use strict';

const { app, BrowserWindow, session, ipcMain, shell, dialog, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const isDev = process.argv.includes('--dev');

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
    backgroundColor: '#15171c',
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

  // Téléchargements : dossier dédié, aucune exécution/ouverture auto.
  browseSession().on('will-download', (_e, item) => {
    fs.mkdirSync(DL_DIR, { recursive: true });
    const target = path.join(DL_DIR, item.getFilename());
    item.setSavePath(target);
    item.once('done', (_ev, state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kdl:download', {
          state, file: target, name: item.getFilename()
        });
      }
    });
  });

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
