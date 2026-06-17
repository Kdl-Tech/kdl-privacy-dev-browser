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

const activeTab = () => tabs.find((t) => t.id === activeId);
const cur = () => activeTab() && activeTab().wv;
const isActive = (tab) => tab.id === activeId;

function createTab(url) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:kdl');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('webpreferences', 'contextIsolation=yes,nodeIntegration=no,sandbox=yes');
  wv.classList.add('hidden');
  wv.src = url || HOME;
  viewport.appendChild(wv);
  const tab = { id: ++seq, wv, title: 'Nouvel onglet', url: url || '' };
  tabs.push(tab);
  wireTab(tab);
  activate(tab.id);
  return tab;
}

function wireTab(tab) {
  const wv = tab.wv;
  wv.addEventListener('did-start-loading', () => { if (isActive(tab)) { lock.textContent = '…'; lock.className = 'lock'; } });
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
  // Recherche centrale de la page d'accueil : schéma sentinelle -> routage sécurisé du parent.
  wv.addEventListener('will-navigate', (e) => {
    const m = e.url && e.url.match(/^kdlgo:\/\/q\/(.*)$/i);
    if (m) { try { wv.stop(); } catch { /* */ } navigate(decodeURIComponent(m[1])); }
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
  t.wv.remove();
  if (tabs.length === 0) { createTab(HOME); return; }   // garder un onglet minimum
  if (activeId === id) activate(tabs[Math.max(0, i - 1)].id);
  else renderTabs();
}

function renderTabs() {
  tabsEl.innerHTML = '';
  tabs.forEach((t) => {
    const el = document.createElement('div');
    el.className = 'tab' + (t.id === activeId ? ' active' : '');
    el.title = t.title;
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = (t.title && t.title !== 'Nouvel onglet') ? t.title : (isHome(t.url) ? 'Accueil' : 'Onglet');
    const x = document.createElement('button');
    x.className = 'tab-close'; x.textContent = '✕'; x.title = 'Fermer (Ctrl+W)';
    el.appendChild(label); el.appendChild(x);
    el.onclick = (e) => { if (e.target !== x) activate(t.id); };
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

document.getElementById('urlform').addEventListener('submit', (e) => { e.preventDefault(); navigate(urlbar.value); });

// --- Boutons navigation ---
document.getElementById('back').onclick = () => cur() && cur().canGoBack() && cur().goBack();
document.getElementById('forward').onclick = () => cur() && cur().canGoForward() && cur().goForward();
document.getElementById('reload').onclick = () => cur() && cur().reload();
document.getElementById('home').onclick = () => cur() && cur().loadURL(homeURL()).catch(() => { cur().src = HOME; });

function updateBar(url) {
  if (isHome(url)) { urlbar.value = ''; lock.textContent = '·'; lock.className = 'lock'; updateStar(url); return; }
  urlbar.value = url;
  if (url.startsWith('https://')) { lock.textContent = '🔒'; lock.className = 'lock secure'; }
  else if (url.startsWith('http://')) { lock.textContent = '⚠'; lock.className = 'lock insecure'; }
  else { lock.textContent = '·'; lock.className = 'lock'; }
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
  btnFav.textContent = fav ? '★' : '☆';
  btnFav.classList.toggle('btn-accent', fav);
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

// --- Nettoyer le site courant (session persist:kdl) ---
document.getElementById('btn-clean').onclick = async () => {
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
  document.getElementById('s-clearnow').onclick = async () => { await window.kdl.clearAll(); toast('Données de navigation effacées (favoris conservés).'); };
};

// --- À propos / version ---
document.getElementById('btn-about').onclick = async () => {
  let info = { name: 'KDL Privacy Dev Browser', version: '1.1.0' };
  try { info = await window.kdl.about(); } catch { /* */ }
  showPanel('À propos', `
    <div class="row"><span class="k">Nom</span><span class="v">${esc(info.name)}</span></div>
    <div class="row"><span class="k">Version</span><span class="v">${esc(info.version)}</span></div>
    <div class="row"><span class="k">Licence</span><span class="v">MIT</span></div>
    <button id="about-gh" class="btn-full btn-accent">Voir sur GitHub</button>
    <small class="muted">Logiciel libre et gratuit. Non affilié à DuckDuckGo, au Tor Project ni à Ahmia.</small>
    <small class="muted">VPN et assistant IA sont prévus pour la V2 — non inclus dans cette version.</small>
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

// --- Raccourcis clavier ---
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (e.ctrlKey && k === 'l') { e.preventDefault(); urlbar.focus(); urlbar.select(); }
  else if (e.ctrlKey && k === 'r') { e.preventDefault(); cur() && cur().reload(); }
  else if (e.ctrlKey && k === 't') { e.preventDefault(); createTab(HOME); }
  else if (e.ctrlKey && k === 'w') { e.preventDefault(); if (activeId != null) closeTab(activeId); }
  else if (e.ctrlKey && k === 'd') { e.preventDefault(); toggleFav(); }
  else if (e.ctrlKey && e.shiftKey && k === 'i') { e.preventDefault(); cur() && cur().openDevTools(); }
  else if (e.key === 'F12') { e.preventDefault(); cur() && cur().openDevTools(); }
  else if (e.ctrlKey && e.shiftKey && k === 'm') { e.preventDefault(); respBar.classList.toggle('hidden'); viewport.classList.toggle('with-bar'); }
});

// --- Démarrage : un onglet d'accueil ---
createTab(HOME);
urlbar.focus();
