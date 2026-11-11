# Distribution & édition hors ligne

## Édition standard (recommandée)
Application légère ; le modèle IA Lite est proposé au **premier usage** (téléchargement
volontaire), puis fonctionne hors ligne ; suppression possible depuis les paramètres.

## Future édition hors ligne complète
Modèle inclus dans l'installateur (plus volumineux), IA utilisable sans connexion, hash
du modèle + licence/attribution intégrés, aucune connexion nécessaire. À produire quand
la chaîne de build sera figée.

## Construire les installateurs (`electron-builder`)
Config dans `package.json` (`build`). Icône : `build/icon.png` (1024²).
```
npm install                 # récupère electron-builder
npm run dist:linux          # AppImage + .deb        (sur Linux)
npm run dist:win            # .exe (NSIS) + portable  (sur Windows, ou Linux+wine)
npm run dist:mac            # .dmg                    (sur macOS uniquement)
```
Sorties dans `dist/`. Installation Linux :
```
chmod +x KDL*.AppImage && ./KDL*.AppImage      # AppImage
sudo apt install ./kdl-privacy-dev-browser_*.deb  # Debian/Ubuntu/Mint
```

## Android (.apk) — hors périmètre
Electron est **desktop**. Un `.apk` n'est pas produisible depuis ce projet : une version
Android serait un **projet mobile séparé** (technologie différente). Non simulé ici.
