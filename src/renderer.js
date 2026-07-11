'use strict';

const DDG = 'https://duckduckgo.com/?q=';
const AHMIA = 'https://ahmia.fi/search/?q=';
const HOME = 'home.html';
const GITHUB = 'https://github.com/Kdl-Tech/kdl-privacy-dev-browser';

const urlbar = document.getElementById('urlbar');
const lock = document.getElementById('lock');
const toastEl = document.getElementById('toast');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const respBar = document.getElementById('responsive-bar');
const viewport = document.getElementById('viewport');
const tabsEl = document.getElementById('tabs');

function homeURL() { return location.href.replace(/index\.html(\?.*)?(#.*)?$/, HOME); }
function isHome(url) { return !url || url.includes(HOME); }

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
  const tab = { id: ++seq, wv, title: 'Nouvel onglet', url: target };
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
    el.title = t.failed ? 'Échec de chargement — ' + t.title : t.title;

    const spin = document.createElement('span'); spin.className = 'tab-spin';
    const fav = document.createElement('img'); fav.className = 'tab-fav';
    if (t.favicon && !isHome(t.url)) { fav.src = t.favicon; fav.onerror = () => fav.classList.add('blank'); }
    else fav.classList.add('blank');

    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = (t.title && t.title !== 'Nouvel onglet') ? t.title : (isHome(t.url) ? 'Accueil' : 'Onglet');

    const x = document.createElement('button');
    x.className = 'tab-close'; x.innerHTML = CLOSE_SVG; x.title = 'Fermer (Ctrl+W)';
    x.setAttribute('aria-label', 'Fermer l’onglet');

    el.appendChild(spin); el.appendChild(fav); el.appendChild(label); el.appendChild(x);
    el.onclick = (e) => { if (e.target !== x && !x.contains(e.target)) activate(t.id); };
    x.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
    tabsEl.appendChild(el);
  });
}
document.getElementById('newtab').onclick = () => createTab(HOME);

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
  btnFav.title = fav ? 'Retirer des favoris (Ctrl+D)' : 'Ajouter aux favoris (Ctrl+D)';
}
function toggleFav() {
  const url = cur() ? cur().getURL() : '';
  if (isHome(url)) return toast('Rien à mettre en favori (page d’accueil).');
  const favs = getFavs();
  const idx = favs.findIndex((f) => f.url === url);
  if (idx >= 0) { favs.splice(idx, 1); saveFavs(favs); updateStar(url); return toast('Retiré des favoris.'); }
  let domain = ''; try { domain = new URL(url).hostname; } catch { /* */ }
  favs.unshift({ title: document.title.replace(/^KDL · /, '') || url, url, domain, added: Date.now() });
  saveFavs(favs); updateStar(url); toast('Ajouté aux favoris.');
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
          <button data-edit="${gi}" title="Éditer">✎</button>
          <button data-del="${gi}" title="Supprimer">🗑</button></div>`;
      }).join('')
    : '<div class="empty">Aucun favori pour l’instant.<br>Ajoutez la page courante avec ☆ ou Ctrl+D.</div>';
  showPanel('Favoris', `
    <input id="fav-search" class="input" type="text" placeholder="Rechercher un favori…" value="${esc(filter)}" style="margin-bottom:10px" />
    <div id="fav-list">${list}</div>
    <button id="fav-export" class="btn-full">Exporter (JSON)</button>
    <button id="fav-import" class="btn-full">Importer (JSON)</button>
    <small class="muted">Stockage local uniquement — aucun cloud. Doublons d'URL exacts ignorés.</small>
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
  showPanel('Éditer le favori', `
    <div class="field"><label>Titre</label></div>
    <input id="ef-title" class="input" type="text" value="${esc(f.title)}" />
    <div class="field"><label>URL</label></div>
    <input id="ef-url" class="input" type="text" value="${esc(f.url)}" />
    <button id="ef-save" class="btn-full btn-accent">Enregistrer</button>
    <button id="ef-cancel" class="btn-full">Annuler</button>
  `);
  document.getElementById('ef-cancel').onclick = () => renderFavsPanel(filter);
  document.getElementById('ef-save').onclick = () => {
    const title = document.getElementById('ef-title').value.trim();
    const url = document.getElementById('ef-url').value.trim();
    if (!url) return toast('URL vide.');
    const a = getFavs();
    if (a.some((x, j) => j !== i && x.url === url)) return toast('Doublon : cette URL existe déjà.');
    let domain = ''; try { domain = new URL(url).hostname; } catch { /* */ }
    a[i] = { ...a[i], title: title || url, url, domain };
    saveFavs(a); renderFavsPanel(filter); toast('Favori mis à jour.');
  };
}

