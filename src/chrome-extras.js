'use strict';
// ═══════════════════════════════════════════════════════════════════════
// Fonctions « comme Chrome » (1.8.0) : barre de favoris, menu complet
// (fenêtres, fenêtre privée, historique, zoom, impression, recherche dans la
// page, enregistrer la page, code source, plein écran, quitter) et raccourcis.
// Chargé après renderer.js : réutilise ses fonctions globales (cur, createTab,
// getFavs, saveFavs, showPanel, toast, settings, setZoom…). 100 % local.
// ═══════════════════════════════════════════════════════════════════════

const IS_PRIVATE = new URLSearchParams(location.search).get('private') === '1';
const $ = (id) => document.getElementById(id);
const isWeb = (u) => /^https?:\/\//i.test(u || '');
const curURL = () => { try { return cur() ? cur().getURL() : ''; } catch { return ''; } };

// ── Fenêtre privée : repère visuel + aucun historique ───────────────────
if (IS_PRIVATE) {
  document.body.classList.add('is-private');
  $('private-badge').classList.remove('hidden');
}

// Historique : jamais en fenêtre privée ; titre de la page mémorisé avec l'adresse.
const _recordHistory = recordHistory;
recordHistory = function (url) { if (!IS_PRIVATE) _recordHistory(url); };
function getHistory() { try { return JSON.parse(localStorage.getItem('kdl-history') || '[]'); } catch { return []; } }
function setHistory(h) { localStorage.setItem('kdl-history', JSON.stringify(h.slice(0, 200))); }
function noteTitle(url, title) {
  if (IS_PRIVATE || !title) return;
  const h = getHistory();
  if (h[0] && h[0].url === url && h[0].title !== title) { h[0].title = title; setHistory(h); }
}

// ── Barre de favoris ─────────────────────────────────────────────────────
const favbar = $('favbar');
const GLOBE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/></svg>';
const favbarOn = () => settings.favbar !== false;          // affichée par défaut, comme demandé

function favIcon(f) {
  if (f.icon && /^(https?:|data:image\/)/i.test(f.icon)) return `<img src="${esc(f.icon)}" alt="" referrerpolicy="no-referrer" />`;
  return `<span class="fb-mono">${esc(((f.title || f.domain || '?').trim()[0] || '?').toUpperCase())}</span>`;
}
function renderFavbar() {
  favbar.classList.toggle('hidden', !favbarOn());
  $('m-favbar').setAttribute('aria-checked', String(favbarOn()));
  if (!favbarOn()) return;
  const favs = getFavs();
  if (!favs.length) {
    favbar.innerHTML = `<span class="fb-empty">${esc(tr('favbar.empty'))}</span>
      <button class="fb-link" data-act="import">${esc(tr('favbar.import'))}</button>`;
    return;
  }
  favbar.innerHTML = favs.map((f, i) =>
    `<button class="fb-item" data-i="${i}" title="${esc(f.title)}\n${esc(f.url)}">${favIcon(f)}<span>${esc(f.title || f.domain || f.url)}</span></button>`
  ).join('') + `<button class="fb-more hidden" title="${esc(tr('favbar.more'))}" aria-label="${esc(tr('favbar.more'))}">
      <svg viewBox="0 0 24 24"><path d="m7 6 6 6-6 6"/><path d="m13 6 6 6-6 6"/></svg></button>`;
  favbar.querySelectorAll('img').forEach((im) => im.addEventListener('error', () => { im.outerHTML = GLOBE; }, { once: true }));
  fitFavbar();
}
// Les favoris qui ne tiennent pas passent dans le menu » (comme Chrome).
function fitFavbar() {
  const items = [...favbar.querySelectorAll('.fb-item')];
  const more = favbar.querySelector('.fb-more');
  if (!more) return;
  items.forEach((it) => it.classList.remove('fb-off'));
  more.classList.add('hidden');
  const max = favbar.clientWidth - 44;
  let used = 0, cut = false;
  for (const it of items) {
    used += it.offsetWidth + 4;
    if (cut || used > max) { it.classList.add('fb-off'); cut = true; }
  }
  more.classList.toggle('hidden', !cut);
}
function openFav(i, newTab) {
  const f = getFavs()[i]; if (!f) return;
  if (newTab || !cur()) createTab(f.url); else navigate(f.url);
}
favbar.addEventListener('click', (e) => {
  const it = e.target.closest('.fb-item');
  if (it) return openFav(+it.dataset.i, e.ctrlKey || e.metaKey);
  if (e.target.closest('[data-act="import"]')) return renderImportPanel();
  if (e.target.closest('.fb-more')) return showMoreFavs();
});
favbar.addEventListener('auxclick', (e) => {      // clic molette = nouvel onglet
  const it = e.target.closest('.fb-item');
  if (it && e.button === 1) { e.preventDefault(); openFav(+it.dataset.i, true); }
});
function showMoreFavs() {
  const all = getFavs();
  const hidden = [...favbar.querySelectorAll('.fb-item.fb-off')].map((b) => +b.dataset.i);
  showPanel(tr('favbar.more'), hidden.map((i) => `<div class="row"><span class="v fb-row" data-open="${i}">
      ${favIcon(all[i])}<span>${esc(all[i].title)}<small class="muted">${esc(all[i].domain || all[i].url)}</small></span></span></div>`).join(''));
  panelBody.querySelectorAll('[data-open]').forEach((el) => el.onclick = () => { panel.classList.add('hidden'); openFav(+el.dataset.open); });
}
function toggleFavbar() {
  settings.favbar = !favbarOn(); saveSettings(); renderFavbar();
}
window.addEventListener('resize', () => { if (favbarOn()) fitFavbar(); });

