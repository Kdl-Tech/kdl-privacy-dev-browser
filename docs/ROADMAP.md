# ROADMAP — KDL Privacy Dev Browser

## V1 (livrée) — base fluide, légère, stable

- [x] Navigation : barre adresse/recherche, back/forward/reload/home, page d'accueil, mode sombre
- [x] DuckDuckGo par défaut
- [x] DevTools page
- [x] Nettoyage données site courant (cookies, cache, local/sessionStorage)
- [x] Capture d'écran de la page
- [x] Modes responsive Desktop / Tablette / Mobile
- [x] Panneau infos page (URL, titre, domaine, HTTPS, user-agent)
- [x] Audit léger maison (title, meta, H1, HTTPS, images sans alt, liens externes)
- [x] Confidentialité : pas de télémétrie, historique désactivable, effacer à la fermeture,
      blocage cookies tiers (option), aucun tracking KDL
- [x] Onion Search prudent : recherche Ahmia publique, .onion → Tor Browser externe + avertissement
- [x] Sécurité Electron stricte (isolation, sandbox, preload minimal, CSP)

## V1.1 (livrée — branche `feature/v1.1-polish`)

Petites améliorations sans changement d'architecture :

- [x] Multi-onglets simples (barre d'onglets, nouvel/fermer/changer, 1 onglet minimum, webview par onglet).
- [x] Favoris améliorés : édition titre/URL, recherche, export et import JSON (anti-doublon + validation d'URL).
- [x] « Nettoyer le site » et clear-all alignés sur `persist:kdl` (corrige le bug V1 : agissait sur defaultSession ; favoris/préférences désormais préservés).
- [x] Téléchargements : dossier dédié `~/Bureau/kdl-telechargements`, notification à la fin, aucune exécution/ouverture auto.
- [x] Raccourcis : Ctrl+L, Ctrl+R, Ctrl+T, Ctrl+W, Ctrl+D, Ctrl+Shift+I (+ F12, Ctrl+Shift+M).
- [x] Page « À propos » (version, MIT, lien GitHub, non-affiliation, rappel VPN/IA = V2).
- [x] Icône PNG multi-tailles (256/128/48) en plus du SVG ; `.desktop` pointe sur le PNG.

## V2 (préparée, NON codée en V1)

### VPN Basic WireGuard
- Intégration d'un profil WireGuard côté système (pas de VPN propriétaire).
- Indicateur d'état connecté/déconnecté, kill-switch simple.
- Architecture : module `src/vpn/` isolé, contrôlé par IPC, jamais de secret en clair.

### Assistant IA Maia / KDL
- Panneau latéral IA (analyse de page, résumé, aide audit).
- Architecture : module `src/ai/` appelant un backend KDL (clé jamais embarquée côté client).
- Respect confidentialité : opt-in explicite, aucune donnée envoyée sans action utilisateur.

### Rapports client PDF / HTML
- Export d'audit (V1 enrichie + Lighthouse optionnel) en PDF/HTML brandé KDL.
- Architecture : module `src/report/`, génération locale, aucune dépendance payante.

### Autres pistes V2
- Multi-onglets complet.
- Audit avancé (Lighthouse en option, sans alourdir la V1).
- Gestion de profils/partitions multiples.
- Détection Tor multi-plateforme (macOS / Windows).

## Principes maintenus

- Gratuit et open source (MIT).
- Aucune dépendance payante, aucun service propriétaire obligatoire.
- Aucun tracking, aucun compte obligatoire.
- Non affilié à DuckDuckGo, au Tor Project ni à Ahmia.
