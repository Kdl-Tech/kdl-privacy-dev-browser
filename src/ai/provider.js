'use strict';

/**
 * KDL Privacy Dev Browser — couche fournisseur IA (préparation, DÉSACTIVÉE).
 * ---------------------------------------------------------------------------
 * Ce module N'EST PAS branché à l'interface et ne fait AUCUN appel réseau.
 * Il définit uniquement le contrat qu'un futur assistant devra respecter, pour
 * que l'intégration (mission ultérieure) soit simple et non intrusive.
 *
 * Règles de confidentialité imposées à toute future implémentation :
 *  - désactivé par défaut (enabled: false) ;
 *  - jamais de lecture automatique des pages ;
 *  - jamais d'envoi d'une page sans action explicite de l'utilisateur ;
 *  - aucun accès aux mots de passe, cookies d'authentification ou historique ;
 *  - un fournisseur distant ne doit JAMAIS se présenter comme « local ».
 *
 * Voir docs/FUTURE_AI_ARCHITECTURE.md.
 */

/**
 * Contrat d'un fournisseur IA.
 * @typedef {Object} AIProvider
 * @property {string}  id            Identifiant court (ex. "none", "local", "webllm").
 * @property {string}  label         Nom affichable.
 * @property {boolean} isLocal       true si l'inférence est 100 % locale.
 * @property {boolean} needsNetwork  true si un appel réseau est requis.
 * @property {() => Promise<boolean>} isAvailable  Détection (aucun effet de bord réseau tant que non activé).
 * @property {(task: AITask) => Promise<AIResult>} run  Exécute une tâche (résumer/expliquer/traduire…).
 */

/** @typedef {{ kind:'summarize'|'explain'|'translate'|'dev', input:string, meta?:object }} AITask */
/** @typedef {{ ok:boolean, text?:string, error?:string }} AIResult */

/** Fournisseur nul : présent par défaut, ne fait rien. Garantit une UI honnête (« indisponible »). */
const nullProvider = {
  id: 'none',
  label: 'Aucun (assistant désactivé)',
  isLocal: true,
  needsNetwork: false,
  async isAvailable() { return false; },
  async run() { return { ok: false, error: 'Assistant IA non configuré (prévu dans une prochaine version).' }; },
};

/** Configuration de l'assistant. Désactivé par défaut ; aucune clé, aucun endpoint. */
const aiConfig = {
  enabled: false,
  providerId: 'none',
  // Pistes gratuites à étudier plus tard (aucune n'est implémentée ici) :
  //   'local'  → moteur local (WebLLM / Ollama détecté), 100 % hors-ligne ;
  //   'free'   → fournisseur avec palier gratuit, activé manuellement par l'utilisateur.
};

const providers = new Map([[nullProvider.id, nullProvider]]);

/** Enregistre un fournisseur (utilisé par la future intégration, pas maintenant). */
function registerProvider(p) {
  if (p && typeof p.id === 'string' && typeof p.run === 'function') providers.set(p.id, p);
}

/** Retourne le fournisseur actif ; tant que l'IA est désactivée, c'est le fournisseur nul. */
function getActiveProvider() {
  if (!aiConfig.enabled) return nullProvider;
  return providers.get(aiConfig.providerId) || nullProvider;
}

module.exports = { aiConfig, providers, nullProvider, registerProvider, getActiveProvider };
