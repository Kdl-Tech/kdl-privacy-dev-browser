'use strict';

const DDG = 'https://duckduckgo.com/?q=';
const AHMIA = 'https://ahmia.fi/search/?q=';
const HOME = 'home.html';

const view = document.getElementById('view');
const urlbar = document.getElementById('urlbar');
const lock = document.getElementById('lock');
const toastEl = document.getElementById('toast');
const panel = document.getElementById('panel');
const panelTitle = document.getElementById('panel-title');
const panelBody = document.getElementById('panel-body');
const respBar = document.getElementById('responsive-bar');
const viewport = document.getElementById('viewport');

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

// --- Résolution requête : URL directe ou recherche DuckDuckGo ---
function resolveQuery(raw) {
  const q = raw.trim();
  if (!q) return null;
  if (/\.onion(\/|$|\?)/i.test(q) || /^https?:\/\/[^/]+\.onion/i.test(q)) {
    return { onion: true, value: q };
  }
  if (/^https?:\/\//i.test(q)) return { value: q };
  if (/^[a-z]+:\/\//i.test(q)) return { value: q };
  // ressemble à un domaine (a.b sans espace)
  if (/^[^\s]+\.[^\s]{2,}($|\/|:)/.test(q) && !q.includes(' ')) {
    return { value: 'https://' + q };
  }
  return { value: DDG + encodeURIComponent(q) };
}

function navigate(raw) {
  const r = resolveQuery(raw);
  if (!r) return;
  if (r.onion) return onionWarning(r.value);
  view.loadURL(r.value).catch(() => view.src = r.value);
}

document.getElementById('urlform').addEventListener('submit', (e) => {
  e.preventDefault();
  navigate(urlbar.value);
});

// --- Boutons navigation ---
document.getElementById('back').onclick = () => view.canGoBack() && view.goBack();
document.getElementById('forward').onclick = () => view.canGoForward() && view.goForward();
document.getElementById('reload').onclick = () => view.reload();
document.getElementById('home').onclick = () => view.loadURL(`file://${location.pathname.replace('index.html', HOME)}`).catch(() => view.src = HOME);

// --- Suivi état webview ---
view.addEventListener('did-start-loading', () => { lock.textContent = '…'; lock.className = 'lock'; });
view.addEventListener('did-navigate', (e) => updateBar(e.url));
view.addEventListener('did-navigate-in-page', (e) => updateBar(e.url));
view.addEventListener('page-title-updated', (e) => { document.title = 'KDL · ' + e.title; });
view.addEventListener('new-window', (e) => { if (/^https?:/i.test(e.url)) navigate(e.url); });

function updateBar(url) {
  if (!url || url.includes(HOME)) { urlbar.value = ''; lock.textContent = '·'; lock.className = 'lock'; return; }
  urlbar.value = url;
  if (url.startsWith('https://')) { lock.textContent = '🔒'; lock.className = 'lock secure'; }
  else if (url.startsWith('http://')) { lock.textContent = '⚠'; lock.className = 'lock insecure'; }
  else { lock.textContent = '·'; lock.className = 'lock'; }
  updateStar(url);
}

// --- Favoris (stockage local, aucun cloud/secret) ---
const btnFav = document.getElementById('btn-fav');
function getFavs() { return JSON.parse(localStorage.getItem('kdl-favorites') || '[]'); }
function saveFavs(f) { localStorage.setItem('kdl-favorites', JSON.stringify(f)); }
function isHome(url) { return !url || url.includes(HOME); }
function updateStar(url) {
  const fav = !isHome(url) && getFavs().some((f) => f.url === url);
  btnFav.textContent = fav ? '★' : '☆';
  btnFav.classList.toggle('btn-accent', fav);
}
btnFav.onclick = () => {
  const url = view.getURL();
  if (isHome(url)) return toast('Rien à mettre en favori (page d’accueil).');
  let favs = getFavs();
  const idx = favs.findIndex((f) => f.url === url);
  if (idx >= 0) { favs.splice(idx, 1); saveFavs(favs); updateStar(url); return toast('Retiré des favoris.'); }
  let domain = ''; try { domain = new URL(url).hostname; } catch { /* */ }
  favs.unshift({ title: document.title.replace(/^KDL · /, '') || url, url, domain, added: Date.now() });
  saveFavs(favs); updateStar(url); toast('Ajouté aux favoris.');
};

document.getElementById('btn-favs').onclick = () => renderFavsPanel();
function renderFavsPanel() {
  const favs = getFavs();
  const list = favs.length
    ? favs.map((f, i) => `<div class="row">
        <span class="v" style="text-align:left;flex:1;cursor:pointer" data-open="${i}">
          ${esc(f.title)}<small class="muted">${esc(f.domain || f.url)}</small></span>
        <button data-del="${i}" title="Supprimer">🗑</button></div>`).join('')
    : '<small class="muted">Aucun favori.</small>';
  showPanel('Favoris', list + '<small class="muted">Stockage local uniquement — aucun cloud.</small>');
  panelBody.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = () => { const f = getFavs()[+el.dataset.open]; if (f) { panel.classList.add('hidden'); navigate(f.url); } };
  });
  panelBody.querySelectorAll('[data-del]').forEach((el) => {
    el.onclick = () => { const a = getFavs(); a.splice(+el.dataset.del, 1); saveFavs(a); renderFavsPanel(); updateStar(view.getURL()); };
  });
}

