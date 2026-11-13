'use strict';
// Import des favoris d'autres navigateurs : parseurs, dédoublonnage, détection des profils.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../src/bookmarks-core');
const Imp = require('../src/bookmarks-import');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'kdl-bm-test-'));

const CHROMIUM = {
  checksum: 'x', version: 1,
  roots: {
    bookmark_bar: { type: 'folder', name: 'Barre de favoris', children: [
      { type: 'url', name: 'KDL TECH', url: 'https://kdl-tech.fr/' },
      { type: 'folder', name: 'Dev', children: [
        { type: 'url', name: 'MDN', url: 'https://developer.mozilla.org/' },
        { type: 'url', name: 'Signet JS', url: 'javascript:alert(1)' },
        { type: 'folder', name: 'Outils', children: [{ type: 'url', name: 'Node', url: 'http://nodejs.org/' }] },
      ] },
    ] },
    other: { type: 'folder', name: 'Autres favoris', children: [
      { type: 'url', name: 'Doublon', url: 'https://kdl-tech.fr/' },
      { type: 'url', name: 'Fichier', url: 'file:///etc/passwd' },
    ] },
    synced: { type: 'folder', name: 'Mobile', children: [] },
  },
};

const NETSCAPE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1" PERSONAL_TOOLBAR_FOLDER="true">Barre &amp; outils</H3>
    <DL><p>
        <DT><A HREF="https://kdl-tech.fr/" ADD_DATE="1" ICON="data:image/png;base64,AAAA">KDL &#233;t&eacute; &lt;TECH&gt;</A>
        <DT><H3>Sous-dossier</H3>
        <DL><p>
            <DT><A HREF='https://example.org/a?x=1&amp;y=2'>Exemple</A>
        </DL><p>
        <DT><A HREF="data:text/html,coucou">Données</A>
    </DL><p>
    <DT><A HREF="http://racine.example/">Racine</A>
    <DT><A HREF="https://kdl-tech.fr/">Doublon</A>
