'use strict';
// Génère les PNG de l'icône à partir de assets/icon.svg, via Electron (aucune dépendance externe).
// Usage : DISPLAY=:0 electron scripts/gen-icon.js --no-sandbox
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const assets = path.join(__dirname, '..', 'assets');
  const svg = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
  const html = `<!doctype html><meta charset="utf8">
    <style>html,body{margin:0;width:256px;height:256px;background:transparent}svg{width:256px;height:256px;display:block}</style>${svg}`;
  const win = new BrowserWindow({
    width: 256, height: 256, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', webPreferences: { offscreen: false }
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(assets, 'icon-256.png'), img.toPNG());
  fs.writeFileSync(path.join(assets, 'icon-128.png'), img.resize({ width: 128, height: 128 }).toPNG());
  fs.writeFileSync(path.join(assets, 'icon-48.png'), img.resize({ width: 48, height: 48 }).toPNG());
  console.log('PNG générés:', fs.readdirSync(assets).filter((f) => f.endsWith('.png')).join(', '));
  app.quit();
});
