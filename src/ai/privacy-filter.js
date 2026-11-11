'use strict';
/**
 * KDL IA — filtre de confidentialité.
 * Décide ce qui peut être transmis au moteur et détecte les pages sensibles.
 * L'IA ne reçoit JAMAIS : mots de passe, cookies, tokens, storage, champs de
 * formulaire, en-têtes d'autorisation, contenu d'un autre onglet.
 * Elle ne reçoit que du texte visible explicitement soumis, tronqué.
 *
 * Global : window.KDLPrivacyFilter
 */
(function (root) {
  const SENSITIVE_HOST = /(^|\.)(bank|banque|paypal|stripe|caisse|impots|ameli|assurance|credit|boursorama|fortuneo|revolut|n26)\b/i;
  const SENSITIVE_PATH = /(login|signin|sign-in|connexion|auth|oauth|account|compte|payment|paiement|checkout|billing|admin|webmail|mail|password|motdepasse)/i;
  const LOCAL_HOST = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i;
  const MAX = 6000;

  function isSensitive(url, hasPasswordField) {
    if (hasPasswordField) return true;
    try {
      const u = new URL(url);
      if (u.protocol === 'file:') return true;
      if (LOCAL_HOST.test(u.hostname)) return true;
      if (SENSITIVE_HOST.test(u.hostname)) return true;
      if (SENSITIVE_PATH.test(u.pathname + u.search)) return true;
    } catch { /* */ }
    return false;
  }

  /** Construit le texte minimal à soumettre (sélection prioritaire), tronqué. */
  function buildPayload({ selection, text }) {
    let payload = (selection && selection.trim()) ? selection : (text || '');
    payload = String(payload).replace(/\s+/g, ' ').trim();
    if (payload.length > MAX) payload = payload.slice(0, MAX) + ' […]';
    return payload;
  }

  const api = { isSensitive, buildPayload, MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KDLPrivacyFilter = api;
})(typeof window !== 'undefined' ? window : null);
