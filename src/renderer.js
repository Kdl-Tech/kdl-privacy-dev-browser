'use strict';

const DDG = 'https://duckduckgo.com/?q=';
const AHMIA = 'https://ahmia.fi/search/?q=';
const HOME = 'home.html';
const GITHUB = 'https://github.com/Kdl-Tech/kdl-privacy-dev-browser';
const DOWNLOAD_URL = 'https://kdl-tech.fr/kdl-privacy-dev-browser/';   // page de téléchargement officielle

const urlbar = document.getElementById('urlbar');
const lock = document.getElementById('lock');
const toastEl = document.getElementById('toast');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const respBar = document.getElementById('responsive-bar');
const viewport = document.getElementById('viewport');
const tabsEl = document.getElementById('tabs');

// Traductions (i18n.js, chargé dans <head>) : appliquées à l'UI statique au démarrage.
window.I18N.apply(document);

function curTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function homeURL() {
  return location.href.replace(/index\.html(\?.*)?(#.*)?$/, HOME) + '?theme=' + curTheme() + '&lang=' + window.I18N.lang;
}
function isHome(url) { return !url || url.includes(HOME); }

// ── Thème clair/sombre (KDL Design System) ────────────────────────────────
// Sans choix mémorisé : thème du système (prefers-color-scheme), suivi en direct.
const MQ_SOMBRE = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function themeMemorise() {
  try { const v = localStorage.getItem('kdl-theme'); return v === 'dark' || v === 'light' ? v : null; } catch (e) { return null; }
}
// Aligne nativeTheme.themeSource d'Electron (menus, barres, prefers-color-scheme des pages web).
function syncThemeNatif() {
  try { if (window.kdl && window.kdl.setThemeSource) window.kdl.setThemeSource(themeMemorise() || 'system').catch(() => {}); } catch (e) { /* */ }
}
function applyTheme(theme, persist) {
  theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) { try { localStorage.setItem('kdl-theme', theme); } catch (e) { /* */ } syncThemeNatif(); }
  const btn = document.getElementById('btn-theme');
  if (btn) {
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    btn.setAttribute('title', theme === 'dark' ? tr('theme.toLight') : tr('theme.toDark'));
    btn.setAttribute('aria-label', theme === 'dark' ? tr('theme.toLight') : tr('theme.toDark'));
  }
  // Recharger les onglets d'accueil pour propager le thème au <webview> home.
  tabs.forEach((t) => {
    if (isHome(t.url)) {
      t.url = homeURL();
      try { t.wv.loadURL(t.url).catch(() => { t.wv.src = t.url; }); } catch (e) { t.wv.src = t.url; }
    }
  });
}
function toggleTheme() { applyTheme(curTheme() === 'dark' ? 'light' : 'dark', true); }

let toastTimer = null;
function toast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function showPanel(title, html) {
  panelTitle.textContent = title;
  panelBody.innerHTML = html;
  panel.classList.remove('hidden');
}
document.getElementById('panel-close').onclick = () => panel.classList.add('hidden');
document.getElementById('panel-backdrop').onclick = () => panel.classList.add('hidden');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===========================================================================
// Multi-onglets — chaque onglet a son propre <webview> ; session persist:kdl
// partagée (cookies communs comme un navigateur classique).
// ===========================================================================
let tabs = [];
let activeId = null;
let seq = 0;
const closedStack = [];   // pile des onglets fermés (Ctrl+Shift+T)

const activeTab = () => tabs.find((t) => t.id === activeId);
const cur = () => activeTab() && activeTab().wv;
const isActive = (tab) => tab.id === activeId;

function createTab(url) {
  // Home par défaut : on charge l'URL ABSOLUE (file://…/home.html) ; un chemin relatif
  // ("home.html") n'est pas résolu de façon fiable par <webview> -> page blanche.
  const target = (!url || url === HOME) ? homeURL() : url;
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:kdl');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes');
  wv.classList.add('hidden');
  // Attacher AVANT de définir src : le guest n'est prêt qu'une fois dans le DOM.
  viewport.appendChild(wv);
  wv.src = target;
  const tab = { id: ++seq, wv, title: tr('tab.new'), url: target };
  tabs.push(tab);
  wireTab(tab);
  activate(tab.id);
  return tab;
}

function wireTab(tab) {
  const wv = tab.wv;
  wv.addEventListener('did-start-loading', () => { tab.loading = true; tab.failed = false; if (isActive(tab)) setLock('loading'); renderTabs(); });
  wv.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    if (isActive(tab)) { let u = tab.url; try { u = wv.getURL() || tab.url; } catch { /* */ } updateBar(u); }
    renderTabs();
  });
  wv.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons && e.favicons[0]) { tab.favicon = e.favicons[0]; renderTabs(); }
  });
  wv.addEventListener('did-fail-load', (e) => {
    // -3 = ERR_ABORTED (navigation volontairement interrompue) : pas une erreur affichable.
    if (e.errorCode && e.errorCode !== -3 && e.isMainFrame !== false) { tab.failed = true; renderTabs(); }
  });
  // Console de la page (pour la boîte à outils dev) — conservée localement, jamais envoyée.
  tab.console = [];
  wv.addEventListener('console-message', (e) => {
    if (e.level >= 1) { tab.console.push({ level: e.level, message: String(e.message || '').slice(0, 500) }); if (tab.console.length > 40) tab.console.shift(); }
  });
  wv.addEventListener('did-start-loading', () => { tab.console = []; });
  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || tab.title;
    if (isActive(tab)) document.title = 'KDL · ' + tab.title;
    renderTabs();
  });
  const onNav = (e) => {
    tab.url = e.url;
    if (isActive(tab)) updateBar(e.url);
    recordHistory(e.url);
  };
  wv.addEventListener('did-navigate', onNav);
  wv.addEventListener('did-navigate-in-page', (e) => { tab.url = e.url; if (isActive(tab)) updateBar(e.url); });
  wv.addEventListener('new-window', (e) => { if (/^https?:/i.test(e.url)) createTab(e.url); });
  // Recherche/chips de la page d'accueil : schéma sentinelle -> routage sécurisé du parent.
  wv.addEventListener('will-navigate', (e) => {
    const q = e.url && e.url.match(/^kdlgo:\/\/q\/(.*)$/i);
    if (q) { try { wv.stop(); } catch { /* */ } navigate(decodeURIComponent(q[1])); return; }
    const a = e.url && e.url.match(/^kdlgo:\/\/action\/([a-z]+)$/i);
    if (a) { try { wv.stop(); } catch { /* */ } homeAction(a[1].toLowerCase()); }
  });
}

function activate(id) {
  activeId = id;
  tabs.forEach((t) => t.wv.classList.toggle('hidden', t.id !== id));
  const t = activeTab();
  if (t) { let u = t.url; try { u = t.wv.getURL() || t.url; } catch { /* pas prêt */ } updateBar(u); }
  renderTabs();
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  let closing = t.url; try { closing = t.wv.getURL() || t.url; } catch { /* */ }
  if (closing && !isHome(closing)) closedStack.push(closing);
  t.wv.remove();
  if (tabs.length === 0) { createTab(HOME); return; }   // garder un onglet minimum
  if (activeId === id) activate(tabs[Math.max(0, i - 1)].id);
  else renderTabs();
}

const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>';
function renderTabs() {
  tabsEl.innerHTML = '';
  tabs.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === activeId ? ' active' : '') + (t.loading ? ' loading' : '');
    el.title = t.failed ? tr('tab.failed', { title: t.title }) : t.title;

    const spin = document.createElement('span'); spin.className = 'tab-spin';
    const fav = document.createElement('img'); fav.className = 'tab-fav';
    if (t.favicon && !isHome(t.url)) { fav.src = t.favicon; fav.onerror = () => fav.classList.add('blank'); }
    else fav.classList.add('blank');

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = (t.title && t.title !== tr('tab.new')) ? t.title : (isHome(t.url) ? tr('tb.home') : tr('tab.generic'));

    const x = document.createElement('button');
    x.className = 'tab-close'; x.innerHTML = CLOSE_SVG; x.title = tr('tab.closeTitle');
    x.setAttribute('aria-label', tr('tab.closeAria'));

    el.appendChild(spin); el.appendChild(fav); el.appendChild(label); el.appendChild(x);
    el.onclick = (e) => { if (e.target !== x && !x.contains(e.target)) activate(t.id); };
    x.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
    tabsEl.appendChild(el);
  });
}
document.getElementById('newtab').onclick = () => createTab(HOME);
const themeBtn = document.getElementById('btn-theme');
if (themeBtn) { themeBtn.onclick = toggleTheme; applyTheme(curTheme(), false); }
syncThemeNatif();
if (MQ_SOMBRE) {
  MQ_SOMBRE.addEventListener('change', () => { if (!themeMemorise()) applyTheme(MQ_SOMBRE.matches ? 'dark' : 'light', false); });
}

