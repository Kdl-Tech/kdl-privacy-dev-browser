'use strict';
// Logique pure de confidentialité (testable sans Electron).

// Domaine "enregistrable" approximatif (eTLD+1).
// ponytail: pas de Public Suffix List ; couvre les suffixes à 2 niveaux courants (co.uk, com.au…).
function siteOf(host) {
  host = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host.includes(':') || /^\d+(\.\d+){3}$/.test(host)) return host;
  const p = host.split('.');
  if (p.length <= 2) return host;
  const n = (p[p.length - 1].length === 2 && /^(co|com|org|net|gov|edu|ac)$/.test(p[p.length - 2])) ? 3 : 2;
  return p.slice(-n).join('.');
}

// Vrai si la requête vise un autre site que la page affichée (http/https uniquement).
function isThirdParty(reqUrl, topUrl) {
  try {
    const r = new URL(reqUrl), t = new URL(topUrl);
    if (!/^https?:$/.test(r.protocol) || !/^https?:$/.test(t.protocol)) return false;
    return siteOf(r.hostname) !== siteOf(t.hostname);
  } catch { return false; }
}

// Vrai si l'hôte (ou un de ses domaines parents) figure dans la liste.
function hostListed(host, set) {
  host = String(host || '').toLowerCase().replace(/\.$/, '');
  while (host) {
    if (set.has(host)) return true;
    const i = host.indexOf('.');
    if (i < 0) return false;
    host = host.slice(i + 1);
  }
  return false;
}

// Bloquer cette requête ? Jamais la page elle-même (navigation voulue par l'utilisateur),
// jamais une requête du même site que la page : seulement un tiers listé.
function shouldBlock(reqUrl, topUrl, resourceType, set) {
  if (resourceType === 'mainFrame') return false;
  if (!isThirdParty(reqUrl, topUrl)) return false;
  try { return hostListed(new URL(reqUrl).hostname, set); } catch { return false; }
}

module.exports = { siteOf, isThirdParty, hostListed, shouldBlock };
