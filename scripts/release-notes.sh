#!/bin/bash
# Notes de version (Markdown) : message du tag annoté s'il existe, puis commits depuis la version précédente.
# Usage : scripts/release-notes.sh v1.0.42
set -euo pipefail
cd "$(dirname "$0")/.."
TAG="${1:?tag}"
git fetch --force --tags --quiet 2>/dev/null || true
MSG=""
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && [ "$(git cat-file -t "$TAG")" = tag ]; then
  MSG=$(git tag -l --format='%(contents)' "$TAG" | sed '/-----BEGIN PGP/,$d')
fi
PREV=$(git describe --tags --abbrev=0 --match 'v[0-9]*' "HEAD^" 2>/dev/null || true)
[ "$PREV" = "$TAG" ] && PREV=""
[ -n "$MSG" ] && printf '%s\n\n' "$MSG"
if [ -n "$PREV" ]; then
  echo "### Changements depuis $PREV"
  RANGE="$PREV..HEAD"
else
  echo "### Changements"
  RANGE="HEAD"
fi
git log --no-merges --format='- %s' "$RANGE" | grep -v -E '^- release v[0-9]' | head -60 || true
