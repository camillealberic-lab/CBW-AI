#!/bin/bash
# Installe dist-app/mac-arm64/CBW AI.app dans /Applications, l'épingle dans le Dock et l'ouvre.
# Remplace l'ancienne « Dicta AI.app » (même identifiant com.dicta-ai.app → autorisations conservées).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="CBW AI"
SRC="dist-app/mac-arm64/$NAME.app"
DEST="/Applications/$NAME.app"
OLD="/Applications/Dicta AI.app"
[ -d "$SRC" ] || { echo "✗ $SRC introuvable (lancez npm run dist)"; exit 1; }

# Build local : retire la mise à jour en attente, sinon l'updater l'installe à la fermeture par-dessus ce build
UPD="${DICTA_AI_HOME:-$HOME/.dicta-ai}/updates"
rm -rf "$UPD"/*-app 2>/dev/null || true

# Quitte les instances en cours (nouveau et ancien nom)
for APP in "$DEST" "$OLD"; do
  if pgrep -f "$APP/Contents/MacOS/" >/dev/null 2>&1; then
    osascript -e "quit app \"$(basename "$APP" .app)\"" || true
    for _ in $(seq 1 20); do pgrep -f "$APP/Contents/MacOS/" >/dev/null 2>&1 || break; sleep 0.5; done
    pkill -f "$APP/Contents/MacOS/" 2>/dev/null || true
  fi
done

# attend une installation de mise à jour déjà lancée (script détaché de l'updater)
for _ in $(seq 1 60); do pgrep -f "$UPD/install.sh" >/dev/null 2>&1 || break; sleep 0.5; done
rm -rf "$DEST" "$OLD"
ditto "$SRC" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo "✓ installé : $DEST"

# Dock : retire l'ancienne tuile « Dicta AI », épingle « CBW AI » (permanent)
python3 - <<'PY'
import plistlib, subprocess
raw = subprocess.run(['defaults', 'export', 'com.apple.dock', '-'], capture_output=True, check=True).stdout
dock = plistlib.loads(raw)
apps = dock.get('persistent-apps', [])
url = lambda t: t.get('tile-data', {}).get('file-data', {}).get('_CFURLString', '')
kept = [t for t in apps if 'Dicta%20AI.app' not in url(t)]
changed = len(kept) != len(apps)
if not any('CBW%20AI.app' in url(t) for t in kept):
    kept.append({'tile-data': {'file-data': {'_CFURLString': 'file:///Applications/CBW%20AI.app/', '_CFURLStringType': 15}}})
    changed = True
if changed:
    dock['persistent-apps'] = kept
    subprocess.run(['defaults', 'import', 'com.apple.dock', '-'], input=plistlib.dumps(dock), check=True)
    subprocess.run(['killall', 'Dock'])
    print('✓ Dock mis à jour (CBW AI)')
else:
    print('· déjà dans le Dock')
PY

open "$DEST"
