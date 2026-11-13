'use strict';
/**
 * KDL Privacy Dev Browser — détection et lecture LOCALE des favoris des autres navigateurs.
 * Processus principal uniquement. Aucun accès réseau.
 * Fichiers lus : « Bookmarks » (Chromium) et « places.sqlite » (Firefox, lu sur une copie temporaire),
 * plus « profiles.ini » de Firefox pour trouver les profils. Jamais : mots de passe, cookies,
 * historique, « Local State », « Login Data », etc. Pour Firefox, seules les lignes de moz_places
 * reliées à un favori (moz_bookmarks) sont lues.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const core = require('./bookmarks-core');

const MAX_FILE = 64 * 1024 * 1024;  // garde-fou : 64 Mo pour un fichier de favoris
const MAX_DB = 512 * 1024 * 1024;   // places.sqlite peut être gros (il contient aussi l'historique)

// Navigateurs de la famille Chromium : dossier « User Data » (profils Default, Profile 1…)
// ou dossier de profil direct (Opera). Chemins relatifs à la base de chaque OS.
const CHROMIUM = [
  { id: 'chrome', name: 'Google Chrome',
    win: ['Google/Chrome/User Data'], mac: ['Google/Chrome'],
    linux: ['google-chrome', '.var/app/com.google.Chrome/config/google-chrome'] },
  { id: 'edge', name: 'Microsoft Edge',
    win: ['Microsoft/Edge/User Data'], mac: ['Microsoft Edge'],
    linux: ['microsoft-edge', '.var/app/com.microsoft.Edge/config/microsoft-edge'] },
  { id: 'brave', name: 'Brave',
    win: ['BraveSoftware/Brave-Browser/User Data'], mac: ['BraveSoftware/Brave-Browser'],
    linux: ['BraveSoftware/Brave-Browser', '.var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser', 'snap/brave/current/.config/BraveSoftware/Brave-Browser'] },
  { id: 'opera', name: 'Opera',
    winRoaming: ['Opera Software/Opera Stable'], mac: ['com.operasoftware.Opera'],
    linux: ['opera', 'snap/opera/current/.config/opera'] },
  { id: 'opera-gx', name: 'Opera GX',
    winRoaming: ['Opera Software/Opera GX Stable'], mac: ['com.operasoftware.OperaGX'], linux: [] },
  { id: 'vivaldi', name: 'Vivaldi',
    win: ['Vivaldi/User Data'], mac: ['Vivaldi'], linux: ['vivaldi', '.var/app/com.vivaldi.Vivaldi/config/vivaldi'] },
  { id: 'chromium', name: 'Chromium',
    win: ['Chromium/User Data'], mac: ['Chromium'],
    linux: ['chromium', 'snap/chromium/common/chromium', '.var/app/org.chromium.Chromium/config/chromium'] },
];

// Dossiers de base selon l'OS. Les entrées Linux commençant par « .var » ou « snap » partent du $HOME.
function bases(platform, env, home) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return { local, roaming, firefox: [path.join(roaming, 'Mozilla', 'Firefox')] };
  }
  if (platform === 'darwin') {
    const sup = path.join(home, 'Library', 'Application Support');
    return { local: sup, roaming: sup, firefox: [path.join(sup, 'Firefox')] };
  }
  const cfg = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return {
    local: cfg, roaming: cfg,
    firefox: [
      path.join(home, '.mozilla', 'firefox'),
      path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
      path.join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'),
    ],
  };
}

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const listDir = (p) => { try { return fs.readdirSync(p); } catch { return []; } };

function chromiumDirs(b, platform, home) {
  const out = [];
  for (const br of CHROMIUM) {
    let rels = []; let base = b.local;
    if (platform === 'win32') { if (br.winRoaming) { rels = br.winRoaming; base = b.roaming; } else rels = br.win || []; }
    else if (platform === 'darwin') rels = br.mac || [];
    else rels = br.linux || [];
    for (const r of rels) {
      const root = platform !== 'win32' && platform !== 'darwin' && /^(\.var|snap)\//.test(r) ? path.join(home, r) : path.join(base, r);
      out.push({ br, root });
    }
  }
  return out;
}

// Profils Chromium : le dossier lui-même (Opera) puis Default, Profile N… (on ignore Guest/System).
function chromiumProfiles(root) {
  const res = [];
  if (isFile(path.join(root, 'Bookmarks'))) res.push({ profile: '', file: path.join(root, 'Bookmarks') });
  for (const d of listDir(root).sort()) {
    if (!(d === 'Default' || /^Profile \d+$/.test(d) || /^_side_profile_\d+$/.test(d))) continue;
    const f = path.join(root, d, 'Bookmarks');
    if (isFile(f)) res.push({ profile: d, file: f });
  }
  return res;
}

// profiles.ini de Firefox : [ProfileN] Name=…, IsRelative=1, Path=Profiles/xxxx.default-release
function firefoxProfiles(base) {
  const res = []; const seen = new Set();
  let ini = '';
  try { ini = fs.readFileSync(path.join(base, 'profiles.ini'), 'utf8'); } catch { /* */ }
  let cur = null;
  const flush = () => {
    if (!cur || !cur.Path) return;
    const dir = cur.IsRelative === '0' ? cur.Path : path.join(base, ...cur.Path.split(/[\\/]/));
    const file = path.join(dir, 'places.sqlite');
    if (!seen.has(file) && isFile(file)) { seen.add(file); res.push({ profile: cur.Name || path.basename(dir), file }); }
  };
  for (const line of ini.split(/\r?\n/)) {
    const sec = /^\s*\[(.+)\]\s*$/.exec(line);
    if (sec) { flush(); cur = /^Profile\d+$/i.test(sec[1]) ? {} : null; continue; }
    const kv = /^\s*([^=]+?)\s*=\s*(.*?)\s*$/.exec(line);
    if (kv && cur) cur[kv[1]] = kv[2];
  }
  flush();
  // Secours : profils non déclarés (dossier Profiles/ sous Windows et macOS, base directe sous Linux).
  for (const dir of [path.join(base, 'Profiles'), base]) {
    for (const d of listDir(dir)) {
      const file = path.join(dir, d, 'places.sqlite');
      if (!seen.has(file) && isFile(file)) { seen.add(file); res.push({ profile: d, file }); }
    }
  }
  return res;
}

