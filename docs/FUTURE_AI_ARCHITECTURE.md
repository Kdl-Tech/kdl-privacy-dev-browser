# Architecture IA future — KDL Privacy Dev Browser

> Document de préparation. **Aucune IA n'est intégrée** dans la version actuelle.
> Aucun bouton visible, aucun appel réseau, aucune clé, aucun modèle téléchargé.
> Objectif : permettre une intégration ultérieure simple, gratuite et respectueuse
> de la vie privée.

## 1. Cas d'usage envisagés
- **Résumer** la page ou une sélection.
- **Expliquer** un extrait (code, texte technique).
- **Traduire** une sélection.
- **Aide au développement** (expliquer une erreur, une requête, un bout de HTML/JS).

Toujours à la demande explicite de l'utilisateur — jamais en tâche de fond.

## 2. Séparation des composants
| Couche          | Rôle                                                    | État |
|-----------------|---------------------------------------------------------|------|
| **UI**          | Panneau assistant (réutilise `.panel` existant)         | non créée |
| **Orchestration** | Construit la tâche, applique les règles de confidentialité | non créée |
| **Fournisseur** | Contrat abstrait `AIProvider` (`src/ai/provider.js`)    | **présent, désactivé** |

L'UI ne parle jamais directement à un fournisseur : elle passe par l'orchestration,
qui seule décide ce qui peut être envoyé et à qui.

## 3. Exigences de confidentialité (non négociables)
- Désactivé par défaut (`aiConfig.enabled = false`).
- Ne jamais lire automatiquement les pages ; n'agir que sur une sélection/commande.
- Ne jamais envoyer une page privée sans confirmation explicite.
- Aucun accès aux mots de passe, cookies d'authentification, ni à l'historique.
- Aucun enregistrement sans consentement.
- Un fournisseur **distant** ne doit jamais être présenté comme **local**
  (champ `isLocal` du contrat, affiché clairement dans l'UI).

## 4. Pistes gratuites à étudier plus tard
1. **Moteur local** (100 % hors-ligne) : WebLLM (WebGPU) embarqué, ou détection d'un
   Ollama local déjà installé. Idéal côté vie privée ; coût = poids/tokens locaux.
2. **Fournisseur avec palier gratuit**, activé manuellement par l'utilisateur (sa clé,
   son consentement) — jamais de clé fournie par défaut.
3. **IA du navigateur** activée manuellement (API expérimentales) si disponible.

## 5. Critères de sélection (à trancher plus tard)
- Gratuité réelle et absence d'abonnement imposé.
- Confidentialité (local > palier gratuit distant).
- Poids d'intégration raisonnable (pas de dépendance IA lourde par défaut).
- Qualité suffisante pour résumer/expliquer/traduire.

## 6. Volontairement NON implémenté aujourd'hui
- Aucun panneau assistant visible, aucun faux bouton.
- Aucun package IA, aucun modèle, aucun endpoint, aucun appel réseau supplémentaire.
- Aucun choix définitif de fournisseur.

Le seul artefact présent est le contrat `src/ai/provider.js` (fournisseur « nul »
par défaut, qui répond toujours « indisponible »).
