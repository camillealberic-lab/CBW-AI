#!/bin/bash
cd ~/dicta-ai
while pgrep -f "prompt-v19/after.sh" >/dev/null; do sleep 10; done
chantiers/prompt-v19/rerun-errors.sh chantiers/prompt-v19/baseline gemini:gemini-3.5-flash-lite src/llm/prompt.v18.bench.ts
chantiers/prompt-v19/rerun-errors.sh chantiers/prompt-v19/apres gemini:gemini-3.5-flash-lite