/**
 * Liste les sources de favoris présentes sur ce poste.
 * Renvoie [{ id, browserId, browser, profile, kind: 'chromium'|'firefox', file }] — le chemin reste
 * dans le processus principal ; le renderer ne manipule que l'id.
 */
function detectSources(opts = {}) {
  const platform = opts.platform || process.platform;
  const env = opts.env || process.env;
  const home = opts.home || os.homedir();
  const b = bases(platform, env, home);
  const out = []; const seen = new Set();
  for (const { br, root } of chromiumDirs(b, platform, home)) {
    if (!isDir(root)) continue;
    for (const p of chromiumProfiles(root)) {
      if (seen.has(p.file)) continue; seen.add(p.file);
      out.push({ browserId: br.id, browser: br.name, profile: p.profile, kind: 'chromium', file: p.file });
    }
  }
  for (const base of b.firefox) {
    if (!isDir(base)) continue;
    for (const p of firefoxProfiles(base)) {
      if (seen.has(p.file)) continue; seen.add(p.file);
      out.push({ browserId: 'firefox', browser: 'Mozilla Firefox', profile: p.profile, kind: 'firefox', file: p.file });
    }
  }
  return out.map((s) => ({ ...s, id: crypto.createHash('sha256').update(s.file).digest('hex').slice(0, 16) }));
}

function readSmallText(file) {
  const st = fs.statSync(file);
  if (!st.isFile() || st.size > MAX_FILE) throw new Error('too-big');
  return fs.readFileSync(file, 'utf8');
}

// Firefox verrouille places.sqlite pendant qu'il tourne : on copie la base (+ journal WAL)
// dans un dossier temporaire privé, on la lit, puis on efface la copie.
function readFirefoxPlaces(file) {
  let sqlite;
  try { sqlite = require('node:sqlite'); } catch { throw new Error('sqlite-unavailable'); }
  const st = fs.statSync(file);
  if (!st.isFile() || st.size > MAX_DB) throw new Error('too-big');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kdl-favoris-'));
  let db = null;
  try {
    const copy = path.join(tmp, 'places.sqlite');
    fs.copyFileSync(file, copy);
    if (isFile(file + '-wal')) fs.copyFileSync(file + '-wal', copy + '-wal');
    db = new sqlite.DatabaseSync(copy);
    const folders = db.prepare('SELECT id, parent, title, guid FROM moz_bookmarks WHERE type = 2').all();
    const links = db.prepare(
      'SELECT b.parent AS parent, COALESCE(b.title, p.title) AS title, p.url AS url ' +
      'FROM moz_bookmarks b JOIN moz_places p ON p.id = b.fk ' +
      "WHERE b.type = 1 AND (p.url LIKE 'http://%' OR p.url LIKE 'https://%') " +
      'ORDER BY b.parent, b.position').all();
    return core.buildFirefoxItems(folders, links);
  } finally {
    try { if (db) db.close(); } catch { /* */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  }
}

// Lit une source détectée et renvoie des favoris nettoyés (http(s), sans doublon).
function readSource(src) {
  if (!src || !src.file) throw new Error('unknown-source');
  if (src.kind === 'chromium') return core.cleanItems(core.parseChromiumJson(readSmallText(src.file)));
  if (src.kind === 'firefox') return core.cleanItems(readFirefoxPlaces(src.file));
  throw new Error('unknown-source');
}

// Fichier choisi par l'utilisateur : HTML Netscape ou JSON (KDL, ou Bookmarks Chromium).
function readUserFile(file, kind) {
  const text = readSmallText(file).replace(/^﻿/, '');
  if (kind === 'html') return core.cleanItems(core.parseNetscapeHtml(text));
  const data = JSON.parse(text);
  if (Array.isArray(data)) return core.cleanItems(data);                 // export JSON KDL
  if (data && data.roots) return core.cleanItems(core.parseChromiumJson(data));
  throw new Error('bad-format');
}

module.exports = { detectSources, readSource, readUserFile, readFirefoxPlaces, CHROMIUM };
