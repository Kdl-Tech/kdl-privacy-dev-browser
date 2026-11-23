'use strict';
// Revue sécurité 22/11/2026 : IPC accepté seulement depuis la frame principale de src/index.html ;
// la fenêtre principale ne peut pas quitter index.html.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { expediteurSur, creerIpcSur } = require('../src/ipc-garde');

const PAGE = path.join(__dirname, '..', 'src', 'index.html');
const URL_UI = pathToFileURL(PAGE).href;
const frame = (url, extra = {}) => ({ url, parent: null, processId: 4, routingId: 1, ...extra });
const evt = (f, { type = 'window', main = frame(URL_UI) } = {}) => ({ senderFrame: f, sender: { getType: () => type, mainFrame: main } });
const opts = { page: PAGE, estFenetre: () => true };

test('accepté : frame principale de src/index.html (avec ?private=1)', () => {
  assert.strictEqual(expediteurSur(evt(frame(URL_UI)), opts), true);
  const p = frame(URL_UI + '?private=1');
  assert.strictEqual(expediteurSur(evt(p, { main: p }), opts), true);
});

test('refusé : autre page, sous-frame, webview, frame non principale, autre fichier, pas de fenêtre', () => {
  const web = frame('https://evil.example/');
  assert.strictEqual(expediteurSur(evt(web, { main: web }), opts), false);
  assert.strictEqual(expediteurSur(evt(frame(URL_UI, { parent: {} })), opts), false);
  assert.strictEqual(expediteurSur(evt(frame(URL_UI), { type: 'webview' }), opts), false);
  assert.strictEqual(expediteurSur(evt(frame(URL_UI, { routingId: 9 })), opts), false);
  const autre = frame(pathToFileURL(path.join(__dirname, '..', 'src', 'home.html')).href);
  assert.strictEqual(expediteurSur(evt(autre, { main: autre }), opts), false);
  const unc = frame('file://serveur/partage/src/index.html');
  assert.strictEqual(expediteurSur(evt(unc, { main: unc }), opts), false);
  assert.strictEqual(expediteurSur(evt(frame(URL_UI)), { page: PAGE, estFenetre: () => false }), false);
  assert.strictEqual(expediteurSur({}, opts), false);
  assert.strictEqual(expediteurSur(null, opts), false);
});

test('creerIpcSur : handle lève, on ignore pour un expéditeur refusé', async () => {
  const h = {}, o = {};
  const ipc = creerIpcSur({ handle: (c, f) => { h[c] = f; }, on: (c, f) => { o[c] = f; } }, opts);
  let n = 0;
  ipc.handle('kdl:x', () => 'ok'); ipc.on('kdl:y', () => { n++; });
  assert.strictEqual(h['kdl:x'](evt(frame(URL_UI))), 'ok');
  const web = frame('https://evil.example/');
  assert.throws(() => h['kdl:x'](evt(web, { main: web })), /refusé/);
  o['kdl:y'](evt(web, { main: web })); o['kdl:y'](evt(frame(URL_UI)));
  assert.strictEqual(n, 1);
});

test('main.js : tous les gestionnaires passent par la garde, fenêtre principale verrouillée sur index.html', () => {
  const m = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.strictEqual((m.match(/ipcMain\.(handle|on|once|handleOnce)\(/g) || []).length, 0, 'ipcMain utilisé sans garde');
  assert.ok((m.match(/\bipcSur\.(handle|on)\(/g) || []).length >= 50);
  assert.match(m, /win\.webContents\.on\('will-navigate', \(ev\) => ev\.preventDefault\(\)\)/);
  assert.match(m, /win\.webContents\.on\('will-redirect', \(ev\) => ev\.preventDefault\(\)\)/);
  assert.match(m, /win\.webContents\.setWindowOpenHandler\(/);
});
