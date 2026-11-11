# Fournisseurs IA — 3 niveaux

Sélecteur : **Auto · KDL IA Lite · Ollama · Mon IA · Désactivée**.
`Auto` = Lite si son modèle est prêt, sinon aucun. **Jamais** de bascule silencieuse
vers un fournisseur distant ou Ollama : choix explicite requis.

| Niveau | Où | Coût | Réseau | Statut |
|--------|-----|------|--------|--------|
| **KDL IA Lite** | 100 % local (WASM/CPU) | gratuit | non (après install) | outils locaux OK ; modèle génératif à installer |
| **Ollama** | local `127.0.0.1:11434` | gratuit | non (local) | facultatif ; jamais installé/pull auto ; jamais Ollama Cloud |
| **Mon IA (BYOK)** | **distant** (API) | clé de l'utilisateur | oui | Claude/OpenAI-Codex/Gemini/Grok/compatible OpenAI |

## Ollama
Détection sans installation ; liste des modèles **déjà** installés ; l'utilisateur choisit ;
retour immédiat possible vers Lite. Aucun modèle téléchargé automatiquement.

## Mon IA (BYOK, via API)
L'utilisateur connecte **sa propre** IA avec **sa propre** clé. Aucune clé fournie par KDL.
La clé est stockée localement dans un fichier protégé (`chmod 600`, `userData/ai-byok.json`),
**jamais** renvoyée au renderer, **jamais** journalisée, envoyée **uniquement** à l'endpoint
officiel choisi. Fournisseur **distant** : clairement signalé, confirmation avant envoi.
Formats gérés : Anthropic (`/v1/messages`), OpenAI-compatible (`/chat/completions` — OpenAI,
Grok/xAI, URL perso), Gemini (`generateContent`).
