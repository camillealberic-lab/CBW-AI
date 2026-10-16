#!/bin/bash
# Attend la fin de la mesure v1.8, installe la v1.9 et mesure les 4 jeux.
cd ~/dicta-ai
while pgrep -f "run-gemini.sh ./chantiers/prompt-v19/baseline" >/dev/null; do sleep 10; done
cp src/llm/prompt.v19.draft.ts src/llm/prompt.ts && rm src/llm/prompt.v19.draft.ts
mkdir -p chantiers/prompt-v19/apres
chantiers/prompt-v19/run-gemini.sh ./chantiers/prompt-v19/apres > chantiers/prompt-v19/apres/gemini.log 2>&1
