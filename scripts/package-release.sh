#!/bin/bash
# Assets de release (CI et local) : DMG + ZIP de « CBW AI.app », vérifications de signature, latest.json.
# Prérequis : npm run build && npm run build:fnwatch && npm run icon (cf. npm run dist:release).
# Env : SKIP_DMG=1 (zip seul, test local) · REPO=owner/repo · NOTES_FILE=notes.md · ASSET_BASE=URL des assets
# Sortie : dist-app/release/{CBW-AI-arm64.dmg, CBW-AI-<v>-arm64.dmg, CBW-AI-<v>-arm64.zip, latest.json}
set -euo pipefail
cd "$(dirname "$0")/.."
V=$(node -p "require('./package.json').version")
NAME="CBW AI"
APP="dist-app/mac-arm64/$NAME.app"
OUT=dist-app/release
export CSC_IDENTITY_AUTO_DISCOVERY=false

if [ "${SKIP_DMG:-}" = 1 ]; then T=dir; else T=dmg; fi
rm -rf "dist-app/mac-arm64"
# after-pack.cjs : contrôle minos + signature ad hoc + exigence désignée stable
npx electron-builder --mac "$T" --arm64 --publish never

check_app() { # $1 = bundle
  codesign --verify --deep --strict "$1"
  codesign -d -r- "$1" 2>&1 | grep -q 'designated => identifier "com.dicta-ai.app"' \
    || { echo "✗ exigence désignée inattendue : $(codesign -d -r- "$1" 2>&1 | tail -1)"; exit 1; }
  local id ver
  id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Contents/Info.plist")
  ver=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$1/Contents/Info.plist")
  [ "$id" = com.dicta-ai.app ] || { echo "✗ bundle id $id"; exit 1; }
  [ "$ver" = "$V" ] || { echo "✗ version du bundle $ver ≠ $V"; exit 1; }
  for b in "$1/Contents/Resources/bin/"*; do
    vtool -show-build "$b" | grep -q 'minos 14.0' || { echo "✗ $(basename "$b") n'est pas compilé pour macOS 14"; exit 1; }
  done
}
check_app "$APP"
echo "✓ signature ad hoc + DR identifier \"com.dicta-ai.app\" + bundle id + version $V"

rm -rf "$OUT" && mkdir -p "$OUT"
ZIP="$OUT/CBW-AI-$V-arm64.zip"
# ditto préserve liens symboliques, attributs étendus et signatures (le zip d'electron-builder pas toujours)
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
TMP=$(mktemp -d)
ditto -x -k "$ZIP" "$TMP"
check_app "$TMP/$NAME.app"
rm -rf "$TMP"
echo "✓ zip vérifié (décompressé + codesign)"

if [ "$T" = dmg ]; then
  cp "dist-app/$NAME-$V-arm64.dmg" "$OUT/CBW-AI-$V-arm64.dmg"
  cp "dist-app/$NAME-$V-arm64.dmg" "$OUT/CBW-AI-arm64.dmg"
  hdiutil verify "$OUT/CBW-AI-arm64.dmg" >/dev/null
fi
node scripts/release-manifest.mjs "$OUT"
ls -la "$OUT"
