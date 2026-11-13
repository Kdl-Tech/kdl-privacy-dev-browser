'use strict';
// Thème clair / sombre : suit le système tant qu'aucun choix manuel n'est mémorisé.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INIT = path.join(__dirname, '..', 'src/theme-boot.js');
const SRC = path.join(__dirname, '..', 'src');
const lire = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

function monde(memo, sombre) {
  const attrs = {}; const ecoutes = [];
  const mq = { get matches() { return monde.sombre; }, addEventListener: (_t, f) => ecoutes.push(f) };
  monde.sombre = sombre;
  const store = Object.assign({}, memo);
  const ctx = {
    document: {
      documentElement: { dispatchEvent() {}, setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => (k in attrs ? attrs[k] : null) },
      readyState: 'complete', querySelectorAll: () => [], querySelector: () => null,
      addEventListener() {}, dispatchEvent() {}
    },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    addEventListener() {},
    matchMedia: () => mq
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return { ctx, attrs, ecoutes, store };
}
const lance = (m, f) => vm.runInContext(fs.readFileSync(f, 'utf8'), m.ctx);

test('sans choix mémorisé : suit le système (sombre / clair)', () => {
  let m = monde({}, true); lance(m, INIT); assert.equal(m.attrs['data-theme'], 'dark');
  m = monde({}, false); lance(m, INIT); assert.equal(m.attrs['data-theme'], 'light');
});
test('choix manuel mémorisé prioritaire sur le système', () => {
  let m = monde({ 'kdl-theme': 'light' }, true); lance(m, INIT); assert.equal(m.attrs['data-theme'], 'light');
  m = monde({ 'kdl-theme': 'dark' }, false); lance(m, INIT); assert.equal(m.attrs['data-theme'], 'dark');
});
test('Electron : nativeTheme.themeSource aligné (system sans choix manuel)', () => {
  assert.match(lire('main.js'), /ipcMain\.handle\('kdl:theme-source'[\s\S]*?nativeTheme\.themeSource = \['light', 'dark'\]\.includes\(src\) \? src : 'system'/);
  assert.match(lire('preload.js'), /setThemeSource: \(src\) => ipcRenderer\.invoke\('kdl:theme-source', src\)/);
  const r = lire('renderer.js');
  assert.match(r, /setThemeSource\(themeMemorise\(\) \|\| 'system'\)/);
  assert.match(r, /MQ_SOMBRE\.addEventListener\('change', \(\) => \{ if \(!themeMemorise\(\)\)/);
  assert.match(lire('index.html'), /<script src="theme-boot\.js"><\/script>/);
});
