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

## V1.1 (courte — NE PAS démarrer avant V1 validée + poussée proprement + intégrée KDL-TECH / Maia / KDL Pro Launcher)

Petites améliorations sans changement d'architecture :

- [ ] Multi-onglets simple (2-3 onglets max).
- [ ] Édition/renommage d'un favori + recherche dans la liste.
- [ ] Export/import des favoris en JSON local.
- [ ] Aligner « Nettoyer le site » sur la partition `persist:kdl` (corrige la note V1 : nettoyage agit sur defaultSession).
- [ ] Téléchargements : dossier dédié + confirmation.
- [ ] Raccourci favori (Ctrl+D) et raccourci panneau favoris.
- [ ] Icône PNG multi-tailles (256/128/48) en plus du SVG pour les thèmes qui ne rendent pas le SVG.

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