// Toute écriture des favoris (étoile, panneau, import) rafraîchit la barre.
const _saveFavs = saveFavs;
saveFavs = function (f) { _saveFavs(f); renderFavbar(); };

// Icône du site mémorisée quand on visite un favori (aucune requête vers un service tiers).
function rememberIcon(url, icon) {
  if (!icon || !/^https?:/i.test(icon)) return;
  const favs = getFavs(); const f = favs.find((x) => x.url === url);
  if (f && f.icon !== icon) { f.icon = icon; saveFavs(favs); }
}
// Suivi des onglets : titre pour l'historique, icône pour les favoris.
function extraWire(tab) {
  if (tab.extraWired) return; tab.extraWired = true;
  tab.wv.addEventListener('page-title-updated', (e) => { try { noteTitle(tab.wv.getURL(), e.title); } catch { /* */ } });
  tab.wv.addEventListener('page-favicon-updated', (e) => { try { rememberIcon(tab.wv.getURL(), e.favicons && e.favicons[0]); } catch { /* */ } });
  tab.wv.addEventListener('found-in-page', (e) => onFound(tab, e.result));
  tab.wv.addEventListener('zoom-changed', () => setTimeout(showZoom, 50));
}
const _wireTab = wireTab;
wireTab = function (tab) { _wireTab(tab); extraWire(tab); };
tabs.forEach(extraWire);   // onglets déjà ouverts avant le chargement de ce fichier