// --- Résolution requête : URL directe ou recherche DuckDuckGo ---
function resolveQuery(raw) {
  const q = raw.trim();
  if (!q) return null;
  if (/\.onion(\/|$|\?)/i.test(q) || /^https?:\/\/[^/]+\.onion/i.test(q)) return { onion: true, value: q };
  if (/^https?:\/\//i.test(q)) return { value: q };
  if (/^[a-z]+:\/\//i.test(q)) return { value: q };
  if (/^[^\s]+\.[^\s]{2,}($|\/|:)/.test(q) && !q.includes(' ')) return { value: 'https://' + q };
  return { value: DDG + encodeURIComponent(q) };
}

function navigate(raw) {
  const r = resolveQuery(raw);
  if (!r) return;
  if (r.onion) return onionWarning(r.value);
  if (!cur()) createTab(r.value);
  else cur().loadURL(r.value).catch(() => { cur().src = r.value; });
}

// Chips d'action de la page d'accueil -> on réutilise les boutons existants de la barre d'outils.
function homeAction(verb) {
  if (verb === 'ddg') return navigate('https://duckduckgo.com');
  const map = { favs: 'btn-favs', devtools: 'btn-devtools', onion: 'btn-onion', clean: 'btn-clean' };
  const btn = map[verb] && document.getElementById(map[verb]);
  if (btn) btn.click();
}

document.getElementById('urlform').addEventListener('submit', (e) => { e.preventDefault(); navigate(urlbar.value); });

// --- Boutons navigation ---
document.getElementById('back').onclick = () => cur() && cur().canGoBack() && cur().goBack();
document.getElementById('forward').onclick = () => cur() && cur().canGoForward() && cur().goForward();
document.getElementById('reload').onclick = () => cur() && cur().reload();
document.getElementById('home').onclick = () => cur() && cur().loadURL(homeURL()).catch(() => { cur().src = HOME; });

// État de l'indicateur de sécurité (icône SVG via CSS [data-state], jamais d'emoji).
function setLock(state) { lock.dataset.state = state; }

function updateBar(url) {
  if (isHome(url)) { urlbar.value = ''; setLock('neutral'); updateStar(url); return; }
  urlbar.value = url;
  if (url.startsWith('https://')) setLock('secure');
  else if (url.startsWith('http://')) setLock('insecure');
  else setLock('neutral');
  updateStar(url);
}

// ===========================================================================
// Favoris (stockage local uniquement)
// ===========================================================================
const btnFav = document.getElementById('btn-fav');
function getFavs() { return JSON.parse(localStorage.getItem('kdl-favorites') || '[]'); }
function saveFavs(f) { localStorage.setItem('kdl-favorites', JSON.stringify(f)); }
function updateStar(url) {
  const fav = !isHome(url) && getFavs().some((f) => f.url === url);
  btnFav.classList.toggle('is-fav', fav);
  btnFav.title = fav ? tr('fav.remove') : tr('fav.add');
}
function toggleFav() {
  const url = cur() ? cur().getURL() : '';
  if (isHome(url)) return toast(tr('fav.nothing'));
  const favs = getFavs();
  const idx = favs.findIndex((f) => f.url === url);
  if (idx >= 0) { favs.splice(idx, 1); saveFavs(favs); updateStar(url); return toast(tr('fav.removed')); }
  let domain = ''; try { domain = new URL(url).hostname; } catch { /* */ }
  favs.unshift({ title: document.title.replace(/^KDL · /, '') || url, url, domain, added: Date.now() });
  saveFavs(favs); updateStar(url); toast(tr('fav.added'));
}
btnFav.onclick = toggleFav;

document.getElementById('btn-favs').onclick = () => renderFavsPanel();
function renderFavsPanel(filter = '') {
  const all = getFavs();
  const q = filter.trim().toLowerCase();
  const favs = q ? all.filter((f) => (f.title + ' ' + f.url).toLowerCase().includes(q)) : all;
  const list = favs.length
    ? favs.map((f) => {
        const gi = all.indexOf(f);
        return `<div class="row">
          <span class="v" style="text-align:left;flex:1;cursor:pointer" data-open="${gi}">
            ${esc(f.title)}<small class="muted">${esc(f.domain || f.url)}</small></span>
          <button data-edit="${gi}" title="${tr('favs.edit')}">✎</button>
          <button data-del="${gi}" title="${tr('common.delete')}">🗑</button></div>`;
      }).join('')
    : '<div class="empty">' + tr('favs.empty') + '</div>';
  showPanel(tr('favs.title'), `
    <input id="fav-search" class="input" type="text" placeholder="${tr('favs.search')}" value="${esc(filter)}" style="margin-bottom:10px" />
    <div id="fav-list">${list}</div>
    <button id="fav-export" class="btn-full">${tr('common.exportJson')}</button>
    <button id="fav-import" class="btn-full">${tr('common.importJson')}</button>
    <small class="muted">${tr('favs.note')}</small>
  `);
  const search = document.getElementById('fav-search');
  search.oninput = () => { const p = search.selectionStart; renderFavsPanel(search.value); const s = document.getElementById('fav-search'); s.focus(); s.setSelectionRange(p, p); };
  panelBody.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => { const f = getFavs()[+el.dataset.open]; if (f) { panel.classList.add('hidden'); navigate(f.url); } };
  });
  panelBody.querySelectorAll('[data-del]').forEach((el) => {
    el.onclick = () => { const a = getFavs(); a.splice(+el.dataset.del, 1); saveFavs(a); renderFavsPanel(filter); updateStar(cur() ? cur().getURL() : ''); };
  });
  panelBody.querySelectorAll('[data-edit]').forEach((el) => {
    el.onclick = () => editFav(+el.dataset.edit, filter);
  });
  document.getElementById('fav-export').onclick = exportFavs;
  document.getElementById('fav-import').onclick = importFavs;
}

function editFav(i, filter) {
  const f = getFavs()[i]; if (!f) return;
  showPanel(tr('favs.editTitle'), `
    <div class="field"><label>${tr('common.title')}</label></div>
    <input id="ef-title" class="input" type="text" value="${esc(f.title)}" />
    <div class="field"><label>URL</label></div>
    <input id="ef-url" class="input" type="text" value="${esc(f.url)}" />
    <button id="ef-save" class="btn-full btn-accent">${tr('common.save')}</button>
    <button id="ef-cancel" class="btn-full">${tr('common.cancel')}</button>
  `);
  document.getElementById('ef-cancel').onclick = () => renderFavsPanel(filter);
  document.getElementById('ef-save').onclick = () => {
    const title = document.getElementById('ef-title').value.trim();
    const url = document.getElementById('ef-url').value.trim();
    if (!url) return toast(tr('fav.emptyUrl'));
    const a = getFavs();
    if (a.some((x, j) => j !== i && x.url === url)) return toast(tr('fav.dup'));
    let domain = ''; try { domain = new URL(url).hostname; } catch { /* */ }
    a[i] = { ...a[i], title: title || url, url, domain };
    saveFavs(a); renderFavsPanel(filter); toast(tr('fav.updated'));
  };
}

