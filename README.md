<div align="center">

# 🔒 KDL Privacy Dev Browser

**A lightweight Electron browser for developers who don't want to be tracked — private search, real dev tools, optional local AI, and zero telemetry.**

[![License: MIT](https://img.shields.io/badge/License-MIT-1F5278.svg)](LICENSE)
[![No telemetry](https://img.shields.io/badge/Telemetry-none-22c55e.svg)](#privacy)
[![Electron](https://img.shields.io/badge/Electron-hardened-47848F.svg)](#electron-security)
[![Linux · Windows · macOS](https://img.shields.io/badge/Linux%20%C2%B7%20Windows%20%C2%B7%20macOS-supported-blue.svg)]()

*🇫🇷 [Documentation française complète plus bas](#-documentation-française)*

</div>

---

## What it is

A desktop browser built for the two things Chrome does badly: **not watching you**,
and **not making you install five extensions to inspect a page**. Built on Electron,
daily-driven on Linux Mint, packaged for Windows and macOS too.

**Free software, MIT.** No paid dependency, no mandatory proprietary service, no
account, no tracking.

## Features

- **Private browsing** — DuckDuckGo by default, minimal local history you can
  disable, "clear on close", optional third-party cookie blocking, **no telemetry
  of any kind**
- **Built-in dev tools** — page DevTools, one-click site-data wipe (cookies, cache,
  local/sessionStorage), full-page screenshot, responsive modes (desktop/tablet/
  mobile), page info panel (URL, title, domain, HTTPS, user-agent)
- **Lightweight page audit** — title / meta description / H1 presence, HTTPS,
  images missing `alt`, external links, overall verdict. *(Not a Lighthouse
  replacement.)*
- **Reading mode** — clean extraction, 3 themes, adjustable size/width/line-height,
  reading time, **Markdown export**, **PDF printing**
- **Optional local AI (KDL IA)** — three levels, always opt-in:
  - *KDL IA Lite* — small **local** model, free, no account, no GPU required;
    instant local tools (extractive summary, key points, keywords)
  - *Ollama* — optional local backend, never auto-installed, never cloud
  - *BYOK* — bring your own API key (Claude, OpenAI, Gemini, Grok, OpenAI-compatible
    endpoints); the key is stored locally and never exposed
  - **The browser works fully without any AI**, offline, with no model installed
- **Onion Search** — via the public Ahmia index. `.onion` addresses are **never**
  opened inside Electron; a warning offers to hand off to an external Tor Browser
  if one is detected. Legal use only.

<a id="electron-security"></a>
## Electron hardening

`contextIsolation: true` · `nodeIntegration: false` · `sandbox: true` · minimal
preload exposing a single narrow API (`window.kdl`) · isolated `<webview>` · no
arbitrary code execution from web pages · external window opening routed to the
system browser via `setWindowOpenHandler` · sensitive permissions (camera, mic,
geolocation, notifications) denied by default · strict CSP on the UI.

<a id="privacy"></a>
## Privacy stance

No telemetry, no analytics, no phone-home — including for the AI panel, which
never sees passwords, cookies or other tabs, and asks for confirmation before any
remote send or on a sensitive page. See `docs/KDL_AI_PRIVACY.md`.

## Quick start

```bash
npm install
npm start          # or: npm run dev (with DevTools)
```

> On Linux, if the Electron sandbox misbehaves (Mint without setuid `chrome-sandbox`):
> `npm start -- --no-sandbox` — avoid in normal use.

## Trademarks

DuckDuckGo, Tor Browser and Ahmia are used as described above. KDL Privacy Dev
Browser is **not affiliated with DuckDuckGo, the Tor Project or Ahmia**, and uses
none of their logos as branding.

## Contributing

Most wanted: packaging fixes on Windows/macOS, and audit-rule improvements.
⭐ helps other privacy-minded developers find it.

---

<a id="-documentation-française"></a>

## 🇫🇷 Documentation française

Navigateur de bureau **léger, confidentiel et orienté développeur**, basé sur Electron.
Pensé pour Linux Mint (fonctionne aussi sur les autres plateformes Electron).

> **Logiciel libre et gratuit** — licence MIT. Aucune dépendance payante, aucun service
> propriétaire obligatoire, aucun compte requis, aucun tracking.

## Nouveautés — 1.3.0 (IA locale + mode lecture)

- **KDL IA** (panneau assistant) à trois niveaux, IA **facultative** :
  - **KDL IA Lite** — petite IA **locale, gratuite, sans compte ni carte graphique** ;
    outils locaux immédiats (résumé extractif, points clés, mots-clés) + modèle génératif
    à installer volontairement (CPU/WASM). Voir `docs/KDL_AI_LITE.md`.
  - **Ollama** local facultatif (jamais installé/pull auto, jamais de cloud).
  - **Mon IA (BYOK)** — connectez **votre** compte via API (Claude, OpenAI/Codex, Gemini,
    Grok, endpoint compatible OpenAI) avec **votre** clé, stockée localement, jamais exposée.
- **Mode lecture** sans distraction : extraction propre, 3 thèmes, taille/largeur/interligne,
  temps de lecture, export **Markdown**, impression **PDF**, outils locaux + IA.
- Confidentialité IA stricte (`docs/KDL_AI_PRIVACY.md`) : jamais de mots de passe/cookies/
  autres onglets ; confirmation sur page sensible ou envoi distant.
- Effet visuel sur « effacer la session » (respecte `prefers-reduced-motion`).
- Logo KDL TECH dans la barre du navigateur.
- Distribution multi-plateforme configurée (`docs/OFFLINE_EDITION_ARCHITECTURE.md`) :
  `.AppImage`/`.deb` (Linux), `.exe` (Windows), `.dmg` (macOS).
- L'IA n'est **jamais** requise : le navigateur fonctionne sans modèle, hors ligne, sans Ollama.

## Nouveautés — 1.2.0 (refonte visuelle premium)

- **Identité KDL TECH** : logo officiel, icônes d'application régénérées, palette
  navy/cyan et typographies Space Grotesk / Inter alignées sur `kdl-tech.fr`.
- **Interface repensée** : jeu d'icônes **SVG** cohérent (plus aucun emoji), menu
  d'outils regroupé, barre d'adresse mise en avant, indicateur de sécurité HTTPS.
- **Onglets** : favicon réel, indicateur de chargement, fermeture claire.
- **Page d'accueil** : monogramme officiel, grande recherche centrale, raccourcis
  fonctionnels, fond technique 100 % CSS (aucune ressource distante).
- **Raccourcis** : `Ctrl+L/T/W/D/J`, `Ctrl+Shift+T` (rouvrir), zoom `Ctrl +/-/0`,
  `Alt+←/→`, DevTools `F12`.
- **Accessibilité** : focus clavier visible, `prefers-reduced-motion` respecté.
- **Préparation IA** (désactivée) : contrat fournisseur abstrait + `docs/FUTURE_AI_ARCHITECTURE.md`.
  Aucune IA, clé, ni appel réseau ajouté.

## Fonctions V1

- **Navigation fluide** : barre d'adresse/recherche, précédent / suivant / recharger / accueil,
  page d'accueil dédiée, mode sombre sobre.
- **Recherche privée** : DuckDuckGo par défaut.
- **Outils développeur** :
  - DevTools de la page,
  - nettoyage des données du site courant (cookies, cache, local/sessionStorage),
  - capture d'écran de la page (`~/Bureau/kdl-captures/`),
  - modes responsive (Desktop / Tablette / Mobile),
  - panneau infos page (URL, titre, domaine, protocole HTTPS, user-agent).
- **Audit léger maison** : présence title / meta description / H1, HTTPS, images sans `alt`,
  liens externes, statut global OK / à vérifier. (Pas un remplacement de Lighthouse.)
- **Confidentialité** : aucune télémétrie, historique local minimal et désactivable,
  option « effacer à la fermeture », blocage cookies tiers (option), aucun tracking KDL.
- **Onion Search** : recherche via la page **publique Ahmia**. Les adresses `.onion` ne sont
  **jamais** ouvertes dans Electron ; un avertissement propose l'ouverture via **Tor Browser**
  externe s'il est détecté. Usage légal uniquement.

## Sécurité Electron

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- preload minimal exposant une API nommée et réduite (`window.kdl`)
- `<webview>` isolée (`contextIsolation=yes, nodeIntegration=no, sandbox=yes`)
- aucune exécution de code arbitraire issu des pages web
- ouverture de fenêtres externes contrôlée (`setWindowOpenHandler` → navigateur système)
- permissions web sensibles refusées par défaut (caméra, micro, géoloc, notifications)
- CSP stricte sur l'UI

## Installation & lancement

```bash
cd ~/Bureau/kdl-privacy-dev-browser
npm install
npm start        # ou : npm run dev (DevTools ouverts)
```

> Sous Linux, si la sandbox Electron pose problème (Mint sans `chrome-sandbox` setuid) :
> `npm start -- --no-sandbox` (à éviter en usage normal).

## Scripts

| Script | Rôle |
|--------|------|
| `npm start` | Lance l'application |
| `npm run dev` | Lance avec DevTools de l'UI |
| `npm run build` | Build via electron-builder (optionnel, à ajouter en V2) |
| `npm run audit:secrets` | Vérifie l'absence de secrets dans le dépôt |

## Raccourcis

- `Ctrl+L` : focus barre d'adresse · `Ctrl+R` : recharger · `F12` : DevTools page
- `Ctrl+Shift+M` : barre responsive

## Marques & affiliation

- **DuckDuckGo** est utilisé comme moteur de recherche par défaut.
- **Tor Browser** sert uniquement d'ouverture externe optionnelle pour les `.onion`.
- **Ahmia** est utilisé pour la recherche publique.
- KDL Privacy Dev Browser **n'est affilié ni à DuckDuckGo, ni au Tor Project, ni à Ahmia**.
  Aucun logo ni marque de ces projets n'est utilisé comme branding officiel.

## Licence

[MIT](LICENSE) © KDL-TECH / Karim DeLucia.

## Roadmap

Voir [docs/ROADMAP.md](docs/ROADMAP.md). V2 prévoit VPN (WireGuard), assistant IA Maia/KDL et
rapports client PDF/HTML — **non implémentés en V1**.

---

<div align="center">

**Autres outils [KDL TECH](https://kdl-tech.fr)** — atelier indépendant de dépannage
informatique et de développement en Guadeloupe 🇬🇵

[Anti-arnaque](https://github.com/Kdl-Tech/kdl-anti-arnaque) ·
[Prompt Studio](https://github.com/Kdl-Tech/kdl-prompt-studio) ·
[DNS Shield](https://github.com/Kdl-Tech/kdl-dns-shield) ·
[Security Free](https://github.com/Kdl-Tech/kdl-security-free) ·
[MAIA Conky](https://github.com/Kdl-Tech/maia-conky)

</div>
