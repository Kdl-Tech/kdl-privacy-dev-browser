# Changelog — KDL Privacy Dev Browser

## 1.2.0 — Refonte visuelle premium (identité KDL TECH)
- Logo officiel + icônes d'application régénérées depuis la marque KDL TECH.
- Jeu d'icônes SVG cohérent (suppression de tous les emojis d'interface).
- Barre d'onglets : favicon réel, indicateur de chargement, fermeture SVG.
- Barre de navigation : champ d'adresse mis en avant, indicateur de sécurité HTTPS,
  menu d'outils regroupé (Infos, Audit, DevTools, Effacer, Onion, Confidentialité, À propos).
- Page d'accueil repensée : monogramme officiel, recherche centrale, raccourcis
  fonctionnels, fond technique 100 % CSS (aucune ressource distante).
- Raccourcis ajoutés : Ctrl+Shift+T (rouvrir), Ctrl+J (téléchargements),
  zoom Ctrl +/-/0, Alt+←/→.
- Accessibilité : focus clavier visible, prefers-reduced-motion respecté.
- Préparation (désactivée) d'une future IA gratuite : contrat fournisseur abstrait
  (src/ai/provider.js) + docs/FUTURE_AI_ARCHITECTURE.md. Aucune IA/clé/appel réseau.
- Sécurité Electron inchangée (contextIsolation, sandbox, nodeIntegration off,
  permissions refusées par défaut, ouverture externe et téléchargements contrôlés).

## 1.1.0
- Multi-onglets, favoris (import/export local), Onion Search prudent, audit léger,
  captures, nettoyage de session, protocole local anti-GitHub.
