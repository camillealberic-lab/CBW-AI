#!/bin/bash
# Compile le helper natif fn (scripts/fnwatch.swift → vendor/bin/dicta-fnwatch).
# SDK 26 forcé : le SDK 27 des CLT est trop récent pour le linker.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=vendor/bin/dicta-fnwatch
# à jour ET compatible macOS 14 (minimumSystemVersion de l'app) → rien à faire
SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk
[ -d "$SDK" ] || SDK=$(xcrun --show-sdk-path)
mkdir -p vendor/bin
if ! { [ -x "$OUT" ] && [ "$OUT" -nt scripts/fnwatch.swift ] && vtool -show-build "$OUT" | grep -q 'minos 14.0'; }; then
  swiftc -O -sdk "$SDK" -target arm64-apple-macos14.0 scripts/fnwatch.swift -o "$OUT"
  codesign --force -s - "$OUT"
  echo "✓ $OUT"
fi

# Helper plein écran (scripts/fullscreen.swift → vendor/bin/dicta-fullscreen), même SDK / cible.
FS=vendor/bin/dicta-fullscreen
if ! { [ -x "$FS" ] && [ "$FS" -nt scripts/fullscreen.swift ]; }; then
  swiftc -O -sdk "$SDK" -target arm64-apple-macos14.0 scripts/fullscreen.swift -o "$FS"
  codesign --force -s - "$FS"
  echo "✓ $FS"
fi
