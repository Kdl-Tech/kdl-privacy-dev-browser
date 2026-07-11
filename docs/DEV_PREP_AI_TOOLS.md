# Préparation — KDL IA Lite + outils navigateur (mission suivante)

> Document de lancement. **Aucune fonctionnalité IA/outil n'est encore développée.**
> Il capture le diagnostic déjà fait pour démarrer vite la prochaine session.
> Prochaine session = le gros du travail (implémentation par checkpoints).

## 0. État vérifié (point de départ)
- **Chemin projet** : `/home/skyme/Bureau/Dossiers d'apps/kdl-privacy-dev-browser`
- **Git** : dépôt propre. Branche de mission créée : `feature/kdl-ai-lite-and-browser-tools`
  (partant du commit refonte visuelle `a27078b` sur `feature/premium-visual-redesign`).
- **Version** : 1.2.0 (`package.json`, écran À propos). Prochaine cible probable : **1.3.0** (mineure).
- **Runtime** : Node v20.20.2, npm 10.8.2, **Electron 42.4.1**.
- **Structure src/** : `main.js` (261 l.), `preload.js` (18 l.), `renderer.js`, `index.html`,
  `home.html`, `styles.css`, **`ai/provider.js`** (contrat fournisseur, désactivé).
- **Docs déjà présents** : `FUTURE_AI_ARCHITECTURE.md`, `README.md`, `CHANGELOG.md`, `ROADMAP.md`.
- **Scripts npm** : `start` (electron .), `dev`, `build` (electron-builder), `audit:secrets`.
- **Lancement local** : `packaging/launch.sh` (ajoute `--no-sandbox` car chrome-sandbox non setuid
  sur ce poste) ; test visuel jetable : `test/visual-nav.js`.
- **Icône fenêtre/app** : `assets/icon-256.png` (marque officielle KDL TECH).

## 1. Matériel cible (RÈGLE — ne plus jamais mentionner l'ancien Ryzen/RX470)
- **HP EliteDesk 800 G3 Mini**, 16 Go RAM, **aucune carte graphique dédiée**, Linux Mint.
- IA = **CPU/WASM par défaut** (mode universel). WebGPU = accélération *facultative* si réellement dispo.
- **Interdit** : CUDA, ROCm, pilote GPU, toute dépendance à un GPU dédié.

## 2. Sécurité Electron déjà en place (à PRÉSERVER)
`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, `webviewTag:true`.
Preload minimal (API `window.kdl` nommée), `setWindowOpenHandler` → `shell.openExternal` (http/https only),
permissions refusées par défaut (`setPermissionRequestHandler`, seuls `fullscreen` + `clipboard-sanitized-write`),
téléchargements → `~/Bureau/kdl-telechargements` (aucune exécution auto). CSP index.html :
`default-src 'self'; img-src 'self' data: https:` (https = favicons uniquement).
IPC handlers existants : `clear-site-data`, `clear-all`, `open-external`, `about`, `export/import-favs`,
`screenshot`, `third-party-cookies`, `detect-tor`, `open-tor`.

## 3. Règles absolues de la mission
- **Zéro coût** hors tokens Claude : pas d'API payante/crédits/abonnement/licence. Libre + local only.
- **Local uniquement** : NE PAS toucher VPS / site / DNS / Cloudflare / Nginx / PM2 / Maia / Launcher.
- **IA facultative** : jamais requise au démarrage/navigation. Le navigateur doit tourner sans modèle,
  sans Internet, sans Ollama, sans WebGPU.
- **Modèle** : ne JAMAIS télécharger sans autorisation explicite de Karim (une seule demande avant le test réel).
- **Modèles hors Git** : stockés sous `userData/ai-models/` (ajouter au `.gitignore`).
- **Commits locaux OK, aucun push.**

## 4. Architecture modulaire prévue (à créer, HTML/CSS/JS simple — pas de framework lourd)
```
src/ai/{providers/{lite-provider,ollama-provider}.js, model-manager.js, ai-service.js,
        page-context.js, prompt-templates.js, privacy-filter.js, worker/ai-worker.js}
src/reader/{extractor,reader-controller,reader-export,reader-state}.js
src/privacy/{permissions-manager,site-data-manager,request-observer,privacy-store}.js
src/downloads/{download-manager,download-store,checksum-service}.js
src/workspaces/{workspace-manager,session-store,closed-tabs}.js
src/devtools/{page-inspector,headers-viewer,console-observer,json-viewer}.js
```
Réutiliser `.panel` existant pour les nouveaux panneaux. Réutiliser le worker pour l'inférence
(aucun traitement lourd dans le renderer).

## 5. Pistes techniques à VÉRIFIER en Phase 2 (docs officielles, avant tout choix)
> Ne rien verrouiller sans confirmer la compat Electron 42 / Node 20 actuelle.
- **Moteur Lite** : Transformers.js (@huggingface/transformers) + ONNX Runtime Web, backend WASM (CPU),
  WebGPU optionnel ; exécution en Web Worker ; chargement paresseux.
- **Modèles candidats** (instruct multilingues FR, ~300M–1.5B, licence redistribuable, ONNX quantifié) :
  à comparer taille téléchargement / disque / RAM / temps 1er token / qualité FR / licence.
  Écarter 7B–8B, `uncensored`, `abliterated`, dépôts douteux. Documenter le choix (`docs/KDL_AI_LITE.md`).
- **IA Plus** : Ollama local uniquement (`127.0.0.1:11434`), détection sans installation, lister modèles
  déjà présents, jamais de pull auto, jamais Ollama Cloud.

## 6. Ordre des checkpoints (commit local + rollback à chaque étape validée)
1. diagnostic + architecture (dossiers/stubs) → 2. sécurité/IPC (whitelist, validation args) →
3. UI panneau IA (états) → 4. model-manager (télécharger/valider/supprimer, **gate autorisation**) →
5. KDL IA Lite (worker) → 6. repli non génératif (résumé extractif, mots-clés, temps lecture) →
7. Ollama facultatif → 8. mode lecture → 9. centre de confidentialité par site →
10. gestionnaire téléchargements (SHA-256, alerte exécutables) → 11. espaces de travail/sessions →
12. boîte à outils dev → 13. `docs/PRIVACY_SHIELD_ROADMAP.md` (observation seule, aucun blocage) →
14. perf (mesures réelles HP EliteDesk) → 15. tests complets → 16. finition visuelle.

## 7. Docs à produire (mission)
`KDL_AI_LITE.md`, `KDL_AI_PROVIDERS.md`, `KDL_AI_PRIVACY.md`, `KDL_AI_MODEL_MANAGEMENT.md`,
`OFFLINE_EDITION_ARCHITECTURE.md`, `PRIVACY_SHIELD_ROADMAP.md` + MAJ README/CHANGELOG/version.

## 8. Rollback (état actuel)
```bash
cd "/home/skyme/Bureau/Dossiers d'apps/kdl-privacy-dev-browser"
git checkout feature/premium-visual-redesign        # revenir à la refonte visuelle (1.2.0)
git branch -D feature/kdl-ai-lite-and-browser-tools  # supprimer la branche de mission si besoin
```
Sauvegarde refonte visuelle : commit `a27078b` + dossier `.backups-redesign-20260710-214225/`.
