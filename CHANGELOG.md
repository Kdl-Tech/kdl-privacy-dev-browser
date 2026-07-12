# Changelog — KDL Privacy Dev Browser

## Non publié — pilote KDL Design System
- Adoption du **KDL Design System v0.1.0** (langage « Products ») : thème **clair
  par défaut** (ivoire/sable) + thème **sombre** (ardoise bleutée), accent bleu KDL
  repris du site à la place du cyan néon.
- Bascule de thème (bouton barre d'outils + `Ctrl+Shift+L`), mémorisée
  (`localStorage kdl-theme`), anti-flash (`theme-boot.js`), propagée à la page
  d'accueil (`?theme=`). Aucun changement fonctionnel ni de sécurité Electron.
- Page d'accueil épurée (fond sobre sans néon/circuit décoratif), logo Products conservé.

## 1.3.0 — IA locale facultative + mode lecture
- KDL IA (panneau) : KDL IA Lite (local, outils non génératifs actifs + modèle génératif
  à installer), Ollama local facultatif, « Mon IA » BYOK via API (Claude/OpenAI/Gemini/Grok
  ou compatible OpenAI ; clé locale 0600, jamais exposée).
- Mode lecture pro : extraction assainie, 3 thèmes, réglages typo, temps de lecture,
  export Markdown, impression/PDF, outils locaux + actions IA.
- Confidentialité IA : jamais de mots de passe/cookies/autres onglets ; détection des
  pages sensibles ; confirmation avant envoi distant.
- Effet visuel « effacer la session » (balayage cyan, reduced-motion respecté).
- Logo KDL dans la barre ; panneaux passés en drawer (au-dessus du webview) + fond assombri.
- Distribution multi-plateforme configurée (electron-builder : AppImage/deb, exe, dmg).
- Docs : KDL_AI_LITE, KDL_AI_PROVIDERS, KDL_AI_PRIVACY, KDL_AI_MODEL_MANAGEMENT,
  OFFLINE_EDITION_ARCHITECTURE, PRIVACY_SHIELD_ROADMAP.
- Le navigateur reste 100 % fonctionnel sans IA, hors ligne, sans Ollama, sans WebGPU.

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