</DL><p>`;

test('Chromium : JSON Bookmarks lu, dossiers conservés en chemin, seulement http(s)', () => {
  const raw = core.parseChromiumJson(JSON.stringify(CHROMIUM));
  assert.equal(raw.length, 6);
  const items = core.cleanItems(raw);
  assert.deepEqual(items.map((i) => i.url), ['https://kdl-tech.fr/', 'https://developer.mozilla.org/', 'http://nodejs.org/']);
  assert.equal(items[1].folder, 'Dev');
  assert.equal(items[2].folder, 'Dev / Outils');
  assert.equal(items[0].folder, '');
  assert.throws(() => core.parseChromiumJson('{"a":1}'));
});

test('HTML Netscape : entités décodées, dossiers imbriqués, schémas non web rejetés', () => {
  const items = core.cleanItems(core.parseNetscapeHtml(NETSCAPE));
  assert.deepEqual(items.map((i) => i.url), ['https://kdl-tech.fr/', 'https://example.org/a?x=1&y=2', 'http://racine.example/']);
  assert.equal(items[0].title, 'KDL été <TECH>');
  assert.equal(items[0].folder, 'Barre & outils');
  assert.equal(items[1].folder, 'Barre & outils / Sous-dossier');
  assert.equal(items[2].folder, '');
  assert.throws(() => core.parseNetscapeHtml('<html><body>rien</body></html>'));
});

test('Dédoublonnage et fusion dans la liste plate existante', () => {
  const existing = [{ title: 'Déjà là', url: 'https://kdl-tech.fr/', domain: 'kdl-tech.fr', added: 1 }];
  const incoming = [
    { title: 'A', url: 'https://kdl-tech.fr/' },               // déjà présent
    { title: '', url: ' https://b.example/ ' },                 // titre vide -> URL ; espaces retirés
    { title: 'B bis', url: 'https://b.example/' },              // doublon dans le lot
    { title: 'C', url: 'ftp://c.example/' },                    // non http(s)
    { title: 'D', url: 'javascript:void(0)' },
    { title: 'E', url: 'https://e.example/', folder: 'Dossier' },
    null,
  ];
  const r = core.mergeInto(existing, incoming, 42);
  assert.equal(r.added, 2);
  assert.equal(r.skipped, 5);
  assert.equal(r.list.length, 3);
  assert.deepEqual(r.list[1], { title: 'https://b.example/', url: 'https://b.example/', domain: 'b.example', added: 42 });
  assert.equal(r.list[2].folder, 'Dossier');
  assert.equal(existing.length, 1, 'la liste d’origine n’est pas modifiée');
  assert.equal(core.isWebUrl('https://'), false);
  assert.equal(core.isWebUrl('HTTPS://Exemple.FR/x'), true);
});

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch { /* Node trop ancien */ }

function makeFirefoxDb(file) {
  const db = new sqlite.DatabaseSync(file);
  db.exec(`
    CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER DEFAULT 0);
    CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, parent INTEGER,
      position INTEGER, title TEXT, guid TEXT);
    INSERT INTO moz_places VALUES (1,'https://www.mozilla.org/','Mozilla',3),(2,'https://kdl-tech.fr/','Site',1),
      (3,'place:sort=8','Récents',0),(4,'https://historique-seul.example/','Visité, pas en favori',9),
      (5,'https://dans-tag.example/','Tag',0),(6,'http://outils.example/',NULL,0);
    INSERT INTO moz_bookmarks VALUES
      (1,2,NULL,0,0,'','root________'),(2,2,NULL,1,0,'menu','menu________'),
      (3,2,NULL,1,1,'toolbar','toolbar_____'),(4,2,NULL,1,2,'tags','tags________'),
      (5,2,NULL,1,3,'unfiled','unfiled_____'),
      (10,1,1,3,0,'Mozilla (barre)','a1'),(11,2,NULL,2,0,'Travail','f1'),(12,1,2,11,0,NULL,'a2'),
      (13,1,3,3,1,'Requête','a3'),(14,2,NULL,4,0,'mon-tag','t1'),(15,1,5,14,0,NULL,'a4'),
      (16,2,NULL,11,1,'Outils','f2'),(17,1,6,16,0,'Outils web','a5'),(18,1,2,16,1,'Doublon','a6');
  `);
  db.close();
}

test('Firefox : places.sqlite lu sur une copie, tags et historique ignorés', { skip: !sqlite && 'node:sqlite indisponible' }, () => {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'places.sqlite');
    makeFirefoxDb(file);
    const raw = Imp.readFirefoxPlaces(file);
    const items = core.cleanItems(raw);
    assert.deepEqual(items.map((i) => i.url).sort(), ['http://outils.example/', 'https://kdl-tech.fr/', 'https://www.mozilla.org/']);
    const byUrl = Object.fromEntries(items.map((i) => [i.url, i]));
    assert.equal(byUrl['https://www.mozilla.org/'].title, 'Mozilla (barre)');
    assert.equal(byUrl['https://kdl-tech.fr/'].title, 'Site');          // titre repris de moz_places
    assert.equal(byUrl['https://kdl-tech.fr/'].folder, 'Travail');
    assert.equal(byUrl['http://outils.example/'].folder, 'Travail / Outils');
    assert.ok(!items.some((i) => /historique-seul|dans-tag/.test(i.url)));
    // Aucune copie temporaire laissée derrière.
    assert.ok(!fs.readdirSync(os.tmpdir()).some((d) => d.startsWith('kdl-favoris-') &&
      fs.statSync(path.join(os.tmpdir(), d)).mtimeMs > Date.now() - 60000));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Détection : profils Chromium et Firefox sous Linux, Windows et macOS (arborescences factices)', () => {
  const home = tmpDir();
  const put = (rel, content) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
  const json = JSON.stringify(CHROMIUM);
  try {
    // Linux
    put('.config/google-chrome/Default/Bookmarks', json);
    put('.config/google-chrome/Profile 2/Bookmarks', json);
    put('.config/google-chrome/Guest Profile/Bookmarks', json);         // ignoré
    put('.config/google-chrome/Default/Login Data', 'secret');           // jamais lu
    put('.config/BraveSoftware/Brave-Browser/Default/Bookmarks', json);
    put('.config/opera/Bookmarks', json);
    put('.mozilla/firefox/profiles.ini', '[General]\nStartWithLastProfile=1\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=abcd.default-release\n');
    put('.mozilla/firefox/abcd.default-release/places.sqlite', 'x');
    const lin = Imp.detectSources({ platform: 'linux', env: {}, home });
    const lab = lin.map((s) => `${s.browserId}|${s.profile}`).sort();
    assert.deepEqual(lab, ['brave|Default', 'chrome|Default', 'chrome|Profile 2', 'firefox|default-release', 'opera|']);
    assert.ok(lin.every((s) => /^[0-9a-f]{16}$/.test(s.id)));
    assert.equal(new Set(lin.map((s) => s.id)).size, lin.length);
    const one = lin.find((s) => s.browserId === 'chrome');
    assert.equal(Imp.readSource(one).length, 3);

    // Windows
    put('AppData/Local/Microsoft/Edge/User Data/Default/Bookmarks', json);
    put('AppData/Roaming/Opera Software/Opera Stable/Bookmarks', json);
    put('AppData/Roaming/Mozilla/Firefox/Profiles/zz.default/places.sqlite', 'x');
    const win = Imp.detectSources({ platform: 'win32', env: {}, home }).map((s) => `${s.browserId}|${s.profile}`).sort();
    assert.deepEqual(win, ['edge|Default', 'firefox|zz.default', 'opera|']);

    // macOS
    put('Library/Application Support/Vivaldi/Default/Bookmarks', json);
    put('Library/Application Support/Chromium/Profile 1/Bookmarks', json);
    const mac = Imp.detectSources({ platform: 'darwin', env: {}, home }).map((s) => `${s.browserId}|${s.profile}`).sort();
    assert.deepEqual(mac, ['chromium|Profile 1', 'vivaldi|Default']);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('Fichier utilisateur : HTML, JSON KDL et JSON Chromium acceptés, le reste refusé', () => {
  const dir = tmpDir();
  try {
    const h = path.join(dir, 'f.html'); fs.writeFileSync(h, '﻿' + NETSCAPE);
    assert.equal(Imp.readUserFile(h, 'html').length, 3);
    const j = path.join(dir, 'k.json'); fs.writeFileSync(j, JSON.stringify([{ title: 'a', url: 'https://a.example/' }, { url: 'javascript:1' }]));
    assert.equal(Imp.readUserFile(j, 'json').length, 1);
    const c = path.join(dir, 'Bookmarks.json'); fs.writeFileSync(c, JSON.stringify(CHROMIUM));
    assert.equal(Imp.readUserFile(c, 'json').length, 3);
    const bad = path.join(dir, 'x.json'); fs.writeFileSync(bad, '{"a":1}');
    assert.throws(() => Imp.readUserFile(bad, 'json'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
