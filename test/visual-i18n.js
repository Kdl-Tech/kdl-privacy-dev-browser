'use strict';
// Vérification visuelle des trois langues sur l'application RÉELLE (electron .), profil jetable.
// Pilotage par le protocole DevTools (aucune dépendance), capture de l'écran X (ImageMagick `import`).
//   xvfb-run -a -s "-screen 0 1280x820x24" node test/visual-i18n.js <dossier-de-sortie>
// Scénarios : fr et en = langue du système (--lang) ; es = système anglais puis réglage
// « Langue / Language / Idioma » changé dans le panneau Confidentialité (rechargement).
// Échoue si un mot français courant reste visible en anglais ou en espagnol.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = process.argv[2] || path.join(os.tmpdir(), 'kdl-i18n-shots');
const ROOT = path.join(__dirname, '..');
const ELECTRON = path.join(ROOT, 'node_modules', '.bin', 'electron');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Mots français qui ne doivent plus apparaître dans l'interface anglaise ou espagnole.
const FR_WORDS = ['Rechercher', 'Effacer', 'Favoris', 'Téléchargement', 'Confidentialité', 'Accueil', 'Onglet', 'onglet',
  'Précédent', 'Suivant', 'Recharger', 'Capture d', 'Thème', 'Mode lecture', 'Infos page', 'Audit léger', 'Espaces de travail',
  'Outils', 'À propos', 'Affichage', 'Tablette', 'aucun', 'aucune', 'Désactiver', 'Bloquer les', 'données', 'navigation privée',
  'Session privée', 'Logiciel libre', 'Raccourcis', 'Fermer', 'Panneau', 'pisteurs', 'à la fermeture', 'Ouvrir', 'Langue du système'];

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const ready = new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  return { ready, send, evaluate, close: () => ws.close() };
}

async function targets(port) {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const j = await r.json(); if (j.some((t) => /index\.html/.test(t.url))) return j; } catch { /* pas prêt */ }
    await wait(500);
  }
  throw new Error('application injoignable sur le port ' + port);
}

// Texte visible + attributs (title, placeholder, aria-label) d'un document.
const COLLECT = `(() => {
  const parts = [document.body.innerText];
  document.querySelectorAll('[title],[placeholder],[aria-label]').forEach((e) => {
    if (e.closest('.hidden')) return;
    ['title', 'placeholder', 'aria-label'].forEach((a) => { const v = e.getAttribute(a); if (v) parts.push(v); });
  });
  return parts.join('\\n');
})()`;

async function run(lang, sysLang, viaSettings, port) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kdl-i18n-profile-'));
  const env = { ...process.env, XDG_CONFIG_HOME: profile };
  const child = spawn(ELECTRON, ['.', '--no-sandbox', '--lang=' + sysLang, '--remote-debugging-port=' + port], { cwd: ROOT, env, stdio: 'ignore' });
  try {
    let list = await targets(port);
    let main = cdp(list.find((t) => /index\.html/.test(t.url)).webSocketDebuggerUrl); await main.ready;
    await wait(2500);
    if (viaSettings) {
      // Changer la langue depuis le panneau Confidentialité, comme un utilisateur.
      await main.evaluate(`document.getElementById('btn-settings').click(); const s = document.getElementById('s-lang'); s.value = ${JSON.stringify(lang)}; s.dispatchEvent(new Event('change')); true`);
      main.close(); await wait(3500);
      list = await targets(port);
      main = cdp(list.find((t) => /index\.html/.test(t.url)).webSocketDebuggerUrl); await main.ready;
      await wait(2000);
    }
    const got = await main.evaluate('window.I18N.lang + "|" + document.documentElement.lang');
    // Panneau Confidentialité ouvert + menu déroulant ouvert, pour montrer un maximum de texte.
    await main.evaluate(`document.getElementById('btn-settings').click(); document.getElementById('btn-menu').click(); true`);
    await wait(1200);
    let text = await main.evaluate(COLLECT);
    list = await targets(port);
    const home = list.find((t) => /home\.html/.test(t.url));
    if (home) { const h = cdp(home.webSocketDebuggerUrl); await h.ready; text += '\n' + await h.evaluate(COLLECT); h.close(); }
    main.close();
    const png = path.join(OUT, `privacy-browser-${lang}.png`);
    execFileSync('import', ['-window', 'root', png]);
    return { lang, got, png, text, homeUrl: home ? home.url : '' };
  } finally {
    child.kill('SIGTERM'); await wait(800);
    try { process.kill(child.pid, 'SIGKILL'); } catch { /* déjà terminé */ }
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const scenarios = [['fr', 'fr', false], ['en', 'en-US', false], ['es', 'en-US', true]];
  let fail = 0, port = 9330 + Math.floor(Math.random() * 500);
  for (const [lang, sys, via] of scenarios) {
    const r = await run(lang, sys, via, port++);
    const leaks = lang === 'fr' ? [] : FR_WORDS.filter((w) => r.text.includes(w));
    const okLang = r.got === `${lang}|${lang}` && r.homeUrl.includes('lang=' + lang);
    console.log(`[${lang}] I18N=${r.got} home=${r.homeUrl.replace(/^.*home\.html/, 'home.html')} capture=${r.png}`);
    if (!okLang) { console.log(`[${lang}] ÉCHEC : langue active inattendue`); fail++; }
    if (leaks.length) { console.log(`[${lang}] ÉCHEC : texte français restant : ${leaks.join(', ')}`); fail++; }
    fs.writeFileSync(path.join(OUT, `texte-${lang}.txt`), r.text);
  }
  console.log(fail ? `visual-i18n : ${fail} échec(s)` : 'visual-i18n OK');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
