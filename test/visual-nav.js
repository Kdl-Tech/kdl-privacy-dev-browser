'use strict';
// Harnais de test visuel (local, jetable) : charge l'UI réelle, déclenche une
// navigation via la fonction navigate() du renderer, puis capture la fenêtre.
// Usage : DISPLAY=:0 electron test/visual-nav.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = process.env.SHOT_OUT || '/tmp/nav.png';
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
  await win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  await wait(1500);
  // Piloter le renderer comme un utilisateur : saisir une URL et naviguer.
  await win.webContents.executeJavaScript("navigate('https://duckduckgo.com'); 'ok'");
  await wait(5000);   // laisser le <webview> charger + remonter favicon/titre
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('shot:', OUT, img.getSize());
  app.quit();
});
