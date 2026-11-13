'use strict';
/**
 * KDL Privacy Dev Browser — lecture des favoris des autres navigateurs (fonctions pures).
 * Script classique (renderer) ET module Node (processus principal, tests).
 *   Navigateur : window.KDL_BOOKMARKS { cleanItems, mergeInto, isWebUrl }
 *   Node       : require('./bookmarks-core')
 * Aucun accès réseau, aucun accès disque ici : on ne fait que transformer du texte.
 * Format commun d'un favori lu : { title, url, folder } (folder = chemin « A / B », informatif).
 */
(function (root) {
  const MAX_ITEMS = 50000;      // garde-fou : au-delà, on s'arrête (fichier anormal)
  const MAX_TITLE = 300;
  const MAX_URL = 4096;

  // Seuls http:// et https:// sont acceptés (pas de javascript:, file:, data:, place:…).
  function isWebUrl(u) {
    if (typeof u !== 'string' || u.length > MAX_URL) return false;
    if (!/^https?:\/\//i.test(u.trim())) return false;
    try { const p = new URL(u.trim()); return (p.protocol === 'http:' || p.protocol === 'https:') && !!p.hostname; }
    catch (e) { return false; }
  }

  function cleanTitle(t, url) {
    const s = String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    return (s || url).slice(0, MAX_TITLE);
  }

  // Filtre http(s), nettoie les titres et retire les doublons d'URL (le premier gagne).
  function cleanItems(items) {
    const out = []; const seen = new Set();
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || !isWebUrl(it.url)) continue;
      const url = it.url.trim();
      if (seen.has(url)) continue;
      seen.add(url);
      out.push({ title: cleanTitle(it.title, url), url, folder: String(it.folder || '').slice(0, MAX_TITLE) });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  }

  // Ajoute les favoris lus à la liste existante (structure plate de l'app) sans doublon d'URL.
  function mergeInto(existing, incoming, now) {
    const list = Array.isArray(existing) ? existing.slice() : [];
    const seen = new Set(list.map((f) => f && f.url));
    let added = 0; let skipped = 0;
    const t = typeof now === 'number' ? now : Date.now();
    for (const it of Array.isArray(incoming) ? incoming : []) {
      if (!it || !isWebUrl(it.url)) { skipped++; continue; }
      const url = it.url.trim();
      if (seen.has(url)) { skipped++; continue; }
      let domain = ''; try { domain = new URL(url).hostname; } catch (e) { /* */ }
      const f = { title: cleanTitle(it.title, url), url, domain, added: t };
      if (it.folder) f.folder = String(it.folder).slice(0, MAX_TITLE);
      list.push(f); seen.add(url); added++;
    }
    return { list, added, skipped };
  }

  // --- Chromium (Chrome, Edge, Brave, Opera, Vivaldi, Chromium) : fichier JSON « Bookmarks » ---
  function parseChromiumJson(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || typeof data !== 'object' || !data.roots || typeof data.roots !== 'object') throw new Error('not-chromium');
    const out = [];
    const walk = (node, folder, depth) => {
      if (!node || typeof node !== 'object' || depth > 64 || out.length >= MAX_ITEMS) return;
      if (node.type === 'url') { out.push({ title: node.name, url: node.url, folder }); return; }
      if (Array.isArray(node.children)) {
        const sub = depth === 0 ? '' : (folder ? folder + ' / ' : '') + cleanTitle(node.name, '?');
        for (const c of node.children) walk(c, sub, depth + 1);
      }
    };
    // Racines usuelles : bookmark_bar, other, synced (+ racines propres à certains dérivés).
    for (const k of Object.keys(data.roots)) walk(data.roots[k], '', 0);
    return out;
  }

  // --- Fichier HTML « Netscape Bookmark File » (export de tous les navigateurs) ---
  const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    laquo: '«', raquo: '»', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
    ndash: '–', mdash: '—', euro: '€', copy: '©', reg: '®', szlig: 'ß' };
  // Lettres accentuées usuelles : &eacute; &Agrave; &ccedil; &ntilde; &uuml;…
  const ACC = { acute: '\u0301', grave: '\u0300', circ: '\u0302', uml: '\u0308', tilde: '\u0303', cedil: '\u0327', ring: '\u030A' };
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      if (NAMED[e] !== undefined) return NAMED[e];
      const a = /^([a-zA-Z])(acute|grave|circ|uml|tilde|cedil|ring)$/.exec(e);
      return a ? (a[1] + ACC[a[2]]).normalize('NFC') : m;
    });
  }
  const stripTags = (s) => decodeEntities(String(s).replace(/<[^>]*>/g, ''));

  function parseNetscapeHtml(html) {
    const src = String(html || '');
    if (!/<a\s[^>]*href\s*=|<h3[\s>]/i.test(src)) throw new Error('not-netscape');
    const out = [];
    const stack = [];            // dossiers ouverts
    let pending = null;          // titre d'un <H3> en attente de son <DL>
    const re = /<h3\b[^>]*>([\s\S]*?)<\/h3\s*>|<a\b([^>]*)>([\s\S]*?)<\/a\s*>|<dl\b[^>]*>|<\/dl\s*>/gi;
    let m;
    while ((m = re.exec(src)) && out.length < MAX_ITEMS) {
      const tok = m[0];
      if (m[1] !== undefined) { pending = cleanTitle(stripTags(m[1]), '?'); continue; }
      if (m[2] !== undefined) {
        const href = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[2]);
        if (href) {
          const url = decodeEntities(href[2] !== undefined ? href[2] : href[3] !== undefined ? href[3] : href[4]);
          out.push({ title: stripTags(m[3]), url, folder: stack.filter(Boolean).join(' / ') });
        }
        continue;
      }
      if (/^<dl/i.test(tok)) { if (stack.length < 64) stack.push(pending || ''); pending = null; continue; }
      stack.pop();
    }
    return out;
  }

  // --- Firefox : lignes brutes lues dans places.sqlite (voir bookmarks-import.js) ---
  // folders : [{ id, parent, title, guid }] ; links : [{ parent, title, url }]
  function buildFirefoxItems(folders, links) {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const ROOTS = new Set(['root________', 'menu________', 'toolbar_____', 'unfiled_____', 'mobile______']);
    const pathCache = new Map();
    const folderPath = (id) => {
      if (pathCache.has(id)) return pathCache.get(id);
      const parts = []; let cur = byId.get(id); let guard = 0; let isTag = false;
      while (cur && guard++ < 64) {
        if (cur.guid === 'tags________') { isTag = true; break; }
        if (!ROOTS.has(cur.guid)) parts.unshift(cleanTitle(cur.title, '?'));
        cur = byId.get(cur.parent);
      }
      const r = isTag ? null : parts.join(' / ');
      pathCache.set(id, r);
      return r;
    };
    const out = [];
    for (const l of links) {
      const folder = folderPath(l.parent);
      if (folder === null) continue;             // entrées d'étiquettes (tags) : ignorées
      out.push({ title: l.title, url: l.url, folder });
      if (out.length >= MAX_ITEMS) break;
    }
    return out;
  }

  const api = { isWebUrl, cleanItems, mergeInto, parseChromiumJson, parseNetscapeHtml, decodeEntities, buildFirefoxItems, MAX_ITEMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KDL_BOOKMARKS = api;
})(typeof window !== 'undefined' ? window : null);
