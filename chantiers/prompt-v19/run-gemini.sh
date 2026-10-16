#!/bin/bash
# Usage : run-gemini.sh <dossier-sortie>  — 4 jeux, Gemini flash-lite, standard, délai 6 s
export PATH=~/.local/node/bin:$PATH OLLAMA_HOST=http://127.0.0.1:9
cd ~/dicta-ai
for c in cases.jsonl cases-forme.jsonl cases-fidelite.jsonl cases-contexte.jsonl; do
  node scripts/with-app-keys.mjs node --experimental-strip-types bench/run.ts gemini:gemini-3.5-flash-lite --level standard --cases $c --delay 6000 --out "$1"
done
