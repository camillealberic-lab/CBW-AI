#!/bin/bash
# Génère build/icon.icns à partir de assets/icon.png (1024², squircle 824 px centré — grille Apple).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=assets/icon.png
OUT=build/icon.icns
[ -f "$OUT" ] && [ "$OUT" -nt "$SRC" ] && exit 0
TMP=$(mktemp -d)/icon.iconset
mkdir -p "$TMP" build
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$TMP/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) "$SRC" --out "$TMP/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$TMP" -o "$OUT"
echo "✓ $OUT"
