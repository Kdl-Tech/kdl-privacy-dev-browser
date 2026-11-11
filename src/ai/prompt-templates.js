'use strict';
/**
 * KDL IA — modèles de prompt (consignes en FR). Adaptés à un PETIT modèle instruct local :
 * consignes courtes, sortie brève. Utilisés par IA Lite et Ollama.
 * La réponse est demandée dans la langue de l'interface (I18N.lang : fr, en ou es).
 * Global : window.KDLPrompts
 */
(function (root) {
  const LANGUE = { fr: 'français', en: 'anglais', es: 'espagnol' };
  const T = {
    summarize: (t, L) => `Résume ce texte en ${L}, en 3 à 5 phrases claires. Ne donne que le résumé.\n\nTEXTE:\n${t}\n\nRÉSUMÉ:`,
    explain: (t, L) => `Explique simplement, en ${L}, ce passage. Sois bref.\n\nPASSAGE:\n${t}\n\nEXPLICATION:`,
    simplify: (t, L) => `Réécris ce texte en ${L} avec des mots simples, sans changer le sens. Réponse courte.\n\nTEXTE:\n${t}\n\nVERSION SIMPLIFIÉE:`,
    reformulate: (t, L) => `Reformule ce texte en ${L}, autrement, sans changer le sens. Réponse courte.\n\nTEXTE:\n${t}\n\nREFORMULATION:`,
    correct: (t, L) => `Corrige l'orthographe et la grammaire de ce texte, dans sa langue d'origine. Renvoie uniquement le texte corrigé.\n\nTEXTE:\n${t}\n\nCORRIGÉ:`,
    translate: (t, L) => `Traduis ce texte en ${L}. Renvoie uniquement la traduction.\n\nTEXTE:\n${t}\n\nTRADUCTION:`,
    keypoints: (t, L) => `Donne les points importants de ce texte, en ${L}, sous forme de courte liste à puces.\n\nTEXTE:\n${t}\n\nPOINTS:`,
    fiche: (t, L) => `Fais une fiche synthétique en ${L} : un titre, 3 à 5 points clés à puces. Bref.\n\nTEXTE:\n${t}\n\nFICHE:`,
    title: (t, L) => `Propose un titre court en ${L} pour ce texte. Renvoie seulement le titre.\n\nTEXTE:\n${t}\n\nTITRE:`,
    http: (t, L) => `Explique en ${L}, en une ou deux phrases, ce que signifie ce code ou en-tête HTTP.\n\n${t}\n\nEXPLICATION:`,
    error: (t, L) => `Explique en ${L}, brièvement, la cause probable de ce message d'erreur et une piste de correction.\n\nERREUR:\n${t}\n\nEXPLICATION:`,
    code: (t, L) => `Explique en ${L}, brièvement, ce que fait cet extrait de code.\n\nCODE:\n${t}\n\nEXPLICATION:`,
  };
  // Langue de réponse : celle de l'interface (secours : français).
  function build(kind, text, lang) {
    const l = lang || (root && root.I18N ? root.I18N.lang : 'fr');
    return (T[kind] || T.summarize)(text, LANGUE[l] || LANGUE.fr);
  }
  const api = { build, kinds: Object.keys(T) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KDLPrompts = api;
})(typeof window !== 'undefined' ? window : null);
