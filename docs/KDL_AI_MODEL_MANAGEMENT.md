# Gestion des modèles KDL IA Lite

## Stockage
`userData/ai-models/<modele>/` (via API Electron `app.getPath('userData')`).
**Jamais** dans Git, la source, le Bureau, `node_modules` ou `/tmp`. `.gitignore` couvre
`ai-models/`, `*.onnx`, `*.gguf`.

## Téléchargement (gaté)
Désactivé par défaut. Le processus **principal** (jamais une page distante) gère le
téléchargement, sous HTTPS, depuis la **source officielle validée**, avec vérification
**SHA-256**, suppression des fichiers incomplets, reprise si supportée, annulation possible.
Activation : autorisation explicite de l'utilisateur (garde `KDL_AI_ALLOW_DOWNLOAD=1`).
Aucune donnée personnelle envoyée.

## Paramètres (panneau IA)
Modèle installé, taille, date, état de validation, moteur actif ; boutons vérifier /
supprimer / retélécharger / libérer la mémoire. Le chemin système complet n'est pas exposé.

## IPC (processus principal)
`kdl:ai-model-info`, `kdl:ai-model-delete`, `kdl:ai-model-download` (gaté).
Une page distante ne peut jamais déclencher un téléchargement ou une exécution de modèle.
