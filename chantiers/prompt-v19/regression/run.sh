#!/bin/bash
# usage : run.sh <modèle groq> <cases> <tag v18|v19|v110> [délai ms]
export PATH=~/.local/node/bin:$PATH OLLAMA_HOST=http://127.0.0.1:9 NODE_NO_WARNINGS=1
cd ~/dicta-ai
M=$1; C=$2; TAG=$3; D=${4:-15000}
case $TAG in
  v18) P="--prompt bench/prompt.v18.bench.ts";;
  v19) P="--prompt bench/prompt.v19.bench.ts";;
  *) P="";;
esac
node scripts/with-app-keys.mjs node --experimental-strip-types bench/run.ts groq:$M --level standard --cases $C --delay $D $P --out chantiers/prompt-v19/regression/$TAG
