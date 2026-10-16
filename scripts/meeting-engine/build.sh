#!/bin/bash
# Compile dicta-meeting (FluidAudio) -> vendor/bin/dicta-meeting. Même SDK / cible (macOS 14) / signature ad hoc que scripts/build-fnwatch.sh.
# Appelé par build-fnwatch.sh (donc par `npm run dist:release`, `npm run dev` et la CI). Cache SwiftPM : scripts/meeting-engine/.build.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../vendor/bin/dicta-meeting
# à jour (plus récent que les sources et le Package) ET compilé pour macOS 14 → rien à faire
if [ -x "$OUT" ] && [ -z "$(find Sources Package.swift Package.resolved -newer "$OUT" 2>/dev/null)" ] && vtool -show-build "$OUT" | grep -q 'minos 14.0'; then
  exit 0
fi
SDK=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk
[ -d "$SDK" ] || SDK=$(xcrun --show-sdk-path)
swift build -c release --sdk "$SDK" --triple arm64-apple-macosx14.0
mkdir -p ../../vendor/bin
cp .build/release/dicta-meeting "$OUT"
codesign --force -s - "$OUT"
rm -rf ../../vendor/meeting-engine/dicta-meeting
echo "✓ vendor/bin/dicta-meeting ($(du -h "$OUT" | cut -f1))"
