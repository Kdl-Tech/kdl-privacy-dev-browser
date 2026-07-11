'use strict';
// Harnais de test visuel (local, jetable) : charge l'UI réelle, pilote le renderer,
// puis capture la fenêtre. Paramétrable par variables d'environnement :
//   NAV_URL  : URL à ouvrir (def. duckduckgo)   SHOT_OUT : png de sortie
//   POST_JS  : JS exécuté après navigation (ex. ouvrir le mode lecture)
//   WAIT_MS  : attente après POST_JS (def. 1500)
// Usage : DISPLAY=:0 electron test/visual-nav.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = process.env.SHOT_OUT || '/tmp/nav.png';
const NAV = process.env.NAV_URL || 'https://duckduckgo.com';
const POST = process.env.POST_JS || '';
const WAIT_MS = parseInt(process.env.WAIT_MS || '1500', 10);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 820, show: false, backgroundColor: '#020817',
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
    },
  });
  win.removeMenu();
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2) errors.push(message); });
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await wait(1400);
  await win.webContents.executeJavaScript(`navigate(${JSON.stringify(NAV)}); 'ok'`);
  await wait(5500);
  if (POST) { await win.webContents.executeJavaScript(POST + "; 'ok'"); await wait(WAIT_MS); }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('shot:', OUT, img.getSize());
  if (errors.length) console.log('CONSOLE_ERRORS:', errors.slice(0, 8).join(' | '));
  else console.log('CONSOLE_ERRORS: none');
  app.quit();
});
