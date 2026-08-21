**Français** · [English](README.en.md)

# KDL Privacy Dev Browser

Un navigateur de bureau qui ne vous observe pas et qui embarque déjà les outils qu'on
finit toujours par installer en extensions : inspection de page, effacement des données du
site, capture pleine page, mode lecture, audit rapide.

```bash
git clone https://github.com/Kdl-Tech/kdl-privacy-dev-browser.git
cd kdl-privacy-dev-browser && npm install && npm start
```

![Fenêtre de KDL Privacy Dev Browser sur sa page d'accueil : barre d'adresse DuckDuckGo, boutons DuckDuckGo, Favoris, DevTools, Onion Search et Effacer session, avec la mention « Session privée locale — aucune télémétrie, aucun compte requis »](docs/screenshot-accueil.png)

## Ce que ça fait

| | |
|---|---|
| **Navigation privée** | DuckDuckGo par défaut, historique local minimal et désactivable, effacement à la fermeture, blocage optionnel des cookies tiers, aucune télémétrie |
| **Outils développeur** | DevTools de la page, effacement des données du site en un clic (cookies, cache, local/sessionStorage), capture pleine page, modes bureau/tablette/mobile, panneau d'informations (URL, titre, domaine, HTTPS, user-agent) |
| **Audit rapide** | titre, meta description, présence de H1, HTTPS, images sans `alt`, liens externes, verdict global |
| **Mode lecture** | extraction propre, trois thèmes, taille et largeur réglables, temps de lecture, export Markdown, impression PDF |
| **IA locale facultative** | modèle léger local, backend Ollama optionnel, ou votre propre clé API — le navigateur fonctionne entièrement sans IA |
| **Onion Search** | recherche via l'index public Ahmia, avec passage de relais au Tor Browser |
| **Mise à jour** | via GitHub Releases (electron-updater) |

## Les adresses .onion ne s'ouvrent pas ici

Un navigateur Chromium ordinaire, mis face à une adresse en `.onion`, tente de la résoudre
par le DNS habituel. Le service caché reste évidemment inaccessible, mais la requête, elle,
est partie en clair vers votre résolveur, puis vers votre opérateur : la seule chose que
l'opération a réussie, c'est de signaler ce que vous cherchiez.

Ce navigateur ne fait donc jamais cette tentative. Une adresse `.onion` saisie dans la
barre affiche un avertissement, et propose la seule option correcte : passer la main au
Tor Browser s'il est installé sur la machine. Le panneau Onion Search, lui, interroge
l'index **public** d'Ahmia en HTTPS ordinaire — c'est une page web classique, pas un accès
au réseau Tor.

## Durcissement Electron

`contextIsolation: true` · `nodeIntegration: false` · `sandbox: true` · un preload minimal
exposant une seule API étroite (`window.kdl`) · pages web isolées dans un `<webview>` ·
ouverture de fenêtre externe redirigée vers le navigateur système via
`setWindowOpenHandler` · caméra, micro, géolocalisation et notifications refusés par
défaut · CSP stricte sur l'interface.

Aucune page visitée ne peut exécuter de code hors de son bac à sable, ni atteindre le
système de fichiers.

## Ce que ça ne fait pas

- **Ce n'est pas un navigateur anonyme.** Il ne route rien par Tor, ne masque pas votre
  adresse IP et ne remplace pas le Tor Browser. Il évite le pistage commercial, pas la
  surveillance ciblée.
- **Ce n'est pas Lighthouse.** L'audit de page vérifie une poignée de points utiles au
  quotidien, pas les performances ni l'accessibilité complète.
- **L'IA n'est pas installée d'office.** Aucun modèle n'est téléchargé sans action de votre
  part, Ollama n'est jamais installé automatiquement, et une clé API que vous fournissez
  reste stockée localement. Le panneau IA ne voit ni vos mots de passe, ni vos cookies, ni
  vos autres onglets, et demande confirmation avant tout envoi distant.
- **Il ne transmet rien.** Pas de compte, pas d'analytics, pas d'appel maison.

## Construire les paquets

```bash
npm run dist:linux   # AppImage + .deb
npm run dist:win     # NSIS + portable
npm run dist:mac     # dmg
npm run audit:secrets  # vérifie qu'aucun secret ne traîne dans les sources
```

Sous Linux, si le bac à sable Electron pose problème (Mint sans `chrome-sandbox` setuid) :
`npm start -- --no-sandbox`. À éviter en usage normal.

## Prérequis

Node.js 18 ou plus pour le développement. Linux, Windows et macOS pour l'usage.

## Marques citées

DuckDuckGo, Tor Browser et Ahmia sont mentionnés pour ce qu'ils sont. KDL Privacy Dev
Browser **n'est affilié ni à DuckDuckGo, ni au Tor Project, ni à Ahmia**, et n'utilise
aucun de leurs logos.

## Licence

MIT — voir [LICENSE](LICENSE).

---

**KDL TECH** — dépannage informatique, développement et outils logiciels.
[kdl-tech.fr](https://kdl-tech.fr)

---

**Éditeur** — KDL TECH, nom commercial de Karim Laurent De Lucia, entrepreneur individuel · SIRET 423 471 481 00022 · APE 95.11Z · LD Caraque, Rue Narcisse Louis, 97139 Les Abymes, Guadeloupe · [contact@kdl-tech.fr](mailto:contact@kdl-tech.fr) · [kdl-tech.fr](https://kdl-tech.fr)
