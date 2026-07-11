'use strict';
/**
 * KDL IA — service d'orchestration (renderer).
 * Deux niveaux : KDL IA Lite (local, gaté sur modèle) et Ollama local (facultatif).
 * Mode Automatique n'active JAMAIS Ollama silencieusement.
 * Repli non génératif (KDLText) toujours disponible.
 * Global : window.KDLAI
 */
(function (root) {
  const LS = { mode: 'kdl-ai-mode', omodel: 'kdl-ollama-model', len: 'kdl-ai-len' };
  const state = {
    mode: localStorage.getItem(LS.mode) || 'auto',        // auto | lite | ollama | byok | off
    ollama: { available: false, models: [] },
    model: { installed: [], downloadAllowed: false, dir: '' },
    byok: { configured: false, provider: null, model: null, hasKey: false, providers: [] },
    ollamaModel: localStorage.getItem(LS.omodel) || null,
    maxTokens: parseInt(localStorage.getItem(LS.len) || '256', 10),
    ready: false,
  };

  async function init() {
    try {
      const [o, m, b] = await Promise.all([window.kdl.ollamaDetect(), window.kdl.aiModelInfo(), window.kdl.byokConfig()]);
      state.ollama = o && o.available ? { available: true, models: o.models || [] } : { available: false, models: [] };
      state.model = m || state.model;
      state.byok = b || state.byok;
      if (state.ollamaModel && !state.ollama.models.includes(state.ollamaModel)) state.ollamaModel = null;
      if (!state.ollamaModel && state.ollama.models.length) state.ollamaModel = state.ollama.models[0];
    } catch { /* jamais bloquant */ }
    state.ready = true;
    return getStatus();
  }
  async function refreshByok() { try { state.byok = await window.kdl.byokConfig(); } catch { /* */ } return getStatus(); }

  function liteReady() { return (state.model.installed || []).some((x) => x.validated); }

  function byokReady() { return !!(state.byok && state.byok.configured && state.byok.hasKey); }
  function isRemote(prov) { return prov === 'byok'; }

  // Fournisseur effectif. 'auto' : Lite si prêt, sinon aucun.
  // Jamais d'Ollama NI de BYOK (distant) activé silencieusement : choix explicite requis.
  function effectiveProvider() {
    if (state.mode === 'off') return 'off';
    if (state.mode === 'lite') return liteReady() ? 'lite' : 'lite-missing';
    if (state.mode === 'ollama') return (state.ollama.available && state.ollamaModel) ? 'ollama' : 'ollama-missing';
    if (state.mode === 'byok') return byokReady() ? 'byok' : 'byok-missing';
    return liteReady() ? 'lite' : 'none';   // auto
  }

  function getStatus() {
    return {
      mode: state.mode, provider: effectiveProvider(),
      ollama: state.ollama, ollamaModel: state.ollamaModel,
      liteReady: liteReady(), model: state.model, byok: state.byok,
      maxTokens: state.maxTokens, remote: isRemote(effectiveProvider()),
    };
  }

  function setMode(m) { state.mode = m; localStorage.setItem(LS.mode, m); return getStatus(); }
  function setOllamaModel(m) { state.ollamaModel = m; localStorage.setItem(LS.omodel, m || ''); }
  function setMaxTokens(n) { state.maxTokens = Math.max(64, Math.min(512, n | 0)); localStorage.setItem(LS.len, String(state.maxTokens)); }

  /** Sonde la page : sélection, présence d'un champ mot de passe, et texte principal. */
  async function gatherPage(webview) {
    let probe = { url: '', selection: '', hasPassword: false };
    try {
      const raw = await webview.executeJavaScript(`JSON.stringify({
        url: location.href,
        selection: (window.getSelection && String(window.getSelection())) || '',
        hasPassword: !!document.querySelector('input[type=password]')
      })`, true);
      probe = JSON.parse(raw);
    } catch { /* */ }
    let text = probe.selection;
    if (!text || text.trim().length < 20) {
      const ex = await root.KDLExtract.extract(webview);
      text = ex.ok ? ex.text : '';
    }
    return { url: probe.url, selection: probe.selection, hasPassword: probe.hasPassword, text };
  }

  /**
   * Génération. Retourne :
   *   {ok:true, text}                          succès
   *   {needConfirm:true, preview}              page sensible : demander validation
   *   {ok:false, fallback:true, reason}        aucun fournisseur génératif
   *   {ok:false, error}                        erreur récupérable
   */
  async function run(kind, page, { confirmedSensitive = false } = {}) {
    const prov = effectiveProvider();
    if (prov === 'off') return { ok: false, fallback: true, reason: 'IA désactivée' };
    if (prov === 'none' || prov === 'lite-missing') return { ok: false, fallback: true, reason: 'Aucun modèle KDL IA Lite installé' };
    if (prov === 'ollama-missing') return { ok: false, fallback: true, reason: 'Ollama indisponible ou aucun modèle sélectionné' };
    if (prov === 'byok-missing') return { ok: false, fallback: true, reason: 'Aucune IA personnelle configurée (clé API)' };

    const payload = root.KDLPrivacyFilter.buildPayload(page);
    if (!payload) return { ok: false, error: 'Aucun texte à analyser' };
    // Confirmation requise si page sensible OU si le fournisseur est DISTANT (le texte quitte la machine).
    if ((root.KDLPrivacyFilter.isSensitive(page.url, page.hasPassword) || isRemote(prov)) && !confirmedSensitive) {
      return { needConfirm: true, remote: isRemote(prov), preview: payload.slice(0, 400) };
    }
    const prompt = root.KDLPrompts.build(kind, payload);

    if (prov === 'ollama') {
      const res = await window.kdl.ollamaGenerate(state.ollamaModel, prompt, state.maxTokens);
      if (res && res.ok && res.text) return { ok: true, text: res.text, via: 'Ollama · ' + state.ollamaModel + ' (local)' };
      return { ok: false, error: (res && res.error) || 'Échec de génération Ollama' };
    }
    if (prov === 'byok') {
      const res = await window.kdl.byokGenerate(prompt, Math.max(state.maxTokens, 400));
      if (res && res.ok && res.text) return { ok: true, text: res.text, via: 'Mon IA · ' + (state.byok.provider || '') + ' (distant)' };
      return { ok: false, error: (res && res.error) || 'Échec de la génération' };
    }
    if (prov === 'lite') {
      // Inférence Lite (Transformers.js) branchée à l'activation du modèle autorisé.
      return { ok: false, error: 'Moteur KDL IA Lite pas encore activé pour ce modèle' };
    }
    return { ok: false, fallback: true, reason: 'Fournisseur indisponible' };
  }

  /** Outils LOCAUX non génératifs (toujours disponibles, aucun modèle requis). */
  function runLocal(kind, text) {
    const T = root.KDLText;
    if (kind === 'resume') return { ok: true, text: T.summarize(text, 5), local: true };
    if (kind === 'points') return { ok: true, points: T.keyPoints(text, 6), local: true };
    if (kind === 'mots') return { ok: true, mots: T.keywords(text, 12), local: true };
    return { ok: false, error: 'Outil local inconnu' };
  }

  const api = { init, refreshByok, getStatus, setMode, setOllamaModel, setMaxTokens, gatherPage, run, runLocal, effectiveProvider, liteReady, byokReady };
  if (root) root.KDLAI = api;
})(window);