async function exportFavs() {
  const res = await window.kdl.exportFavs(getFavs());
  toast(res.ok ? tr('favs.exported', { file: res.file }) : (res.canceled ? tr('common.exportCanceled') : tr('common.exportFailed')));
}
async function importFavs() {
  const res = await window.kdl.importFavs();
  if (!res.ok) return toast(res.canceled ? tr('favs.importCanceled') : tr('favs.importFailed', { error: res.error || tr('favs.invalidFile') }));
  const incoming = Array.isArray(res.data) ? res.data : [];
  const a = getFavs();
  const seen = new Set(a.map((f) => f.url));
  let added = 0;
  for (const f of incoming) {
    if (!f || typeof f.url !== 'string' || !/^[a-z]+:\/\//i.test(f.url)) continue;  // sécurité : URL valide
    if (seen.has(f.url)) continue;                                                   // anti-doublon exact
    let domain = ''; try { domain = new URL(f.url).hostname; } catch { /* */ }
    a.push({ title: String(f.title || f.url).slice(0, 300), url: f.url, domain, added: Date.now() });
    seen.add(f.url); added++;
  }
  saveFavs(a); renderFavsPanel(); toast(tr('favs.imported', { n: added }));
}

// --- DevTools ---
document.getElementById('btn-devtools').onclick = () => {
  if (!cur()) return;
  cur().isDevToolsOpened() ? cur().closeDevTools() : cur().openDevTools();
};

// --- Capture écran ---
document.getElementById('btn-shot').onclick = async () => {
  try {
    const res = await window.kdl.screenshot(cur().getWebContentsId());
    toast(res.ok ? tr('shot.ok', { file: res.file }) : tr('shot.fail', { error: res.error }));
  } catch (err) { toast(tr('shot.impossible', { error: err })); }
};

// --- Mode lecture (sans distraction) ---
document.getElementById('btn-reader').onclick = () => {
  if (!cur()) return;
  const u = cur().getURL();
  if (isHome(u)) return toast(tr('reader.needPage'));
  window.KDLReader.open(cur());
};

// --- Effet visuel « effacement » : balayage cyan + désintégration de particules.
// Différent des flammes DDG ; respecte prefers-reduced-motion.
function playClearFX() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cvs = document.createElement('canvas');
    cvs.width = W * dpr; cvs.height = H * dpr;
    cvs.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
    document.body.appendChild(cvs);
    const ctx = cvs.getContext('2d'); ctx.scale(dpr, dpr);
    const parts = [];
    for (let i = 0; i < 90; i++) parts.push({
      x: Math.random() * W, y: H * 0.3 + Math.random() * H * 0.55, r: 1 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 1.1, vy: -1.4 - Math.random() * 2.6, life: 0, max: 38 + Math.random() * 34,
      hue: 186 + Math.random() * 16,
    });
    const t0 = performance.now(), DUR = 950;
    (function frame(now) {
      const el = now - t0, k = el / DUR, sweepX = k * W * 1.3;
      ctx.clearRect(0, 0, W, H);
      const g = ctx.createLinearGradient(sweepX - 170, 0, sweepX, 0);
      g.addColorStop(0, 'rgba(6,182,212,0)'); g.addColorStop(1, 'rgba(34,211,238,' + (0.22 * (1 - k)) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, Math.max(0, sweepX), H);
      ctx.strokeStyle = 'rgba(34,211,238,' + (0.55 * (1 - k)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sweepX, 0); ctx.lineTo(sweepX, H); ctx.stroke();
      for (const p of parts) {
        if (p.x < sweepX) { p.life++; p.x += p.vx; p.y += p.vy; p.vy += 0.02; }
        const a = Math.max(0, 1 - p.life / p.max); if (a <= 0) continue;
        ctx.fillStyle = 'hsla(' + p.hue + ',90%,62%,' + a + ')'; ctx.fillRect(p.x, p.y, p.r, p.r);
      }
      if (el < DUR) requestAnimationFrame(frame); else cvs.remove();
    })(t0);
  } catch { /* l'effet ne doit jamais casser l'action */ }
}

// --- Nettoyer le site courant (session persist:kdl) ---
document.getElementById('btn-clean').onclick = async () => {
  playClearFX();
  let origin = '';
  try { origin = new URL(cur().getURL()).origin; } catch { /* page locale */ }
  try { await cur().executeJavaScript('try{localStorage.clear();sessionStorage.clear();}catch(e){};true;', true); } catch { /* */ }
  const res = await window.kdl.clearSiteData(origin || undefined);
  toast(res.ok ? tr('clean.ok', { origin: res.origin || tr('clean.site') }) : tr('clean.fail'));
};

// --- Panneau infos page ---
document.getElementById('btn-info').onclick = async () => {
  const url = cur() ? cur().getURL() : '';
  let data = {};
  try {
    data = await cur().executeJavaScript(`(function(){return {title:document.title,ua:navigator.userAgent,proto:location.protocol,host:location.host};})();`, true);
  } catch { /* */ }
  const u = (() => { try { return new URL(url); } catch { return null; } })();
  const https = u ? u.protocol === 'https:' : false;
  showPanel(tr('menu.info'), `
    <div class="row"><span class="k">URL</span><span class="v">${esc(url)}</span></div>
    <div class="row"><span class="k">${tr('common.title')}</span><span class="v">${esc(data.title || '—')}</span></div>
    <div class="row"><span class="k">${tr('info.domain')}</span><span class="v">${esc(u ? u.hostname : '—')}</span></div>
    <div class="row"><span class="k">${tr('info.protocol')}</span><span class="v">${esc(data.proto || (u ? u.protocol : '—'))}
      ${https ? '<span class="tag ok">HTTPS</span>' : '<span class="tag err">' + tr('info.insecure') + '</span>'}</span></div>
    <div class="row"><span class="k">User-Agent</span><span class="v">${esc(data.ua || navigator.userAgent)}</span></div>
  `);
};

// --- Audit léger maison ---
document.getElementById('btn-audit').onclick = async () => {
  let audit;
  try {
    audit = await cur().executeJavaScript(`(function(){
      var imgs=document.querySelectorAll('img');var noAlt=0;imgs.forEach(function(i){if(!i.getAttribute('alt'))noAlt++;});
      var host=location.hostname;var ext=0;
      document.querySelectorAll('a[href]').forEach(function(a){try{var h=new URL(a.href).hostname;if(h&&h!==host)ext++;}catch(e){}});
      var md=document.querySelector('meta[name="description"]');
      return {title:document.title||'',desc:md?(md.getAttribute('content')||'').trim():'',h1:document.querySelectorAll('h1').length,
        https:location.protocol==='https:',imgs:imgs.length,imgsNoAlt:noAlt,extLinks:ext};
    })();`, true);
  } catch (err) { return toast(tr('audit.impossible')); }
  const checks = [
    [tr('common.title'), !!audit.title, audit.title ? tr('audit.presentM') : tr('audit.absentM')],
    [tr('audit.metaDesc'), !!audit.desc, audit.desc ? tr('audit.presentF') : tr('audit.absentF')],
    [tr('audit.h1'), audit.h1 > 0, tr('audit.found', { n: audit.h1 })],
    ['HTTPS', audit.https, audit.https ? tr('common.yes') : tr('common.no')],
    [tr('audit.imgNoAlt'), audit.imgsNoAlt === 0, audit.imgsNoAlt + ' / ' + audit.imgs],
    [tr('audit.extLinks'), true, String(audit.extLinks), true]
  ];
  const failed = checks.filter((c) => !c[1] && !c[3]).length;
  const status = failed === 0 ? '<span class="tag ok">OK</span>' : `<span class="tag warn">${tr('audit.toCheck', { n: failed })}</span>`;
  showPanel(tr('menu.audit'), `
    <div class="row"><span class="k">${tr('audit.global')}</span><span class="v">${status}</span></div>
    ${checks.map((c) => `<div class="row"><span class="k">${c[0]}</span>
      <span class="v">${esc(c[2])} ${c[1] ? '<span class="tag ok">✓</span>' : (c[3] ? '' : '<span class="tag warn">!</span>')}</span></div>`).join('')}
    <small class="muted">${tr('audit.note')}</small>
  `);
};

// --- Mode responsive ---
function applyResp(w) {
  tabs.forEach((t) => {
    if (w === 0) { t.wv.style.maxWidth = ''; t.wv.classList.remove('framed'); }
    else { t.wv.style.maxWidth = w + 'px'; t.wv.classList.add('framed'); }
  });
}
respBar.querySelectorAll('button').forEach((b) => {
  b.onclick = () => {
    respBar.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    applyResp(parseInt(b.dataset.w, 10));
  };
});

// --- Onion Search ---
document.getElementById('btn-onion').onclick = () => openOnionPanel();
async function openOnionPanel(prefill = '') {
  const tor = await window.kdl.detectTor();
  const torLine = tor.found ? '<span class="tag ok">' + tr('tor.detected') + '</span>' : '<span class="tag err">' + tr('tor.notDetected') + '</span>';
  showPanel('Onion Search', `
    <div class="notice">${tr('onion.legal')}</div>
    <div class="row"><span class="k">${tr('onion.torState')}</span><span class="v">${torLine}</span></div>
    <input id="onion-q" class="input" type="text" placeholder="${tr('onion.placeholder')}" value="${esc(prefill)}" style="margin-top:10px" />
    <button id="onion-go" class="btn-full btn-accent">${tr('onion.search')}</button>
    <button id="onion-tor" class="btn-full">${tor.found ? tr('onion.openTor') : tr('onion.torMissing')}</button>
    <small class="muted">${tr('onion.note')}</small>
  `);
  document.getElementById('onion-go').onclick = () => {
    const q = document.getElementById('onion-q').value.trim();
    if (q) navigate(AHMIA + encodeURIComponent(q));
  };
  document.getElementById('onion-tor').onclick = async () => {
    if (!tor.found) return toast(tr('onion.installTor'));
    const q = document.getElementById('onion-q').value.trim();
    const res = await window.kdl.openTor(AHMIA + encodeURIComponent(q || ''));
    toast(res.ok ? tr('tor.opening') : tr('common.failed', { error: res.error }));
  };
}
function onionWarning(url) {
  showPanel(tr('onion.detectedTitle'), `
    <div class="notice">${tr('onion.warning')}</div>
    <div class="row"><span class="k">URL</span><span class="v">${esc(url)}</span></div>
    <button id="onion-open-tor" class="btn-full btn-accent">${tr('onion.openWithTor')}</button>
    <small class="muted">${tr('onion.legalShort')}</small>
  `);
  document.getElementById('onion-open-tor').onclick = async () => {
    const res = await window.kdl.openTor(url);
    toast(res.ok ? tr('tor.opening') : tr('common.failed', { error: res.error || tr('tor.notFound') }));
  };
}

