'use strict';
// Bouton « Mettre à jour » (règle KDL TECH 22/11/2026) : visible et pulsé quand une version est
// disponible ou téléchargée ; un clic installe (quitAndInstall) seulement si elle est téléchargée.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const I18N = require('../src/i18n');

test('processus principal : état partagé, installation seulement une fois la mise à jour téléchargée', () => {
  const m = lire('main.js');
  assert.match(m, /autoUpdater\.on\('update-available', \(info\) => majSignaler\('disponible'/);
  assert.match(m, /majSignaler\('telechargee', info && info\.version\)/);
  assert.match(m, /if \(majEtat\.etat !== 'telechargee'\) return \{ ok: false/);
  assert.match(m, /setImmediate\(\(\) => majUpdater\.quitAndInstall\(\)\)/);
  assert.match(m, /setInterval\(\(\) => \{ if \(majEtat\.etat === 'aucune'\) autoUpdater\.checkForUpdates\(\)/);
  const p = lire('preload.js');
  for (const k of ['majEtat', 'majInstaller', 'onMaj']) assert.ok(p.includes(k + ':'), k);
});

test('bouton : caché par défaut, orange qui pulse, contour fixe si mouvements réduits', () => {
  assert.match(lire('index.html'), /<button id="btn-maj" class="ico-btn" type="button" hidden>/);
  const c = lire('kdl/kdl-style-f.css');
  assert.match(c, /#toolbar #btn-maj \{[^}]*background: #f59e0b;[^}]*animation: kdlMajPulse/);
  assert.match(c, /@keyframes kdlMajPulse/);
  assert.match(c, /prefers-reduced-motion: reduce\) \{ #toolbar #btn-maj \{ animation: none/);
});

function rendu(etatInitial) {
  const el = (id) => ({ id, hidden: true, textContent: '', title: '', attrs: {}, classes: new Set(),
    setAttribute(k, v) { this.attrs[k] = v; }, classList: { toggle(c, on) { on ? el.cls.add(c) : el.cls.delete(c); } } });
  el.cls = new Set();
  const btn = el('btn-maj'), lib = el('maj-lib');
  let ecoute = null, installs = 0, toasts = [];
  const ctx = {
    document: { getElementById: (id) => (id === 'btn-maj' ? btn : id === 'maj-lib' ? lib : null) },
    window: { kdl: { majEtat: () => Promise.resolve(etatInitial), majInstaller: () => { installs++; return Promise.resolve({ ok: true }); }, onMaj: (f) => { ecoute = f; } } },
    tr: (k, v) => I18N.t(k, v), toast: (t) => toasts.push(t),
  };
  const src = lire('renderer.js');
  const bloc = src.slice(src.lastIndexOf('// Mise à jour : bouton visible'));
  vm.runInNewContext(bloc, ctx);
  return { btn, lib, cls: el.cls, emettre: (s) => ecoute(s), installs: () => installs, toasts };
}

test('rendu : rien sans mise à jour, puis « Mise à jour x… », puis « Mettre à jour x » qui installe', async () => {
  I18N.setLang('fr');
  const r = rendu({ etat: 'aucune', version: null });
  await new Promise((ok) => setImmediate(ok));
  assert.strictEqual(r.btn.hidden, true);
  r.emettre({ etat: 'disponible', version: '1.9.0' });
  assert.strictEqual(r.btn.hidden, false);
  assert.match(r.lib.textContent, /^Mise à jour 1\.9\.0…$/);
  r.emettre({ etat: 'telechargee', version: '1.9.0' });
  assert.strictEqual(r.lib.textContent, 'Mettre à jour 1.9.0');
  assert.ok(r.cls.has('maj-prete'));
  await r.btn.onclick();
  assert.strictEqual(r.installs(), 1);
  assert.strictEqual(r.toasts.length, 1);
});

test('textes FR / EN / ES présents', () => {
  for (const l of ['fr', 'en', 'es']) for (const k of ['maj.btnDl', 'maj.btnPret', 'maj.titleDl', 'maj.titlePret', 'maj.redemarrage', 'maj.enCours']) assert.ok(I18N.DICT[l][k], l + ' ' + k);
});
