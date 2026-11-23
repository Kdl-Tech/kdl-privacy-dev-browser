'use strict';
// Garde IPC (revue sécurité 22/11/2026) : seuls les messages venant de la frame PRINCIPALE d'une fenêtre
// du navigateur, chargée depuis src/index.html (file://), sont acceptés. Une page web (webview, iframe,
// fenêtre détournée vers une autre URL) ne peut donc jamais appeler les fonctions du processus principal.
const path = require('path');
const { fileURLToPath } = require('url');

function memeChemin(a, b, plateforme = process.platform) {
  return plateforme === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function expediteurSur(e, { page, estFenetre, plateforme = process.platform }) {
  try {
    const f = e && e.senderFrame;
    const wc = e && e.sender;
    if (!f || !wc || f.parent) return false;
    if (typeof wc.getType === 'function' && wc.getType() !== 'window') return false;
    const m = wc.mainFrame;
    if (!m || m.processId !== f.processId || m.routingId !== f.routingId) return false;
    if (!estFenetre(wc)) return false;
    const u = new URL(String(f.url || ''));
    if (u.protocol !== 'file:' || u.host) return false;
    return memeChemin(path.resolve(fileURLToPath(u)), path.resolve(page), plateforme);
  } catch { return false; }
}

// Enregistre les gestionnaires IPC derrière la garde. handle : refus = exception côté appelant ; on : ignoré.
function creerIpcSur(ipcMain, options) {
  const ok = (e) => expediteurSur(e, options);
  return {
    handle(canal, fn) { ipcMain.handle(canal, (e, ...a) => { if (!ok(e)) throw new Error('kdl: expéditeur refusé'); return fn(e, ...a); }); },
    on(canal, fn) { ipcMain.on(canal, (e, ...a) => { if (ok(e)) return fn(e, ...a); }); },
  };
}

module.exports = { expediteurSur, creerIpcSur };
