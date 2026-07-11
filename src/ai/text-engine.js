'use strict';
/**
 * KDL — moteur texte NON génératif (mode de repli universel).
 * Fonctionne 100 % localement, sans modèle IA, sans réseau, sans dépendance.
 * Sert le mode lecture et le repli quand aucun modèle n'est disponible.
 * Ne JAMAIS présenter ces fonctions comme une IA générative.
 *
 * Exposé en global (window.KDLText) — chargé avant renderer.js.
 */
(function (root) {
  const STOP_FR = new Set(('au aux avec ce ces dans de des du elle en et eux il je la le les leur lui ma mais me même mes moi mon ne nos notre nous on ou où par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l à m n s t y été être ai as avait avons avez ont sont est sommes sera plus très peu tout tous toute toutes aussi alors donc car ni si sans sous entre vers chez leurs cette cet ceux').split(' '));
  const STOP_EN = new Set(('the a an and or but if of to in on for with as by at from is are was were be been being this that these those it its he she they we you i not no do does did has have had will would can could should more most very just also then so than into about over under between out up down off your our their his her my me us them'.split(' ')));

  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

  /** Découpe en phrases (heuristique multilingue). */
  function sentences(text) {
    const t = norm(text);
    if (!t) return [];
    // coupe après . ! ? … suivis d'espace + majuscule/chiffre, garde les abréviations courantes.
    const raw = t.split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ0-9"«"'])/);
    return raw.map(norm).filter((s) => s.length > 0);
  }

  function words(text) {
    return norm(text).toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
  }

  /** Devine la langue (fr/en/inconnu) via mots-outils fréquents. */
  function guessLang(text) {
    const w = words(text).slice(0, 400);
    if (!w.length) return 'inconnu';
    let fr = 0, en = 0;
    for (const x of w) { if (STOP_FR.has(x)) fr++; if (STOP_EN.has(x)) en++; }
    if (fr === 0 && en === 0) return 'inconnu';
    return fr >= en ? 'fr' : 'en';
  }

  /** Statistiques de lecture. */
  function stats(text) {
    const w = words(text);
    const s = sentences(text);
    const chars = norm(text).length;
    const readingMinutes = Math.max(1, Math.round(w.length / 200)); // ~200 mots/min
    return {
      words: w.length,
      sentences: s.length,
      chars,
      readingMinutes,
      avgSentenceWords: s.length ? Math.round(w.length / s.length) : 0,
    };
  }

  /** Mots-clés par fréquence pondérée (hors mots-outils), déduplication de racines simples. */
  function keywords(text, limit = 10) {
    const lang = guessLang(text);
    const stop = lang === 'en' ? STOP_EN : STOP_FR;
    const freq = new Map();
    for (const w of words(text)) {
      if (w.length < 4 || stop.has(w) || /^\d+$/.test(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term, count]) => ({ term, count }));
  }

  /**
   * Résumé EXTRACTIF (sélection de phrases, aucune génération).
   * Score = somme des fréquences de mots significatifs, bonus position + longueur idéale.
   */
  function summarize(text, maxSentences = 5) {
    const sents = sentences(text);
    if (sents.length <= maxSentences) return sents.join(' ');
    const lang = guessLang(text);
    const stop = lang === 'en' ? STOP_EN : STOP_FR;
    const freq = new Map();
    for (const w of words(text)) {
      if (w.length < 4 || stop.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    const maxFreq = Math.max(1, ...freq.values());
    const scored = sents.map((s, i) => {
      const ws = words(s);
      if (!ws.length) return { i, s, score: 0 };
      let score = 0;
      for (const w of ws) score += (freq.get(w) || 0) / maxFreq;
      score /= Math.sqrt(ws.length);                    // normalise par longueur
      if (i === 0) score *= 1.6;                          // 1re phrase souvent clé
      else if (i < 3) score *= 1.2;
      if (ws.length >= 8 && ws.length <= 30) score *= 1.1; // longueur "propre"
      return { i, s, score };
    });
    const top = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences);
    top.sort((a, b) => a.i - b.i);                        // rétablit l'ordre de lecture
    return top.map((x) => x.s).join(' ');
  }

  /** Points importants = top phrases sous forme de puces (extractif). */
  function keyPoints(text, n = 5) {
    const s = summarize(text, n);
    return sentences(s);
  }

  /** Nettoyage léger d'un texte (espaces, lignes vides multiples). */
  function clean(text) {
    return norm(String(text).replace(/\n{3,}/g, '\n\n'));
  }

  const api = { sentences, words, guessLang, stats, keywords, summarize, keyPoints, clean, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;   // tests Node
  if (root) root.KDLText = api;                                                // renderer
})(typeof window !== 'undefined' ? window : null);
