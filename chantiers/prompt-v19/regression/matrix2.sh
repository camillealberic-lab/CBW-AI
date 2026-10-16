#!/bin/bash
R=~/dicta-ai/chantiers/prompt-v19/regression
for C in cases-forme.jsonl cases-fidelite.jsonl; do for T in v19 v18 v110; do $R/run.sh qwen/qwen3.8-27b $C $T; done; done
echo MATRIX_DONE
