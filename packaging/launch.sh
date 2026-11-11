#!/usr/bin/env bash
# Lanceur KDL Privacy Dev Browser (icône bureau).
cd "$(dirname "$0")/.." || exit 1
# Sandbox Electron : si chrome-sandbox n'est pas setuid root (cas Mint sans config),
# on lance avec --no-sandbox pour garantir le démarrage de l'icône.
SBX=""
[ ! -u node_modules/electron/dist/chrome-sandbox ] && SBX="--no-sandbox"
exec npm start -- $SBX