// --- Paramètres confidentialité ---
const settings = JSON.parse(localStorage.getItem('kdl-settings') || '{}');
function saveSettings() { localStorage.setItem('kdl-settings', JSON.stringify(settings)); }
// Réappliquer les réglages côté processus principal à chaque démarrage.
window.kdl.thirdPartyCookies(!!settings.block3p);
window.kdl.trackers(settings.trackers !== false);
window.kdl.clearOnClose(!!settings.clearOnClose);
// Langue de l'interface transmise au processus principal (boîtes de dialogue, messages).
if (window.kdl.setLang) window.kdl.setLang(window.I18N.lang);
window.kdl.onOpenTab((u) => createTab(u));
document.getElementById('btn-settings').onclick = () => {
  const langSel = settings.lang && window.I18N.normalize(settings.lang) ? settings.lang : 'auto';
  const langOpts = [['auto', tr('settings.langAuto')], ['fr', 'Français'], ['en', 'English'], ['es', 'Español']]
    .map(([v, l]) => `<option value="${v}" ${langSel === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  showPanel(tr('settings.title'), `
    <div class="field"><label for="s-lang">${tr('settings.lang')}</label>
      <select id="s-lang" class="input" style="height:28px;width:auto">${langOpts}</select></div>
    <div class="field"><label for="s-hist">${tr('settings.noHistory')}</label>
      <input type="checkbox" id="s-hist" ${settings.noHistory ? 'checked' : ''}></div>
    <div class="field"><label for="s-close">${tr('settings.clearOnClose')}</label>
      <input type="checkbox" id="s-close" ${settings.clearOnClose ? 'checked' : ''}></div>
    <div class="field"><label for="s-3pc">${tr('settings.block3p')}</label>
      <input type="checkbox" id="s-3pc" ${settings.block3p ? 'checked' : ''}></div>
    <div class="field"><label for="s-trk">${tr('settings.trackers')}</label>
      <input type="checkbox" id="s-trk" ${settings.trackers !== false ? 'checked' : ''}></div>
    <button id="s-clearnow" class="btn-full">${tr('settings.clearNow')}</button>
    <small class="muted">${tr('settings.note')}</small>
  `);
  document.getElementById('s-lang').onchange = (e) => {
    if (e.target.value === 'auto') delete settings.lang; else settings.lang = e.target.value;
    saveSettings();
    location.reload();   // la fenêtre se recharge dans la nouvelle langue
  };
  document.getElementById('s-hist').onchange = (e) => { settings.noHistory = e.target.checked; saveSettings(); };
  document.getElementById('s-close').onchange = (e) => { settings.clearOnClose = e.target.checked; saveSettings(); window.kdl.clearOnClose(e.target.checked); };
  document.getElementById('s-3pc').onchange = async (e) => { settings.block3p = e.target.checked; saveSettings(); await window.kdl.thirdPartyCookies(e.target.checked); };
  document.getElementById('s-trk').onchange = async (e) => { settings.trackers = e.target.checked; saveSettings(); await window.kdl.trackers(e.target.checked); };
  document.getElementById('s-clearnow').onclick = async () => { playClearFX(); await window.kdl.clearAll(); toast(tr('settings.cleared')); };
};

// --- À propos / version ---
document.getElementById('btn-about').onclick = async () => {
  let info = { name: 'KDL Privacy Dev Browser', version: '1.3.0' };
  try { info = await window.kdl.about(); } catch { /* */ }
  showPanel(tr('about.title'), `
    <div class="row"><span class="k">${tr('about.name')}</span><span class="v">${esc(info.name)}</span></div>
    <div class="row"><span class="k">${tr('about.version')}</span><span class="v">${esc(info.version)}</span></div>
    <div class="row"><span class="k">${tr('about.license')}</span><span class="v">MIT</span></div>
    <div class="row"><span class="k">${tr('about.identity')}</span><span class="v">KDL TECH</span></div>
    <div class="field" style="padding-top:10px"><label>${tr('about.download')}</label></div>
    <div class="dl-os">
      <button class="dl-os-btn" data-os="win"><svg viewBox="0 0 24 24"><path d="M3 5.5 10.5 4v7.5H3zM10.5 12.5V20L3 18.5V12.5zM12 3.8 21 2v9.5h-9zM21 12.5V22l-9-1.8V12.5z"/></svg>Windows<small>.exe</small></button>
      <button class="dl-os-btn" data-os="mac"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 3c0 1.5-1.3 3-2.8 2.9C13 4.4 14.4 3 16 3zM18.5 16.5c-.5 1.2-1.6 3-3 3-1 0-1.4-.6-2.6-.6s-1.7.6-2.6.6c-1.5 0-2.8-1.9-3.3-3.2-1-2.6-.4-6 1.6-7.2.9-.5 2-.5 2.9 0 .6.3 1.1.3 1.7 0 .9-.5 2-.6 2.9-.1-2.3 1.5-1.9 4.8.4 6.5z"/></svg>macOS<small>.dmg</small></button>
      <button class="dl-os-btn" data-os="deb"><svg viewBox="0 0 24 24"><path d="M12 3a4 4 0 0 1 4 4c0 1.5-.8 2.4-.8 3.5 0 2 2.8 2.6 2.8 6.5 0 2-2.7 4-6 4s-6-2-6-4c0-3.9 2.8-4.5 2.8-6.5 0-1.1-.8-2-.8-3.5a4 4 0 0 1 4-4Z"/></svg>Linux<small>.deb</small></button>
      <button class="dl-os-btn" data-os="appimage"><svg viewBox="0 0 24 24"><path d="M12 3 21 8v8l-9 5-9-5V8z"/><path d="M12 12v9M3 8l9 4 9-4"/></svg>Linux<small>.AppImage</small></button>
    </div>
    <button id="about-gh" class="btn-full btn-accent">${tr('about.github')}</button>
    <small class="muted">${tr('about.free')}</small>
    <small class="muted">${tr('about.ai')}</small>
    <aside data-kdl-promo data-app="privacy-browser" style="margin-top:14px"></aside>
  `);
  panelBody.querySelectorAll('.dl-os-btn').forEach((b) => b.onclick = () => window.kdl.openExternal(DOWNLOAD_URL));
  document.getElementById('about-gh').onclick = () => window.kdl.openExternal(GITHUB);
  // L'encart promo est injecté après le DOMContentLoaded initial (panneau dynamique) :
  // on redéclenche son montage explicitement (kdl/kdl-promo.js).
  if (window.KDLPromo) window.KDLPromo.monter();
};

// Effacer à la fermeture (best effort).

// Historique local minimal (désactivable).
function recordHistory(url) {
  if (settings.noHistory || isHome(url)) return;
  const h = JSON.parse(localStorage.getItem('kdl-history') || '[]');
  h.unshift({ url, t: Date.now() });
  localStorage.setItem('kdl-history', JSON.stringify(h.slice(0, 200)));
}

// --- Zoom de la page active (Ctrl +/-/0) ---
function setZoom(delta, reset) {
  const wv = cur(); if (!wv) return;
  try {
    let z = reset ? 1 : Math.min(3, Math.max(0.3, (wv.getZoomFactor ? wv.getZoomFactor() : 1) + delta));
    wv.setZoomFactor(z);
    toast(reset ? tr('zoom.reset') : tr('zoom.level', { pct: Math.round(z * 100) }), 1200);
  } catch { /* */ }
}

// --- Gestionnaire de téléchargements ---
function fmtBytes(n) {
  const u = [tr('unit.b'), tr('unit.kb'), tr('unit.mb'), tr('unit.gb')];
  if (!n) return '0 ' + u[0]; let i = 0; n = +n;
  while (n >= 1024 && i < 3) { n /= 1024; i++; } return n.toFixed(i ? 1 : 0) + ' ' + u[i];
}
const DL_STATE = { progressing: tr('dl.state.progressing'), paused: tr('dl.state.paused'), completed: tr('dl.state.completed'), cancelled: tr('dl.state.cancelled'), interrupted: tr('dl.state.interrupted') };
let dlPanelOpen = false;

async function openDownloadsPanel() {
  dlPanelOpen = true;
  const list = await window.kdl.dlList();
  const rows = list.length ? list.map(dlRow).join('') : '<div class="empty">' + tr('dl.empty') + '</div>';
  showPanel(tr('dl.title'), `<div id="dl-list">${rows}</div>
    ${list.length ? '<button id="dl-clear" class="btn-full">' + tr('dl.clear') + '</button>' : ''}
    <small class="muted">${tr('dl.note')}</small>`);
  wireDownloads();
}

function dlRow(r) {
  const pct = r.total ? Math.min(100, Math.round(r.received / r.total * 100)) : 0;
  const active = r.state === 'progressing' || r.state === 'paused';
  const done = r.state === 'completed';
  const size = r.total ? fmtBytes(r.received) + ' / ' + fmtBytes(r.total) : fmtBytes(r.received);
  const spd = r.state === 'progressing' && r.speed ? ' · ' + fmtBytes(r.speed) + '/s' : '';
  return `<div class="dl-item" data-id="${r.id}">
    <div class="dl-top"><span class="dl-name" title="${esc(r.name)}">${esc(r.name)}</span>
      <span class="tag ${done ? 'ok' : (active ? 'warn' : 'err')}">${DL_STATE[r.state] || r.state}</span></div>
    <div class="dl-sub">${esc(r.domain || '')} · ${size}${spd}</div>
    ${active ? `<div class="dl-bar"><i style="width:${pct}%"></i></div>` : ''}
    ${r.risky ? '<div class="dl-risky">' + tr('dl.risky') + '</div>' : ''}
    <div class="dl-acts">
      ${r.state === 'progressing' ? '<button data-a="pause">' + tr('dl.pause') + '</button>' : ''}
      ${r.state === 'paused' ? '<button data-a="resume">' + tr('dl.resume') + '</button>' : ''}
      ${active ? '<button data-a="cancel">' + tr('common.cancel') + '</button>' : ''}
      ${done ? '<button data-a="open">' + tr('common.open') + '</button><button data-a="folder">' + tr('dl.folder') + '</button><button data-a="hash">SHA-256</button>' : ''}
      ${!active ? '<button data-a="remove">' + tr('dl.remove') + '</button>' : ''}
    </div>
    <div class="dl-hash hidden"></div>
  </div>`;
}

function wireDownloads() {
  const clr = document.getElementById('dl-clear');
  if (clr) clr.onclick = async () => { await window.kdl.dlClear(); openDownloadsPanel(); };
  panelBody.querySelectorAll('.dl-item').forEach((el) => {
    const id = el.dataset.id;
    el.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'pause') { await window.kdl.dlPause(id); }
      else if (a === 'resume') { await window.kdl.dlResume(id); }
      else if (a === 'cancel') { await window.kdl.dlCancel(id); }
      else if (a === 'open') { const r = await window.kdl.dlOpen(id); if (!r.ok) toast(tr('dl.notFound')); }
      else if (a === 'folder') { await window.kdl.dlFolder(id); }
      else if (a === 'remove') { await window.kdl.dlRemove(id); openDownloadsPanel(); }
      else if (a === 'hash') {
        const box = el.querySelector('.dl-hash'); box.classList.remove('hidden'); box.textContent = tr('dl.hashing');
        const res = await window.kdl.dlHash(id);
        box.textContent = res.ok ? tr('dl.hash', { hash: res.sha256 }) : tr('common.failed', { error: res.error || '' });
      }
    });
  });
}

// Notifications + rafraîchissement live du panneau.
window.kdl.onDlUpdate((rec) => {
  if (rec.state === 'completed') toast(tr('dl.done', { name: rec.name }), 3500);
  else if (rec.state === 'interrupted') toast(tr('dl.interrupted', { name: rec.name }), 3500);
  if (!panel.classList.contains('hidden') && panelTitle.textContent === tr('dl.title')) openDownloadsPanel();
});

// --- Raccourcis clavier ---
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { closeMenu(); if (!panel.classList.contains('hidden')) panel.classList.add('hidden'); return; }
  if (e.ctrlKey && e.shiftKey && k === 't') { e.preventDefault(); const u = closedStack.pop(); if (u) createTab(u); else toast(tr('tab.noReopen')); }
  else if (e.ctrlKey && k === 'l') { e.preventDefault(); urlbar.focus(); urlbar.select(); }
  else if (e.ctrlKey && k === 'r') { e.preventDefault(); cur() && cur().reload(); }
  else if (e.ctrlKey && k === 't') { e.preventDefault(); createTab(HOME); }
  else if (e.ctrlKey && k === 'w') { e.preventDefault(); if (activeId != null) closeTab(activeId); }
  else if (e.ctrlKey && k === 'd') { e.preventDefault(); toggleFav(); }
  else if (e.ctrlKey && k === 'j') { e.preventDefault(); openDownloadsPanel(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); cur() && cur().canGoBack() && cur().goBack(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); cur() && cur().canGoForward() && cur().goForward(); }
  else if (e.ctrlKey && (k === '+' || k === '=')) { e.preventDefault(); setZoom(0.1, false); }
  else if (e.ctrlKey && k === '-') { e.preventDefault(); setZoom(-0.1, false); }
  else if (e.ctrlKey && k === '0') { e.preventDefault(); setZoom(0, true); }
  else if (e.ctrlKey && e.shiftKey && k === 'i') { e.preventDefault(); cur() && cur().openDevTools(); }
  else if (e.key === 'F12') { e.preventDefault(); cur() && cur().openDevTools(); }
  else if (e.ctrlKey && e.shiftKey && k === 'm') { e.preventDefault(); respBar.classList.toggle('hidden'); }
  else if (e.ctrlKey && e.shiftKey && k === 'l') { e.preventDefault(); toggleTheme(); }
});

// --- Menu déroulant (outils secondaires) ---
const menuEl = document.getElementById('menu');
const menuBtn = document.getElementById('btn-menu');
function closeMenu() { menuEl.classList.add('hidden'); menuBtn.setAttribute('aria-expanded', 'false'); }
function toggleMenu() {
  const open = menuEl.classList.toggle('hidden');
  menuBtn.setAttribute('aria-expanded', String(!open));
}
menuBtn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
menuEl.querySelectorAll('.menu-item').forEach((it) => it.addEventListener('click', () => closeMenu()));
document.addEventListener('click', (e) => { if (!menuEl.classList.contains('hidden') && !menuEl.contains(e.target) && e.target !== menuBtn) closeMenu(); });

// ===========================================================================
// KDL IA — panneau assistant (local d'abord ; Ollama et « Mon IA » facultatifs)
// ===========================================================================
let aiInited = false;
async function ensureAI() { if (!aiInited) { await window.KDLAI.init(); aiInited = true; } }

const PROV_LABEL = {
  lite: '<span class="tag ok">' + tr('ai.tag.local') + '</span>', 'lite-missing': '<span class="tag warn">' + tr('ai.tag.liteMissing') + '</span>',
  ollama: '<span class="tag ok">' + tr('ai.tag.ollama') + '</span>', 'ollama-missing': '<span class="tag warn">' + tr('ai.tag.ollamaMissing') + '</span>',
  byok: '<span class="tag warn">' + tr('ai.tag.byok') + '</span>', 'byok-missing': '<span class="tag warn">' + tr('ai.tag.byokMissing') + '</span>',
  none: '<span class="tag warn">' + tr('ai.tag.none') + '</span>', off: '<span class="tag err">' + tr('ai.tag.off') + '</span>',
};

async function getPageForAI() {
  if (!cur()) return { url: '', text: '', selection: '', hasPassword: false };
  return window.KDLAI.gatherPage(cur());
}

function aiShowOut(html) {
  const out = document.getElementById('ai-out');
  if (out) { out.innerHTML = html; out.classList.remove('hidden'); }
}

async function openAIPanel(view) {
  await ensureAI();
  const s = window.KDLAI.getStatus();
  if (view === 'byok') return renderByok(s);
  const modes = [['auto', tr('ai.mode.auto')], ['lite', 'KDL IA Lite'], ['ollama', 'Ollama'], ['byok', tr('ai.mode.byok')], ['off', tr('ai.mode.off')]];
  const genDisabled = ['none', 'off', 'lite', 'lite-missing', 'ollama-missing', 'byok-missing'].includes(s.provider) && s.provider !== 'ollama' && s.provider !== 'byok';
  showPanel('KDL IA', `
    <div class="ai-status">
      <span class="ai-badge">${PROV_LABEL[s.provider] || ''}</span>
      <small class="muted" style="margin:0">${tr('ai.activeProvider', { p: esc(s.provider) })}${s.remote ? tr('ai.leaves') : tr('ai.localProc')}</small>
    </div>
    <div class="field" style="padding-top:4px"><label>${tr('ai.provider')}</label></div>
    <div class="ai-modes">${modes.map(([m, l]) => `<button class="ai-mode ${s.mode === m ? 'on' : ''}" data-mode="${m}">${l}</button>`).join('')}</div>
    ${s.mode === 'ollama' ? renderOllamaPick(s) : ''}
    ${s.mode === 'byok' ? `<div class="ai-sub"><span class="muted">${s.byok.configured ? tr('ai.connected', { p: esc(s.byok.provider || ''), m: esc(s.byok.model || '') }) : tr('ai.noByok')}</span>
       <button id="ai-byok-cfg" class="btn-full">${s.byok.configured ? tr('ai.editByok') : tr('ai.connectByok')}</button></div>` : ''}
    ${s.provider === 'lite-missing' ? `<div class="notice">${tr('ai.liteMissing')}</div>` : ''}

    <div class="field" style="padding-top:6px"><label>${tr('ai.localTools')}</label></div>
    <div class="ai-actions">
      <button class="ai-chip" data-local="resume">${tr('ai.summary')}</button>
      <button class="ai-chip" data-local="points">${tr('ai.keyPoints')}</button>
      <button class="ai-chip" data-local="mots">${tr('ai.keywords')}</button>
    </div>
    <div class="field" style="padding-top:6px"><label>${tr('ai.assistant')}${s.remote ? tr('ai.remoteSuffix') : ''}</label></div>
    <div class="ai-actions">
      ${[['summarize', tr('ai.gen.summarize')], ['explain', tr('ai.gen.explain')], ['simplify', tr('ai.gen.simplify')], ['translate', tr('ai.gen.translate')], ['fiche', tr('ai.gen.fiche')]].map(([k, l]) =>
        `<button class="ai-chip gen" data-gen="${k}">${l}</button>`).join('')}
    </div>
    <div class="field"><label for="ai-len">${tr('ai.length')}</label>
      <input id="ai-len" type="range" min="96" max="512" step="32" value="${s.maxTokens}"></div>
    <div id="ai-out" class="ai-out hidden"></div>
    <small class="muted">${tr('ai.disclaimer')}</small>
  `);
  panelBody.querySelectorAll('.ai-mode').forEach((b) => b.onclick = () => { window.KDLAI.setMode(b.dataset.mode); openAIPanel(); });
  panelBody.querySelectorAll('[data-local]').forEach((b) => b.onclick = () => runLocalAI(b.dataset.local));
  panelBody.querySelectorAll('[data-gen]').forEach((b) => b.onclick = () => runGenAI(b.dataset.gen, false));
  const len = document.getElementById('ai-len'); if (len) len.onchange = () => window.KDLAI.setMaxTokens(+len.value);
  const cfg = document.getElementById('ai-byok-cfg'); if (cfg) cfg.onclick = () => openAIPanel('byok');
  const osel = document.getElementById('ai-ollama-model'); if (osel) osel.onchange = () => window.KDLAI.setOllamaModel(osel.value);
}

function renderOllamaPick(s) {
  if (!s.ollama.available) return `<div class="notice">${tr('ai.ollamaNone')}</div>`;
  if (!s.ollama.models.length) return `<div class="notice">${tr('ai.ollamaNoModels')}</div>`;
  return `<div class="ai-sub"><label class="muted">${tr('ai.ollamaModel')}</label>
    <select id="ai-ollama-model" class="input">${s.ollama.models.map((m) => `<option ${m === s.ollamaModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>`;
}

function renderByok(s) {
  const provs = (s.byok.providers || []);
  const sel = s.byok.provider || (provs[0] && provs[0].id) || 'anthropic';
  showPanel(tr('byok.title'), `
    <div class="notice">${tr('byok.notice')}</div>
    <div class="field"><label>${tr('ai.provider')}</label></div>
    <select id="by-prov" class="input">${provs.map((p) => `<option value="${esc(p.id)}" data-def="${esc(p.defaultModel)}" ${p.id === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
    <div id="by-baseurl-wrap" class="hidden"><div class="field"><label>${tr('byok.baseUrl')}</label></div>
      <input id="by-baseurl" class="input" type="text" placeholder="${tr('byok.baseUrlPh')}" value="${esc(s.byok.baseUrl || '')}"></div>
    <div class="field"><label>${tr('byok.model')}</label></div>
    <input id="by-model" class="input" type="text" placeholder="${tr('byok.modelPh')}" value="${esc(s.byok.model || '')}">
    <div class="field"><label>${tr('byok.key')}</label></div>
    <input id="by-key" class="input" type="password" placeholder="${s.byok.hasKey ? tr('byok.keySaved') : tr('byok.keyPh')}" autocomplete="off">
    <button id="by-save" class="btn-full btn-accent">${tr('common.save')}</button>
    ${s.byok.configured ? '<button id="by-clear" class="btn-full">' + tr('byok.clear') + '</button>' : ''}
    <button id="by-back" class="btn-full">${tr('common.back')}</button>
    <small class="muted">${tr('byok.note')}</small>
  `);
  const prov = document.getElementById('by-prov');
  const model = document.getElementById('by-model');
  const baseWrap = document.getElementById('by-baseurl-wrap');
  const syncProv = () => {
    const opt = prov.options[prov.selectedIndex];
    if (!model.value) model.placeholder = opt.dataset.def || tr('byok.modelPh');
    baseWrap.classList.toggle('hidden', prov.value !== 'custom');
  };
  prov.onchange = syncProv; syncProv();
  document.getElementById('by-back').onclick = () => openAIPanel();
  document.getElementById('by-save').onclick = async () => {
    const cfg = { provider: prov.value, model: model.value.trim() || (prov.options[prov.selectedIndex].dataset.def || ''), key: document.getElementById('by-key').value, baseUrl: (document.getElementById('by-baseurl') || {}).value || '' };
    const res = await window.kdl.byokSet(cfg);
    if (!res.ok) return toast(tr('common.failed', { error: res.error || tr('ai.tag.byokMissing') }));
    await window.KDLAI.refreshByok(); window.KDLAI.setMode('byok'); toast(tr('byok.connected')); openAIPanel();
  };
  const clr = document.getElementById('by-clear');
  if (clr) clr.onclick = async () => { await window.kdl.byokClear(); await window.KDLAI.refreshByok(); toast(tr('byok.cleared')); openAIPanel('byok'); };
}

async function runLocalAI(kind) {
  const page = await getPageForAI();
  const text = (page.selection && page.selection.trim().length > 20) ? page.selection : page.text;
  if (!text) return aiShowOut('<p class="muted">' + tr('ai.noText') + '</p>');
  const r = window.KDLAI.runLocal(kind, text);
  const badge = ' <span class="tag ok">' + tr('ai.badgeLocal') + '</span>';
  if (kind === 'resume') aiShowOut('<div class="ai-out-h">' + tr('ai.summary') + badge + '</div><p>' + esc(r.text) + '</p>');
  else if (kind === 'points') aiShowOut('<div class="ai-out-h">' + tr('ai.keyPoints') + badge + '</div><ul>' + r.points.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>');
  else if (kind === 'mots') aiShowOut('<div class="ai-out-h">' + tr('ai.keywords') + badge + '</div><div class="kw">' + r.mots.map((k) => '<span class="kw-item">' + esc(k.term) + '</span>').join('') + '</div>');
}

async function runGenAI(kind, confirmed) {
  const page = await getPageForAI();
  if (!page.text && !page.selection) return aiShowOut('<p class="muted">' + tr('ai.nothingToAnalyze') + '</p>');
  aiShowOut('<p class="muted">' + tr('ai.generating') + '</p>');
  const res = await window.KDLAI.run(kind, page, { confirmedSensitive: confirmed });
  if (res.needConfirm) {
    aiShowOut(`<div class="notice">${res.remote ? tr('ai.remoteWarn') : tr('ai.sensitiveWarn')} ${tr('ai.preview')}</div>
      <p class="ai-preview">${esc(res.preview)}…</p>
      <button id="ai-confirm" class="btn-full btn-accent">${tr('ai.confirmSend')}</button>`);
    const c = document.getElementById('ai-confirm'); if (c) c.onclick = () => runGenAI(kind, true);
    return;
  }
  if (res.ok) return aiShowOut('<div class="ai-out-h">' + tr('ai.assistant') + ' <span class="tag ok">' + esc(res.via || tr('ai.badgeAi')) + '</span></div><p>' + esc(res.text) + '</p>');
  if (res.fallback) {
    aiShowOut(`<div class="notice">${tr('ai.fallback', { reason: esc(res.reason) })}</div>
      <button class="ai-chip" data-fb="resume">${tr('ai.localSummary')}</button> <button class="ai-chip" data-fb="points">${tr('ai.keyPoints')}</button>`);
    panelBody.querySelectorAll('[data-fb]').forEach((b) => b.onclick = () => runLocalAI(b.dataset.fb));
    return;
  }
  aiShowOut('<p class="muted">' + esc(res.error || tr('ai.unavailable')) + '</p>');
}

document.getElementById('btn-ai').onclick = () => openAIPanel();
document.getElementById('btn-downloads').onclick = () => openDownloadsPanel();

// ===========================================================================
// TurboDL : envoi des liens et des téléchargements au gestionnaire KDL TECH
// ===========================================================================
async function openTurboDLPanel() {
  const st = await window.kdl.tdlStatus();
  const u = cur() ? cur().getURL() : '';
  const page = isHome(u) ? '' : u;
  showPanel('TurboDL', `
    <div class="row"><span class="k">${tr('tdl.state')}</span><span class="v">${st.running
      ? `<span class="tag ok">${tr('tdl.connected')}</span> v${esc(st.version)}`
      : '<span class="tag err">' + tr('tdl.notRunning') + '</span>'}</span></div>
    ${st.running ? '' : '<button id="tdl-launch" class="btn-full">' + tr('tdl.launch') + '</button>'}
    <div class="field" style="padding-top:8px"><label for="tdl-url">${tr('tdl.linkLabel')}</label>
      <input id="tdl-url" class="input" placeholder="${tr('tdl.placeholder')}" autocomplete="off"></div>
    <button id="tdl-go" class="btn-full">${tr('tdl.send')}</button>
    ${page ? '<button id="tdl-page" class="btn-full">' + tr('tdl.sendPage') + '</button>' : ''}
    <label class="row" style="cursor:pointer"><span class="k">${tr('tdl.intercept')}</span>
      <span class="v"><input id="tdl-intercept" type="checkbox" ${st.intercept ? 'checked' : ''}></span></label>
    <small class="muted">${tr('tdl.note')}</small>
  `);
  const send = async (url) => {
    const r = await window.kdl.tdlSend(url, page);
    toast(r.ok ? (r.name ? tr('tdl.sentName', { name: r.name }) : tr('tdl.sent')) : (r.error || tr('tdl.sendFailed')), 3600);
  };
  const inp = document.getElementById('tdl-url');
  document.getElementById('tdl-go').onclick = () => { if (inp.value.trim()) send(inp.value.trim()); else toast(tr('tdl.pasteFirst')); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('tdl-go').click(); };
  const pg = document.getElementById('tdl-page'); if (pg) pg.onclick = () => send(page);
  const la = document.getElementById('tdl-launch');
  if (la) la.onclick = async () => { const r = await window.kdl.tdlLaunch(); toast(r.ok ? tr('tdl.starting') : r.error); setTimeout(openTurboDLPanel, 4000); };
  document.getElementById('tdl-intercept').onchange = async (e) => {
    await window.kdl.tdlIntercept(e.target.checked);
    toast(e.target.checked ? tr('tdl.interceptOn') : tr('tdl.interceptOff'));
  };
}
document.getElementById('btn-turbodl').onclick = () => openTurboDLPanel();
window.kdl.onTdlEvent((d) => toast(d.ok ? (d.name ? tr('tdl.entrustedName', { name: d.name }) : tr('tdl.entrusted')) : tr('tdl.error', { error: d.error || tr('tdl.failed') }) + (/^https?:/i.test(d.url) ? tr('tdl.fallbackDl') : ''), 4000));

// ===========================================================================
// Centre de confidentialité par site
// ===========================================================================
const PERMS = [['camera', tr('perm.camera')], ['microphone', tr('perm.microphone')], ['geolocation', tr('perm.geolocation')], ['notifications', tr('perm.notifications')]];
async function openSitePanel() {
  const u = cur() ? cur().getURL() : '';
  if (isHome(u)) return toast(tr('site.needSite'));
  let origin = '', host = '', https = false;
  try { const url = new URL(u); origin = url.origin; host = url.hostname; https = url.protocol === 'https:'; } catch { return toast(tr('site.na')); }
  const info = await window.kdl.siteInfo(origin);
  let trk = { enabled: true, count: 0 };
  try { trk = await window.kdl.trackersCount(cur().getWebContentsId()); } catch { /* */ }
  const permRows = PERMS.map(([k, l]) => {
    const v = info.perms[k] || 'default';
    return `<div class="row"><span class="k">${l}</span><span class="v">
      <select class="input site-perm" data-k="${k}" style="height:28px;width:auto">
        <option value="default" ${v === 'default' ? 'selected' : ''}>${tr('perm.default')}</option>
        <option value="allow" ${v === 'allow' ? 'selected' : ''}>${tr('perm.allow')}</option>
        <option value="deny" ${v === 'deny' ? 'selected' : ''}>${tr('perm.deny')}</option>
      </select></span></div>`;
  }).join('');
  showPanel(tr('site.title'), `
    <div class="row"><span class="k">${tr('info.domain')}</span><span class="v">${esc(host)}</span></div>
    <div class="row"><span class="k">${tr('site.connection')}</span><span class="v">${https ? '<span class="tag ok">HTTPS</span>' : '<span class="tag err">' + tr('info.insecure') + '</span>'}</span></div>
    <div class="row"><span class="k">${tr('site.cookies')}</span><span class="v">${info.cookies}</span></div>
    <div class="row"><span class="k">${tr('site.trackers')}</span><span class="v">${trk.enabled ? trk.count : tr('site.blockOff')}</span></div>
    <div class="field" style="padding-top:8px"><label>${tr('site.perms')}</label></div>
    ${permRows}
    <button id="site-cookies" class="btn-full">${tr('site.clearCookies')}</button>
    <button id="site-data" class="btn-full">${tr('site.clearData')}</button>
    <button id="site-reset" class="btn-full">${tr('site.resetPerms')}</button>
    <small class="muted">${tr('site.note')}</small>
  `);
  panelBody.querySelectorAll('.site-perm').forEach((s) => s.onchange = async () => { await window.kdl.permSet(origin, s.dataset.k, s.value); toast(tr('site.permUpdated')); });
  document.getElementById('site-cookies').onclick = async () => { const r = await window.kdl.siteClearCookies(origin); playClearFX(); toast(r.ok ? tr('site.cookiesCleared', { n: r.removed }) : tr('common.failedShort')); };
  document.getElementById('site-data').onclick = async () => { playClearFX(); await window.kdl.clearSiteData(origin); toast(tr('site.dataCleared')); };
  document.getElementById('site-reset').onclick = async () => { await window.kdl.permReset(origin); toast(tr('site.permsReset')); openSitePanel(); };
}
document.getElementById('btn-site').onclick = () => openSitePanel();

// ===========================================================================
// Espaces de travail & sessions (local)
// ===========================================================================
function getWs() {
  let w = JSON.parse(localStorage.getItem('kdl-workspaces') || 'null');
  if (!w) { w = [{ id: 'p', name: tr('ws.personal'), tabs: [] }, { id: 'd', name: tr('ws.dev'), tabs: [] }, { id: 'k', name: 'KDL-TECH', tabs: [] }]; saveWs(w); }
  return w;
}
function saveWs(w) { localStorage.setItem('kdl-workspaces', JSON.stringify(w)); }
function currentOpenTabs() {
  return tabs.map((t) => { let url = t.url; try { url = t.wv.getURL() || t.url; } catch { /* */ } return { url, title: t.title }; })
    .filter((t) => t.url && !isHome(t.url));
}
function openWorkspacesPanel() {
  const w = getWs();
  const rows = w.map((ws, i) => `<div class="ws-item">
    <div class="ws-top"><b>${esc(ws.name)}</b><span class="tag ok">${tr('ws.tabs', { n: ws.tabs.length })}</span></div>
    <div class="dl-acts">
      <button data-a="restore" data-i="${i}">${tr('common.open')}</button>
      <button data-a="save" data-i="${i}">${tr('ws.saveHere')}</button>
      <button data-a="rename" data-i="${i}">${tr('ws.rename')}</button>
      <button data-a="del" data-i="${i}">${tr('common.delete')}</button>
    </div></div>`).join('');
  showPanel(tr('ws.title'), `<div id="ws-list">${rows}</div>
    <button id="ws-new" class="btn-full">${tr('ws.new')}</button>
    <button id="ws-reopen" class="btn-full">${tr('ws.reopen')}</button>
    <button id="ws-export" class="btn-full">${tr('common.exportJson')}</button>
    <button id="ws-import" class="btn-full">${tr('common.importJson')}</button>
    <small class="muted">${tr('ws.note')}</small>`);
  panelBody.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => wsAction(b.dataset.a, +b.dataset.i));
  document.getElementById('ws-new').onclick = () => { const n = prompt(tr('ws.newPrompt')); if (n) { const w2 = getWs(); w2.push({ id: 'w' + Date.now(), name: n.slice(0, 40), tabs: [] }); saveWs(w2); openWorkspacesPanel(); } };
  document.getElementById('ws-reopen').onclick = () => { const url = closedStack.pop(); if (url) createTab(url); else toast(tr('tab.noReopen')); };
  document.getElementById('ws-export').onclick = async () => { const r = await window.kdl.saveText('kdl-espaces.json', JSON.stringify(getWs(), null, 2)); toast(r.ok ? tr('ws.exported') : tr('ws.canceled')); };
  document.getElementById('ws-import').onclick = async () => { const r = await window.kdl.importFavs(); if (r.ok && Array.isArray(r.data)) { saveWs(r.data.filter((x) => x && x.name)); openWorkspacesPanel(); toast(tr('ws.imported')); } else toast(tr('ws.importInvalid')); };
}
function wsAction(a, i) {
  const w = getWs(); const ws = w[i]; if (!ws) return;
  if (a === 'restore') { if (!ws.tabs.length) return toast(tr('ws.empty')); ws.tabs.forEach((t) => createTab(t.url)); panel.classList.add('hidden'); toast(tr('ws.opened', { name: ws.name })); }
  else if (a === 'save') { ws.tabs = currentOpenTabs(); saveWs(w); openWorkspacesPanel(); toast(tr('ws.saved', { n: ws.tabs.length })); }
  else if (a === 'rename') { const n = prompt(tr('ws.renamePrompt'), ws.name); if (n) { ws.name = n.slice(0, 40); saveWs(w); openWorkspacesPanel(); } }
  else if (a === 'del') { if (confirm(tr('ws.confirmDel', { name: ws.name }))) { w.splice(i, 1); saveWs(w); openWorkspacesPanel(); } }
}
document.getElementById('btn-workspaces').onclick = () => openWorkspacesPanel();

// ===========================================================================
// Boîte à outils développeur
// ===========================================================================
async function openDevboxPanel() {
  if (!cur() || isHome(cur().getURL())) return toast(tr('site.needSite'));
  let d = {};
  try {
    const raw = await cur().executeJavaScript(`(function(){
      var nav=(performance.getEntriesByType('navigation')||[])[0]||{};
      var res=performance.getEntriesByType('resource')||[]; var host=location.hostname; var tp={};
      res.forEach(function(r){try{var h=new URL(r.name).hostname;if(h&&h!==host)tp[h]=1;}catch(e){}});
      return JSON.stringify({url:location.href,title:document.title,proto:location.protocol,
        ctype:document.contentType||'',charset:document.characterSet||'',doctype:document.doctype?document.doctype.name:'—',
        resCount:res.length,thirdParty:Object.keys(tp),loadMs:nav.duration?Math.round(nav.duration):0});
    })()`, true);
    d = JSON.parse(raw);
  } catch { return toast(tr('devbox.analyzeFail')); }
  const errs = (activeTab() && activeTab().console || []).filter((c) => c.level >= 2);
  showPanel(tr('devbox.title'), `
    <div class="row"><span class="k">URL</span><span class="v">${esc(d.url)}</span></div>
    <div class="row"><span class="k">${tr('common.title')}</span><span class="v">${esc(d.title || '—')}</span></div>
    <div class="row"><span class="k">${tr('info.protocol')}</span><span class="v">${esc(d.proto)} ${d.proto === 'https:' ? '<span class="tag ok">HTTPS</span>' : '<span class="tag err">HTTP</span>'}</span></div>
    <div class="row"><span class="k">${tr('devbox.type')}</span><span class="v">${esc(d.ctype)} · ${esc(d.charset)}</span></div>
    <div class="row"><span class="k">Doctype</span><span class="v">${esc(d.doctype)}</span></div>
    <div class="row"><span class="k">${tr('devbox.load')}</span><span class="v">${d.loadMs ? d.loadMs + ' ms' : '—'}</span></div>
    <div class="row"><span class="k">${tr('devbox.requests')}</span><span class="v">${d.resCount}</span></div>
    <div class="row"><span class="k">${tr('devbox.thirdParty')}</span><span class="v">${(d.thirdParty || []).length}</span></div>
    <div class="dl-acts" style="margin:8px 0">
      <button id="db-url">${tr('devbox.copyUrl')}</button>
      <button id="db-title">${tr('devbox.copyTitle')}</button>
      <button id="db-md">${tr('devbox.mdLink')}</button>
      <button id="db-devtools">DevTools</button>
      <button id="db-shot">${tr('devbox.capture')}</button>
    </div>
    ${d.ctype && /json/i.test(d.ctype) ? '<button id="db-json" class="btn-full">' + tr('devbox.json') + '</button>' : ''}
    <div class="field" style="padding-top:6px"><label>${tr('devbox.consoleErrors', { n: errs.length })}</label></div>
    <div class="db-console">${errs.length ? errs.map((e) => '<div class="db-err">' + esc(e.message) + '</div>').join('') : '<div class="empty">' + tr('devbox.noErrors') + '</div>'}</div>
    ${errs.length ? '<button id="db-explain" class="btn-full btn-accent">' + tr('devbox.explain') + '</button>' : ''}
    <div id="db-out" class="ai-out hidden"></div>
  `);
  const copy = (t) => { try { navigator.clipboard.writeText(t); toast(tr('devbox.copied')); } catch { toast(tr('devbox.copyFail')); } };
  document.getElementById('db-url').onclick = () => copy(d.url);
  document.getElementById('db-title').onclick = () => copy(d.title || '');
  document.getElementById('db-md').onclick = () => copy('[' + (d.title || d.url) + '](' + d.url + ')');
  document.getElementById('db-devtools').onclick = () => cur() && cur().openDevTools();
  document.getElementById('db-shot').onclick = () => document.getElementById('btn-shot').click();
  const jb = document.getElementById('db-json');
  if (jb) jb.onclick = async () => {
    try { const body = await cur().executeJavaScript('document.body.innerText'); const pretty = JSON.stringify(JSON.parse(body), null, 2);
      document.getElementById('db-out').classList.remove('hidden'); document.getElementById('db-out').innerHTML = '<pre style="white-space:pre-wrap;font-size:11px;margin:0">' + esc(pretty) + '</pre>'; }
    catch { toast(tr('devbox.badJson')); }
  };
  const eb = document.getElementById('db-explain');
  if (eb) eb.onclick = async () => {
    await ensureAI();
    const out = document.getElementById('db-out'); out.classList.remove('hidden'); out.innerHTML = '<p class="muted">' + tr('devbox.analyzing') + '</p>';
    const res = await window.KDLAI.run('error', { url: d.url, text: errs[0].message, selection: '', hasPassword: false }, { confirmedSensitive: true });
    out.innerHTML = res.ok ? '<div class="ai-out-h">' + tr('devbox.explanation') + ' <span class="tag ok">' + esc(res.via || tr('ai.badgeAi')) + '</span></div><p>' + esc(res.text) + '</p>' : '<p class="muted">' + esc(res.reason || res.error || tr('devbox.aiOff')) + '</p>';
  };
}
document.getElementById('btn-devbox').onclick = () => openDevboxPanel();

// Hook IA du mode lecture : réutilise le service (avec confirmation intégrée).
window.KDLReader.setAIHook(async (kind, text) => {
  await ensureAI();
  const res = await window.KDLAI.run(kind, { url: cur() ? cur().getURL() : '', text, selection: '', hasPassword: false }, { confirmedSensitive: true });
  return res.ok ? { ok: true, text: res.text } : { ok: false, error: res.reason || res.error || tr('ai.unavailable') };
});

// --- Démarrage : un onglet d'accueil ---
createTab(HOME);
urlbar.focus();