// --- DevTools ---
document.getElementById('btn-devtools').onclick = () => {
  view.isDevToolsOpened() ? view.closeDevTools() : view.openDevTools();
};

// --- Capture écran ---
document.getElementById('btn-shot').onclick = async () => {
  try {
    const id = view.getWebContentsId();
    const res = await window.kdl.screenshot(id);
    toast(res.ok ? 'Capture : ' + res.file : 'Échec capture : ' + res.error);
  } catch (err) { toast('Capture impossible : ' + err); }
};

// --- Nettoyer le site courant ---
document.getElementById('btn-clean').onclick = async () => {
  let origin = '';
  try { origin = new URL(view.getURL()).origin; } catch { /* page locale */ }
  // storage côté page (best effort)
  try {
    await view.executeJavaScript(
      'try{localStorage.clear();sessionStorage.clear();}catch(e){};true;', true
    );
  } catch { /* ignore */ }
  const res = await window.kdl.clearSiteData(origin || undefined);
  toast(res.ok ? 'Données nettoyées : ' + (res.origin || 'site') : 'Échec nettoyage');
};

// --- Panneau infos page ---
document.getElementById('btn-info').onclick = async () => {
  let url = view.getURL();
  let data = {};
  try {
    data = await view.executeJavaScript(`(function(){
      return { title: document.title, ua: navigator.userAgent,
        proto: location.protocol, host: location.host };
    })();`, true);
  } catch { /* ignore */ }
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
    audit = await view.executeJavaScript(`(function(){
      var imgs = document.querySelectorAll('img');
      var noAlt = 0; imgs.forEach(function(i){ if(!i.getAttribute('alt')) noAlt++; });
      var host = location.hostname;
      var ext = 0;
      document.querySelectorAll('a[href]').forEach(function(a){
        try { var h = new URL(a.href).hostname; if(h && h !== host) ext++; } catch(e){}
      });
      var md = document.querySelector('meta[name="description"]');
      return {
        title: document.title || '',
        desc: md ? (md.getAttribute('content')||'').trim() : '',
        h1: document.querySelectorAll('h1').length,
        https: location.protocol === 'https:',
        imgs: imgs.length, imgsNoAlt: noAlt, extLinks: ext
      };
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
  const status = failed === 0
    ? '<span class="tag ok">OK</span>'
    : `<span class="tag warn">À VÉRIFIER (${failed})</span>`;
  showPanel('Audit léger', `
    <div class="row"><span class="k">Statut global</span><span class="v">${status}</span></div>
    ${checks.map((c) => `<div class="row"><span class="k">${c[0]}</span>
      <span class="v">${esc(c[2])} ${c[1] ? '<span class="tag ok">✓</span>' : (c[0]==='Liens externes'?'':'<span class="tag warn">!</span>')}</span></div>`).join('')}
    <small class="muted">Audit maison V1 — pas un remplacement de Lighthouse.</small>
  `);
};

// --- Mode responsive ---
let respWidth = 0;
document.getElementById('btn-settings').addEventListener('dblclick', () => {});
function applyResp(w) {
  respWidth = w;
  if (w === 0) { view.style.maxWidth = ''; view.classList.remove('framed'); }
  else { view.style.maxWidth = w + 'px'; view.classList.add('framed'); }
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
  const torLine = tor.found
    ? '<span class="tag ok">Tor Browser détecté</span>'
    : '<span class="tag err">Tor Browser non détecté</span>';
  showPanel('Onion Search', `
    <div class="notice"><b>Usage légal uniquement.</b> Cet outil ne sert qu'à la recherche
      d'informations licites. Les .onion ne sont jamais ouverts dans ce navigateur.</div>
    <div class="row"><span class="k">État Tor</span><span class="v">${torLine}</span></div>
    <input id="onion-q" type="text" placeholder="Termes de recherche Ahmia"
      value="${esc(prefill)}" style="width:100%;height:32px;margin-top:10px;background:var(--bg3);
      border:1px solid var(--border);border-radius:6px;color:var(--fg);padding:0 8px;outline:none;" />
    <button id="onion-go" class="btn-full btn-accent">Rechercher (page publique Ahmia)</button>
    <button id="onion-tor" class="btn-full">${tor.found ? 'Ouvrir Ahmia dans Tor Browser' : 'Tor Browser introuvable'}</button>
    <small class="muted">Si vous tapez une adresse .onion dans la barre d'adresse, un avertissement
      s'affiche et l'ouverture est proposée via Tor Browser uniquement.</small>
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
      directement dans KDL Privacy Dev Browser (pas de Tor intégré en V1).</div>
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
    <button id="s-clearnow" class="btn-full">Effacer toutes les données maintenant</button>
    <small class="muted">DuckDuckGo par défaut · aucune télémétrie · aucun tracking KDL ·
      aucun compte requis.</small>
  `);
  document.getElementById('s-hist').onchange = (e) => { settings.noHistory = e.target.checked; saveSettings(); };
  document.getElementById('s-close').onchange = (e) => { settings.clearOnClose = e.target.checked; saveSettings(); };
  document.getElementById('s-3pc').onchange = async (e) => {
    settings.block3p = e.target.checked; saveSettings();
    await window.kdl.thirdPartyCookies(e.target.checked);
  };
  document.getElementById('s-clearnow').onclick = async () => {
    await window.kdl.clearAll(); toast('Toutes les données effacées.');
  };
};

// Effacer à la fermeture (best effort).
window.addEventListener('beforeunload', () => {
  if (settings.clearOnClose) window.kdl.clearAll();
});

// Historique local minimal (désactivable).
view.addEventListener('did-navigate', (e) => {
  if (settings.noHistory) return;
  if (!e.url || e.url.includes(HOME)) return;
  const h = JSON.parse(localStorage.getItem('kdl-history') || '[]');
  h.unshift({ url: e.url, t: Date.now() });
  localStorage.setItem('kdl-history', JSON.stringify(h.slice(0, 200)));
});

// --- Raccourcis clavier ---
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'l') { e.preventDefault(); urlbar.focus(); urlbar.select(); }
  if (e.ctrlKey && e.key === 'r') { e.preventDefault(); view.reload(); }
  if (e.key === 'F12') { e.preventDefault(); view.openDevTools(); }
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
    e.preventDefault(); respBar.classList.toggle('hidden'); viewport.classList.toggle('with-bar');
  }
});

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

urlbar.focus();
