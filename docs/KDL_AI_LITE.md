# KDL IA Lite

Petite IA **locale, gratuite, sans compte, sans carte graphique dédiée**.
Cible : HP EliteDesk 800 G3 Mini, 16 Go, CPU only (Linux Mint). WebGPU = accélération
facultative si réellement présente ; **WebAssembly/CPU** reste le mode universel.

## Ce qui fonctionne déjà (sans aucun modèle)
Outils **non génératifs** locaux, immédiats, dans le panneau IA et le mode lecture :
résumé extractif, points clés, mots-clés, statistiques et temps de lecture, détection
de langue. Aucune donnée ne quitte la machine.

## IA générative Lite (modèle à installer, volontaire)
- Moteur prévu : Transformers.js + ONNX Runtime Web (backend WASM/CPU, WebGPU si dispo),
  exécution dans un **worker** dédié, chargement paresseux, un seul modèle en mémoire.
- Modèle : petit instruct multilingue FR quantifié ONNX (~300 M–1,5 B), licence
  redistribuable. Le choix exact est épinglé au moment de l'activation (source officielle
  + vérification SHA-256) — voir `KDL_AI_MODEL_MANAGEMENT.md`.
- **Le modèle n'est jamais téléchargé silencieusement** : première activation = fenêtre
  claire (nom, rôle, taille exacte, espace disque, « gratuit », « local », « sans compte »,
  « sans carte graphique »), boutons Télécharger / Annuler. Hors ligne ensuite.

## Limites (honnêtes)
Petit modèle local : utile pour résumer, expliquer, simplifier, traduire de courts
extraits. **Ce n'est pas** une grande IA cloud. Les performances dépendent du processeur.

## Fonctions
Résumer, expliquer, simplifier, reformuler, corriger, traduire, points clés, fiche,
titre, expliquer un code HTTP / une erreur / un extrait de code.
