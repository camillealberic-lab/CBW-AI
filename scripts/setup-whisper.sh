#!/usr/bin/env bash
# Dicta AI — build whisper.cpp (Metal) + télécharge un modèle.
# Usage : scripts/setup-whisper.sh [modele]
#   modele : large-v3-turbo-q5_0 (défaut) | small | base | medium | large-v3-turbo ...
# Env : WHISPER_REF=v1.9.5 (tag/branche à cloner, défaut : dernière version de master)
#       WHISPER_NO_MODEL=1 (CI : binaires seulement, pas de téléchargement de modèle)
set -euo pipefail

MODEL="${1:-large-v3-turbo-q5_0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR="$ROOT/vendor"
SRC="$VENDOR/whisper.cpp"
MODELS_DIR="$HOME/.dicta-ai/models"

# cmake : système, sinon pip --user
CMAKE="$(command -v cmake || true)"
if [ -z "$CMAKE" ]; then
  for c in "$HOME"/Library/Python/*/bin/cmake; do [ -x "$c" ] && CMAKE="$c"; done
fi
if [ -z "$CMAKE" ]; then
  echo "→ cmake absent, installation via pip --user"
  python3 -m pip install --user --quiet cmake
  for c in "$HOME"/Library/Python/*/bin/cmake; do [ -x "$c" ] && CMAKE="$c"; done
fi
[ -x "$CMAKE" ] || { echo "cmake introuvable"; exit 1; }
echo "→ cmake : $CMAKE"

# SDK : certaines installs CLT ont un SDK plus récent que le linker (erreur
# "tapi error: unknown architecture arm64e.x1"). On préfère le SDK MacOSX26.
if [ -z "${SDKROOT:-}" ]; then
  for s in MacOSX26.sdk MacOSX15.sdk; do
    d="/Library/Developer/CommandLineTools/SDKs/$s"
    [ -d "$d" ] && { export SDKROOT="$d"; break; }
  done
fi
echo "→ SDKROOT : ${SDKROOT:-défaut}"

mkdir -p "$VENDOR" "$MODELS_DIR"
if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 ${WHISPER_REF:+--branch "$WHISPER_REF"} https://github.com/ggml-org/whisper.cpp "$SRC"
fi

echo "→ build whisper.cpp (Metal, shaders embarqués)"
# -ffile-prefix-map : les chemins de compilation (__FILE__ des assertions) ne contiennent plus le dossier
# local (/Users/<nom>/…) dans les binaires distribués.
rm -rf "$SRC/build/CMakeCache.txt" "$SRC/build/CMakeFiles"
"$CMAKE" -S "$SRC" -B "$SRC/build" \
  ${SDKROOT:+-DCMAKE_OSX_SYSROOT="$SDKROOT"} \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON \
  -DCMAKE_C_FLAGS="-ffile-prefix-map=$SRC=whisper.cpp" -DCMAKE_CXX_FLAGS="-ffile-prefix-map=$SRC=whisper.cpp" -DCMAKE_OBJC_FLAGS="-ffile-prefix-map=$SRC=whisper.cpp" \
  -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON
"$CMAKE" --build "$SRC/build" --config Release -j "$(sysctl -n hw.ncpu)" --target whisper-cli whisper-server

BIN="$SRC/build/bin/whisper-cli"
[ -x "$BIN" ] || { echo "whisper-cli non produit"; exit 1; }
mkdir -p "$VENDOR/bin"
cp "$BIN" "$VENDOR/bin/whisper-cli"
[ -x "$SRC/build/bin/whisper-server" ] && cp "$SRC/build/bin/whisper-server" "$VENDOR/bin/whisper-server"
echo "→ binaire : $VENDOR/bin/whisper-cli"
[ "${WHISPER_NO_MODEL:-}" = 1 ] && { echo "OK (sans modèle)"; exit 0; }

FILE="$MODELS_DIR/ggml-$MODEL.bin"
if [ ! -s "$FILE" ]; then
  URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
  echo "→ téléchargement $URL"
  if [ -t 1 ]; then P=--progress-bar; else P=-sS; fi
  curl -L --fail $P -o "$FILE.part" "$URL"
  mv "$FILE.part" "$FILE"
fi
echo "→ modèle : $FILE ($(du -h "$FILE" | cut -f1))"
echo "OK"
