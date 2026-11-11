#!/usr/bin/env bash
# Installe le lanceur de bureau (dev) en pointant vers ce dépôt, où qu il soit.
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
mkdir -p "$DEST"
sed "s#@APP_DIR@#${APP_DIR//#/\\#}#g" "$APP_DIR/packaging/kdl-privacy-dev-browser.desktop" > "$DEST/kdl-privacy-dev-browser.desktop"
echo "Lanceur installé : $DEST/kdl-privacy-dev-browser.desktop"
