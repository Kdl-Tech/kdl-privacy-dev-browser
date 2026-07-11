'use strict';
/**
 * KDL IA — modèles de prompt (FR). Adaptés à un PETIT modèle instruct local :
 * consignes courtes, sortie brève. Utilisés par IA Lite et Ollama.
 * Global : window.KDLPrompts
 */
(function (root) {
  const T = {
    summarize: (t) => `Résume ce texte en français, en 3 à 5 phrases claires. Ne donne que le résumé.\n\nTEXTE:\n${t}\n\nRÉSUMÉ:`,
    explain: (t) => `Explique simplement, en français, ce passage. Sois bref.\n\nPASSAGE:\n${t}\n\nEXPLICATION:`,
    simplify: (t) => `Réécris ce texte en français avec des mots simples, sans changer le sens. Réponse courte.\n\nTEXTE:\n${t}\n\nVERSION SIMPLIFIÉE:`,
    reformulate: (t) => `Reformule ce texte en français, autrement, sans changer le sens. Réponse courte.\n\nTEXTE:\n${t}\n\nREFORMULATION:`,
    correct: (t) => `Corrige l'orthographe et la grammaire de ce texte en français. Renvoie uniquement le texte corrigé.\n\nTEXTE:\n${t}\n\nCORRIGÉ:`,
    translate: (t) => `Traduis ce texte en français. Renvoie uniquement la traduction.\n\nTEXTE:\n${t}\n\nTRADUCTION:`,
    keypoints: (t) => `Donne les points importants de ce texte, en français, sous forme de courte liste à puces.\n\nTEXTE:\n${t}\n\nPOINTS:`,
    fiche: (t) => `Fais une fiche synthétique en français : un titre, 3 à 5 points clés à puces. Bref.\n\nTEXTE:\n${t}\n\nFICHE:`,
    title: (t) => `Propose un titre court en français pour ce texte. Renvoie seulement le titre.\n\nTEXTE:\n${t}\n\nTITRE:`,
    http: (t) => `Explique en français, en une ou deux phrases, ce que signifie ce code ou en-tête HTTP.\n\n${t}\n\nEXPLICATION:`,
    error: (t) => `Explique en français, brièvement, la cause probable de ce message d'erreur et une piste de correction.\n\nERREUR:\n${t}\n\nEXPLICATION:`,
    code: (t) => `Explique en français, brièvement, ce que fait cet extrait de code.\n\nCODE:\n${t}\n\nEXPLICATION:`,
  };
  function build(kind, text) { return (T[kind] || T.summarize)(text); }
  const api = { build, kinds: Object.keys(T) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KDLPrompts = api;
})(typeof window !== 'undefined' ? window : null);
