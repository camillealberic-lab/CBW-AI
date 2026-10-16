#!/bin/bash
export PATH=~/.local/node/bin:$PATH OLLAMA_HOST=http://127.0.0.1:9
cd ~/dicta-ai
for c in cases-forme.jsonl cases-fidelite.jsonl; do
  node scripts/with-app-keys.mjs node --experimental-strip-types bench/run.ts groq:openai/gpt-oss-120b --level standard --cases $c --delay 20000 --out chantiers/prompt-v19/groq
done
VER=v1.8 DELAY=20000 chantiers/prompt-v19/rerun-errors.sh chantiers/prompt-v19/groq groq:openai/gpt-oss-120b src/llm/prompt.v18.bench.ts
VER=v1.9 DELAY=20000 chantiers/prompt-v19/rerun-errors.sh chantiers/prompt-v19/groq groq:openai/gpt-oss-120b