// ── Historique ───────────────────────────────────────────────────────────
function dayLabel(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  if (diff === 0) return tr('hist.today');
  if (diff === 1) return tr('hist.yesterday');
  return d.toLocaleDateString(window.I18N.lang, { weekday: 'long', day: 'numeric', month: 'long' });
}
function openHistoryPanel(filter = '') {
  const all = getHistory();
  const q = filter.trim().toLowerCase();
  const list = all.map((h, i) => ({ ...h, i })).filter((h) => !q || ((h.title || '') + ' ' + h.url).toLowerCase().includes(q));
  let html = `<input id="hist-search" class="input" type="text" placeholder="${esc(tr('hist.search'))}" value="${esc(filter)}" style="margin-bottom:10px" />`;
  if (IS_PRIVATE) html += `<div class="notice">${esc(tr('hist.private'))}</div>`;
  else if (settings.noHistory) html += `<div class="notice">${esc(tr('hist.off'))}</div>`;
  if (!list.length) html += `<div class="empty">${esc(tr('hist.empty'))}</div>`;
  let last = '';
  for (const h of list) {
    const day = dayLabel(h.t);
    if (day !== last) { html += `<div class="hist-day">${esc(day)}</div>`; last = day; }
    let host = ''; try { host = new URL(h.url).hostname; } catch { /* */ }
    const hm = new Date(h.t).toLocaleTimeString(window.I18N.lang, { hour: '2-digit', minute: '2-digit' });
    html += `<div class="row hist-row"><span class="hist-time">${esc(hm)}</span>
      <span class="v" data-open="${h.i}">${esc(h.title || host || h.url)}<small class="muted">${esc(host)}</small></span>
      <button data-del="${h.i}" title="${esc(tr('common.delete'))}" aria-label="${esc(tr('common.delete'))}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>`;
  }
  if (all.length) html += `<button id="hist-clear" class="btn-full">${esc(tr('hist.clear'))}</button>`;
  html += `<small class="muted">${esc(tr('hist.note'))}</small>`;
  showPanel(tr('menu.history'), html);
  const s = $('hist-search');
  s.oninput = () => { const v = s.value, pos = s.selectionStart; openHistoryPanel(v); const n = $('hist-search'); n.focus(); n.setSelectionRange(pos, pos); };
  if (!filter) s.focus();
  panelBody.querySelectorAll('[data-open]').forEach((el) => el.onclick = (e) => {
    const h = getHistory()[+el.dataset.open]; if (!h) return;
    panel.classList.add('hidden');
    if (e.ctrlKey || e.metaKey) createTab(h.url); else navigate(h.url);
  });
  panelBody.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    const h = getHistory(); h.splice(+b.dataset.del, 1); setHistory(h); openHistoryPanel(s.value);
  });
  const c = $('hist-clear');
  if (c) c.onclick = () => { setHistory([]); toast(tr('hist.cleared')); openHistoryPanel(); };
}

// ── Recherche dans la page (Ctrl+F) ──────────────────────────────────────
const findbar = $('findbar'), findQ = $('find-q'), findCount = $('find-count');
let findTab = null;
function openFind() {
  if (!isWeb(curURL())) return toast(tr('page.needWeb'));
  findbar.classList.remove('hidden');
  findQ.focus(); findQ.select();
  if (findQ.value) runFind(true);
}
function runFind(forward, next) {
  const wv = cur(); const q = findQ.value;
  if (!wv) return;
  findTab = activeTab();
  if (!q) { try { wv.stopFindInPage('clearSelection'); } catch { /* */ } findCount.textContent = ''; findbar.classList.remove('none'); return; }
  try { wv.findInPage(q, { forward: forward !== false, findNext: !!next }); } catch { /* */ }
}
function onFound(tab, r) {
  if (tab !== findTab || !r || !r.finalUpdate) return;
  const none = !r.matches;
  findbar.classList.toggle('none', none && !!findQ.value);
  findCount.textContent = none ? (findQ.value ? tr('find.none') : '') : tr('find.count', { i: r.activeMatchOrdinal, n: r.matches });
}
function closeFind() {
  findbar.classList.add('hidden');
  try { cur() && cur().stopFindInPage('keepSelection'); } catch { /* */ }
}
findQ.addEventListener('input', () => runFind(true, false));
findQ.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); runFind(!e.shiftKey, true); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFind(); }
});
$('find-next').onclick = () => runFind(true, true);
$('find-prev').onclick = () => runFind(false, true);
$('find-close').onclick = closeFind;