async function exportFavs() {
  const res = await window.kdl.exportFavs(getFavs());
  toast(res.ok ? 'Favoris exportés : ' + res.file : (res.canceled ? 'Export annulé.' : 'Échec export.'));
}
async function importFavs() {
  const res = await window.kdl.importFavs();
  if (!res.ok) return toast(res.canceled ? 'Import annulé.' : 'Échec import : ' + (res.error || 'fichier invalide'));
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
  saveFavs(a); renderFavsPanel(); toast(`Import : ${added} favori(s) ajouté(s).`);
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
    toast(res.ok ? 'Capture : ' + res.file : 'Échec capture : ' + res.error);
  } catch (err) { toast('Capture impossible : ' + err); }
};

// --- Mode lecture (sans distraction) ---
document.getElementById('btn-reader').onclick = () => {
  if (!cur()) return;
  const u = cur().getURL();
  if (isHome(u)) return toast('Le mode lecture s’utilise sur une page web.');
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
  toast(res.ok ? 'Données nettoyées : ' + (res.origin || 'site') : 'Échec nettoyage');
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
  showPanel('Infos page', `
    <div class="row"><span class="k">URL</span><span class="v">${esc(url)}</span></div>
    <div class="row"><span class="k">Titre</span><span class="v">${esc(data.title || '—')}</span></div>
    <div class="row"><span class="k">Domaine</span><span class="v">${esc(u ? u.hostname : '—')}</span></div>
    <div class="row"><span class="k">Protocole</span><span class="v">${esc(data.proto || (u ? u.protocol : '—'))}
      ${https ? '<span class="tag ok">HTTPS</span>' : '<span class="tag err">NON SÉCURISÉ</span>'}</span></div>
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
  } catch (err) { return toast('Audit impossible sur cette page'); }
  const checks = [
    ['Titre', !!audit.title, audit.title ? 'présent' : 'absent'],
    ['Meta description', !!audit.desc, audit.desc ? 'présente' : 'absente'],
    ['Balise H1', audit.h1 > 0, audit.h1 + ' trouvée(s)'],
    ['HTTPS', audit.https, audit.https ? 'oui' : 'non'],
    ['Images sans alt', audit.imgsNoAlt === 0, audit.imgsNoAlt + ' / ' + audit.imgs],
    ['Liens externes', true, String(audit.extLinks)]
  ];
  const failed = checks.filter((c) => !c[1] && c[0] !== 'Liens externes').length;
  const status = failed === 0 ? '<span class="tag ok">OK</span>' : `<span class="tag warn">À VÉRIFIER (${failed})</span>`;
  showPanel('Audit léger', `
    <div class="row"><span class="k">Statut global</span><span class="v">${status}</span></div>
    ${checks.map((c) => `<div class="row"><span class="k">${c[0]}</span>
      <span class="v">${esc(c[2])} ${c[1] ? '<span class="tag ok">✓</span>' : (c[0] === 'Liens externes' ? '' : '<span class="tag warn">!</span>')}</span></div>`).join('')}
    <small class="muted">Audit maison — pas un remplacement de Lighthouse.</small>
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
  const torLine = tor.found ? '<span class="tag ok">Tor Browser détecté</span>' : '<span class="tag err">Tor Browser non détecté</span>';
  showPanel('Onion Search', `
    <div class="notice"><b>Usage légal uniquement.</b> Cet outil ne sert qu'à la recherche
      d'informations licites. Les .onion ne sont jamais ouverts dans ce navigateur.</div>
    <div class="row"><span class="k">État Tor</span><span class="v">${torLine}</span></div>
    <input id="onion-q" class="input" type="text" placeholder="Termes de recherche Ahmia" value="${esc(prefill)}" style="margin-top:10px" />
    <button id="onion-go" class="btn-full btn-accent">Rechercher (page publique Ahmia)</button>
    <button id="onion-tor" class="btn-full">${tor.found ? 'Ouvrir Ahmia dans Tor Browser' : 'Tor Browser introuvable'}</button>
    <small class="muted">Une adresse .onion saisie dans la barre affiche un avertissement et propose Tor Browser uniquement.</small>
  `);
  document.getElementById('onion-go').onclick = () => {
    const q = document.getElementById('onion-q').value.trim();
    if (q) navigate(AHMIA + encodeURIComponent(q));
  };
  document.getElementById('onion-tor').onclick = async () => {
    if (!tor.found) return toast('Installez Tor Browser puis réessayez (aucune installation auto).');
    const q = document.getElementById('onion-q').value.trim();
    const res = await window.kdl.openTor(AHMIA + encodeURIComponent(q || ''));
    toast(res.ok ? 'Ouverture dans Tor Browser…' : 'Échec : ' + res.error);
  };
}
function onionWarning(url) {
  showPanel('Adresse .onion détectée', `
    <div class="notice"><b>Avertissement.</b> Les adresses .onion ne sont pas ouvertes
      directement dans KDL Privacy Dev Browser.</div>
    <div class="row"><span class="k">URL</span><span class="v">${esc(url)}</span></div>
    <button id="onion-open-tor" class="btn-full btn-accent">Ouvrir avec Tor Browser</button>
    <small class="muted">Usage légal uniquement.</small>
  `);
  document.getElementById('onion-open-tor').onclick = async () => {
    const res = await window.kdl.openTor(url);
    toast(res.ok ? 'Ouverture dans Tor Browser…' : 'Échec : ' + (res.error || 'Tor introuvable'));
  };
}

// --- Paramètres confidentialité ---
const settings = JSON.parse(localStorage.getItem('kdl-settings') || '{}');
function saveSettings() { localStorage.setItem('kdl-settings', JSON.stringify(settings)); }
document.getElementById('btn-settings').onclick = () => {
  showPanel('Confidentialité', `
    <div class="field"><label for="s-hist">Désactiver l'historique local</label>
      <input type="checkbox" id="s-hist" ${settings.noHistory ? 'checked' : ''}></div>
    <div class="field"><label for="s-close">Effacer les données à la fermeture</label>
      <input type="checkbox" id="s-close" ${settings.clearOnClose ? 'checked' : ''}></div>
    <div class="field"><label for="s-3pc">Bloquer cookies tiers</label>
      <input type="checkbox" id="s-3pc" ${settings.block3p ? 'checked' : ''}></div>
    <button id="s-clearnow" class="btn-full">Effacer les données de navigation</button>
    <small class="muted">DuckDuckGo par défaut · aucune télémétrie · aucun tracking KDL · aucun compte requis.
      Le nettoyage cible les pages (persist:kdl), pas vos favoris/préférences.</small>
  `);
  document.getElementById('s-hist').onchange = (e) => { settings.noHistory = e.target.checked; saveSettings(); };
  document.getElementById('s-close').onchange = (e) => { settings.clearOnClose = e.target.checked; saveSettings(); };
  document.getElementById('s-3pc').onchange = async (e) => { settings.block3p = e.target.checked; saveSettings(); await window.kdl.thirdPartyCookies(e.target.checked); };
  document.getElementById('s-clearnow').onclick = async () => { playClearFX(); await window.kdl.clearAll(); toast('Données de navigation effacées (favoris conservés).'); };
};

// --- À propos / version ---
document.getElementById('btn-about').onclick = async () => {
  let info = { name: 'KDL Privacy Dev Browser', version: '1.3.0' };
  try { info = await window.kdl.about(); } catch { /* */ }
  showPanel('À propos', `
    <div class="row"><span class="k">Nom</span><span class="v">${esc(info.name)}</span></div>
    <div class="row"><span class="k">Version</span><span class="v">${esc(info.version)}</span></div>
    <div class="row"><span class="k">Licence</span><span class="v">MIT</span></div>
    <div class="row"><span class="k">Identité</span><span class="v">KDL TECH</span></div>
    <button id="about-gh" class="btn-full btn-accent">Voir sur GitHub</button>
    <small class="muted">Logiciel libre et gratuit. Non affilié à DuckDuckGo, au Tor Project ni à Ahmia.</small>
    <small class="muted">Assistant IA gratuit : architecture préparée, non activée dans cette version.</small>
  `);
  document.getElementById('about-gh').onclick = () => window.kdl.openExternal(GITHUB);
};

// Effacer à la fermeture (best effort).
window.addEventListener('beforeunload', () => { if (settings.clearOnClose) window.kdl.clearAll(); });

// Historique local minimal (désactivable).
function recordHistory(url) {
  if (settings.noHistory || isHome(url)) return;
  const h = JSON.parse(localStorage.getItem('kdl-history') || '[]');
  h.unshift({ url, t: Date.now() });
  localStorage.setItem('kdl-history', JSON.stringify(h.slice(0, 200)));
}

// Notifications de téléchargement.
window.kdl.onDownload((info) => {
  if (info.state === 'completed') toast('Téléchargé : ' + info.name + ' → ' + info.file, 4000);
  else toast('Téléchargement échoué : ' + (info.name || '') + ' (' + info.state + ')', 4000);
});

// --- Zoom de la page active (Ctrl +/-/0) ---
function setZoom(delta, reset) {
  const wv = cur(); if (!wv) return;
  try {
    let z = reset ? 1 : Math.min(3, Math.max(0.3, (wv.getZoomFactor ? wv.getZoomFactor() : 1) + delta));
    wv.setZoomFactor(z);
    toast(reset ? 'Zoom réinitialisé (100 %)' : 'Zoom ' + Math.round(z * 100) + ' %', 1200);
  } catch { /* */ }
}

// --- Panneau Téléchargements (dossier local dédié) ---
function openDownloadsPanel() {
  showPanel('Téléchargements', `
    <div class="empty">Les fichiers sont enregistrés dans<br><b class="muted">Bureau/kdl-telechargements</b><br>
      Aucune exécution ni ouverture automatique.</div>
    <small class="muted">Un fichier téléchargé déclenche une notification en bas de l'écran.
      Stockage local uniquement — aucun cloud.</small>
  `);
}

// --- Raccourcis clavier ---
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { closeMenu(); if (!panel.classList.contains('hidden')) panel.classList.add('hidden'); return; }
  if (e.ctrlKey && e.shiftKey && k === 't') { e.preventDefault(); const u = closedStack.pop(); if (u) createTab(u); else toast('Aucun onglet à rouvrir.'); }
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
  lite: '<span class="tag ok">Locale</span>', 'lite-missing': '<span class="tag warn">modèle à installer</span>',
  ollama: '<span class="tag ok">Ollama · local</span>', 'ollama-missing': '<span class="tag warn">Ollama indisponible</span>',
  byok: '<span class="tag warn">Mon IA · distant</span>', 'byok-missing': '<span class="tag warn">clé requise</span>',
  none: '<span class="tag warn">aucun modèle</span>', off: '<span class="tag err">désactivée</span>',
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
  const modes = [['auto', 'Auto'], ['lite', 'KDL IA Lite'], ['ollama', 'Ollama'], ['byok', 'Mon IA'], ['off', 'Désactivée']];
  const genDisabled = ['none', 'off', 'lite', 'lite-missing', 'ollama-missing', 'byok-missing'].includes(s.provider) && s.provider !== 'ollama' && s.provider !== 'byok';
  showPanel('KDL IA', `
    <div class="ai-status">
      <span class="ai-badge">${PROV_LABEL[s.provider] || ''}</span>
      <small class="muted" style="margin:0">Fournisseur actif : <b>${esc(s.provider)}</b>${s.remote ? ' · le texte quitte votre machine' : ' · traitement local'}</small>
    </div>
    <div class="field" style="padding-top:4px"><label>Fournisseur</label></div>
    <div class="ai-modes">${modes.map(([m, l]) => `<button class="ai-mode ${s.mode === m ? 'on' : ''}" data-mode="${m}">${l}</button>`).join('')}</div>
    ${s.mode === 'ollama' ? renderOllamaPick(s) : ''}
    ${s.mode === 'byok' ? `<div class="ai-sub"><span class="muted">${s.byok.configured ? 'IA connectée : <b>' + esc(s.byok.provider || '') + '</b> · ' + esc(s.byok.model || '') : 'Aucune IA personnelle connectée.'}</span>
       <button id="ai-byok-cfg" class="btn-full">${s.byok.configured ? 'Modifier ma connexion IA' : 'Connecter mon IA (clé API)'}</button></div>` : ''}
    ${s.provider === 'lite-missing' ? `<div class="notice">Le modèle KDL IA Lite n'est pas installé. Installation volontaire depuis les paramètres (téléchargement gratuit, aucune carte graphique requise).</div>` : ''}

    <div class="field" style="padding-top:6px"><label>Outils locaux (sans modèle)</label></div>
    <div class="ai-actions">
      <button class="ai-chip" data-local="resume">Résumé</button>
      <button class="ai-chip" data-local="points">Points clés</button>
      <button class="ai-chip" data-local="mots">Mots-clés</button>
    </div>
    <div class="field" style="padding-top:6px"><label>Assistant IA${s.remote ? ' (distant)' : ''}</label></div>
    <div class="ai-actions">
      ${['summarize:Résumer', 'explain:Expliquer', 'simplify:Simplifier', 'translate:Traduire', 'fiche:Fiche'].map((x) => {
        const [k, l] = x.split(':'); return `<button class="ai-chip gen" data-gen="${k}">${l}</button>`;
      }).join('')}
    </div>
    <div class="field"><label for="ai-len">Longueur des réponses</label>
      <input id="ai-len" type="range" min="96" max="512" step="32" value="${s.maxTokens}"></div>
    <div id="ai-out" class="ai-out hidden"></div>
    <small class="muted">KDL IA Lite est un petit modèle local — utile pour résumer, expliquer, traduire de courts extraits ; ce n'est pas une grande IA cloud. L'IA n'analyse la page qu'à votre demande et n'accède jamais aux mots de passe, cookies ou autres onglets.</small>
  `);
  panelBody.querySelectorAll('.ai-mode').forEach((b) => b.onclick = () => { window.KDLAI.setMode(b.dataset.mode); openAIPanel(); });
  panelBody.querySelectorAll('[data-local]').forEach((b) => b.onclick = () => runLocalAI(b.dataset.local));
  panelBody.querySelectorAll('[data-gen]').forEach((b) => b.onclick = () => runGenAI(b.dataset.gen, false));
  const len = document.getElementById('ai-len'); if (len) len.onchange = () => window.KDLAI.setMaxTokens(+len.value);
  const cfg = document.getElementById('ai-byok-cfg'); if (cfg) cfg.onclick = () => openAIPanel('byok');
  const osel = document.getElementById('ai-ollama-model'); if (osel) osel.onchange = () => window.KDLAI.setOllamaModel(osel.value);
}

function renderOllamaPick(s) {
  if (!s.ollama.available) return `<div class="notice">Ollama n'est pas détecté sur 127.0.0.1:11434. Facultatif — installez-le vous-même si vous le souhaitez.</div>`;
  if (!s.ollama.models.length) return `<div class="notice">Ollama détecté, mais aucun modèle installé. Installez un modèle avec Ollama (aucun téléchargement automatique ici).</div>`;
  return `<div class="ai-sub"><label class="muted">Modèle Ollama</label>
    <select id="ai-ollama-model" class="input">${s.ollama.models.map((m) => `<option ${m === s.ollamaModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>`;
}

function renderByok(s) {
  const provs = (s.byok.providers || []);
  const sel = s.byok.provider || (provs[0] && provs[0].id) || 'anthropic';
  showPanel('Connecter mon IA (API)', `
    <div class="notice">Vous connectez <b>votre propre</b> IA avec <b>votre</b> clé API. Fournisseur <b>distant</b> : le texte soumis quitte votre machine vers le service choisi. Aucune clé n'est fournie par KDL ; elle est stockée localement et n'est jamais partagée.</div>
    <div class="field"><label>Fournisseur</label></div>
    <select id="by-prov" class="input">${provs.map((p) => `<option value="${esc(p.id)}" data-def="${esc(p.defaultModel)}" ${p.id === sel ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
    <div id="by-baseurl-wrap" class="hidden"><div class="field"><label>URL de base (compatible OpenAI)</label></div>
      <input id="by-baseurl" class="input" type="text" placeholder="https://mon-endpoint/v1" value="${esc(s.byok.baseUrl || '')}"></div>
    <div class="field"><label>Modèle</label></div>
    <input id="by-model" class="input" type="text" placeholder="modèle" value="${esc(s.byok.model || '')}">
    <div class="field"><label>Clé API</label></div>
    <input id="by-key" class="input" type="password" placeholder="${s.byok.hasKey ? '•••••• (clé déjà enregistrée)' : 'votre clé API'}" autocomplete="off">
    <button id="by-save" class="btn-full btn-accent">Enregistrer</button>
    ${s.byok.configured ? '<button id="by-clear" class="btn-full">Déconnecter / effacer la clé</button>' : ''}
    <button id="by-back" class="btn-full">Retour</button>
    <small class="muted">La clé est stockée dans un fichier local protégé, jamais affichée ni envoyée ailleurs qu'au service que vous choisissez.</small>
  `);
  const prov = document.getElementById('by-prov');
  const model = document.getElementById('by-model');
  const baseWrap = document.getElementById('by-baseurl-wrap');
  const syncProv = () => {
    const opt = prov.options[prov.selectedIndex];
    if (!model.value) model.placeholder = opt.dataset.def || 'modèle';
    baseWrap.classList.toggle('hidden', prov.value !== 'custom');
  };
  prov.onchange = syncProv; syncProv();
  document.getElementById('by-back').onclick = () => openAIPanel();
  document.getElementById('by-save').onclick = async () => {
    const cfg = { provider: prov.value, model: model.value.trim() || (prov.options[prov.selectedIndex].dataset.def || ''), key: document.getElementById('by-key').value, baseUrl: (document.getElementById('by-baseurl') || {}).value || '' };
    const res = await window.kdl.byokSet(cfg);
    if (!res.ok) return toast('Échec : ' + (res.error || 'clé requise'));
    await window.KDLAI.refreshByok(); window.KDLAI.setMode('byok'); toast('IA personnelle connectée.'); openAIPanel();
  };
  const clr = document.getElementById('by-clear');
  if (clr) clr.onclick = async () => { await window.kdl.byokClear(); await window.KDLAI.refreshByok(); toast('Clé effacée.'); openAIPanel('byok'); };
}

async function runLocalAI(kind) {
  const page = await getPageForAI();
  const text = (page.selection && page.selection.trim().length > 20) ? page.selection : page.text;
  if (!text) return aiShowOut('<p class="muted">Aucun texte exploitable sur cette page.</p>');
  const r = window.KDLAI.runLocal(kind, text);
  if (kind === 'resume') aiShowOut('<div class="ai-out-h">Résumé <span class="tag ok">local</span></div><p>' + esc(r.text) + '</p>');
  else if (kind === 'points') aiShowOut('<div class="ai-out-h">Points clés <span class="tag ok">local</span></div><ul>' + r.points.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>');
  else if (kind === 'mots') aiShowOut('<div class="ai-out-h">Mots-clés <span class="tag ok">local</span></div><div class="kw">' + r.mots.map((k) => '<span class="kw-item">' + esc(k.term) + '</span>').join('') + '</div>');
}

async function runGenAI(kind, confirmed) {
  const page = await getPageForAI();
  if (!page.text && !page.selection) return aiShowOut('<p class="muted">Aucun texte à analyser.</p>');
  aiShowOut('<p class="muted">Génération en cours…</p>');
  const res = await window.KDLAI.run(kind, page, { confirmedSensitive: confirmed });
  if (res.needConfirm) {
    aiShowOut(`<div class="notice">${res.remote ? 'Fournisseur <b>distant</b> : ce texte va quitter votre machine.' : 'Page potentiellement <b>sensible</b>.'} Aperçu de ce qui sera envoyé :</div>
      <p class="ai-preview">${esc(res.preview)}…</p>
      <button id="ai-confirm" class="btn-full btn-accent">Confirmer l'envoi</button>`);
    const c = document.getElementById('ai-confirm'); if (c) c.onclick = () => runGenAI(kind, true);
    return;
  }
  if (res.ok) return aiShowOut('<div class="ai-out-h">Assistant IA <span class="tag ok">' + esc(res.via || 'IA') + '</span></div><p>' + esc(res.text) + '</p>');
  if (res.fallback) {
    aiShowOut(`<div class="notice">${esc(res.reason)}. Vous pouvez utiliser un outil local :</div>
      <button class="ai-chip" data-fb="resume">Résumé local</button> <button class="ai-chip" data-fb="points">Points clés</button>`);
    panelBody.querySelectorAll('[data-fb]').forEach((b) => b.onclick = () => runLocalAI(b.dataset.fb));
    return;
  }
  aiShowOut('<p class="muted">' + esc(res.error || 'IA indisponible.') + '</p>');
}

document.getElementById('btn-ai').onclick = () => openAIPanel();

// Hook IA du mode lecture : réutilise le service (avec confirmation intégrée).
window.KDLReader.setAIHook(async (kind, text) => {
  await ensureAI();
  const res = await window.KDLAI.run(kind, { url: cur() ? cur().getURL() : '', text, selection: '', hasPassword: false }, { confirmedSensitive: true });
  return res.ok ? { ok: true, text: res.text } : { ok: false, error: res.reason || res.error || 'IA indisponible' };
});

// --- Démarrage : un onglet d'accueil ---
createTab(HOME);
urlbar.focus();