// ── Zoom affiché dans le menu ────────────────────────────────────────────
function showZoom() {
  let z = 1; try { z = cur() && cur().getZoomFactor ? cur().getZoomFactor() : 1; } catch { /* */ }
  $('mz-val').textContent = Math.round(z * 100) + ' %';
}
$('mz-in').onclick = () => { setZoom(0.1, false); showZoom(); };
$('mz-out').onclick = () => { setZoom(-0.1, false); showZoom(); };
$('mz-val').onclick = () => { setZoom(0, true); showZoom(); };
$('mz-full').onclick = () => { closeMenu(); window.kdl.fullscreen(); };
$('btn-menu').addEventListener('click', showZoom);

// ── Actions de page ──────────────────────────────────────────────────────
function printPage() {
  if (!isWeb(curURL())) return toast(tr('page.needWeb'));
  try { cur().print({ silent: false, printBackground: true }); } catch (err) { toast(tr('common.failed', { error: String(err) })); }
}
async function savePage() {
  if (!isWeb(curURL())) return toast(tr('page.needWeb'));
  const r = await window.kdl.savePage(cur().getWebContentsId());
  if (r && r.ok) toast(tr('page.saved', { file: r.file }), 4000);
  else if (r && r.error) toast(tr('common.failed', { error: r.error }));
}
function viewSource() {
  const u = curURL();
  if (!isWeb(u)) return toast(tr('page.needWeb'));
  createTab('view-source:' + u);
}

// ── Branchement du menu ──────────────────────────────────────────────────
const MENU_ACTIONS = {
  'm-newtab': () => createTab(HOME),
  'm-newwin': () => window.kdl.newWindow(false),
  'm-private': () => window.kdl.newWindow(true),
  'm-history': () => openHistoryPanel(),
  'm-downloads': () => openDownloadsPanel(),
  'm-favs': () => renderFavsPanel(),
  'm-favbar': toggleFavbar,
  'm-print': printPage,
  'm-find': openFind,
  'm-save': savePage,
  'm-source': viewSource,
  'm-quit': () => window.kdl.quit(),
};
for (const [id, fn] of Object.entries(MENU_ACTIONS)) $(id).addEventListener('click', fn);

// ── Raccourcis clavier (en plus de ceux de renderer.js) ──────────────────
// Ils marchent aussi quand la page web a le focus : le processus principal relaie les touches
// (événement kdl:shortcut) ; on les rejoue ici comme un appui clavier dans la fenêtre.
function extraShortcut(e) {
  const k = (e.key || '').toLowerCase();
  const c = e.ctrlKey || e.metaKey;
  if (c && e.shiftKey && k === 'n') return window.kdl.newWindow(true), true;
  if (c && e.shiftKey && k === 'b') return toggleFavbar(), true;
  if (c && e.shiftKey && k === 'o') return renderFavsPanel(), true;
  if (c && !e.shiftKey && k === 'n') return window.kdl.newWindow(false), true;
  if (c && !e.shiftKey && k === 'h') return openHistoryPanel(), true;
  if (c && !e.shiftKey && k === 'f') return openFind(), true;
  if (c && !e.shiftKey && k === 'p') return printPage(), true;
  if (c && !e.shiftKey && k === 's') return savePage(), true;
  if (c && !e.shiftKey && k === 'u') return viewSource(), true;
  if (c && !e.shiftKey && k === 'q') return window.kdl.quit(), true;
  if (c && k === 'tab') {
    if (tabs.length < 2) return true;
    const i = tabs.findIndex((t) => t.id === activeId);
    activate(tabs[(i + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length].id);
    return true;
  }
  if (e.key === 'F11') return window.kdl.fullscreen(), true;
  if (e.key === 'F5') return cur() && cur().reload(), true;
  if (e.key === 'Escape' && !findbar.classList.contains('hidden')) return closeFind(), true;
  return false;
}
document.addEventListener('keydown', (e) => { if (extraShortcut(e)) e.preventDefault(); }, true);
if (window.kdl.onShortcut) {
  window.kdl.onShortcut((s) => {
    const ev = new KeyboardEvent('keydown', { key: s.key, ctrlKey: !!s.control, metaKey: !!s.meta, shiftKey: !!s.shift, altKey: !!s.alt, bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
  });
}

renderFavbar();
