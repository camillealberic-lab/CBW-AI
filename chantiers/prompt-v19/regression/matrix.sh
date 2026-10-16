#!/bin/bash
R=~/dicta-ai/chantiers/prompt-v19/regression
for M in openai/gpt-oss-20b openai/gpt-oss-120b; do for T in v19 v18 v110; do $R/run.sh $M cases-oral-long.jsonl $T; done; done
for M in qwen/qwen3.8-27b openai/gpt-oss-120b; do for C in cases-forme.jsonl cases-fidelite.jsonl; do for T in v19 v18 v110; do $R/run.sh $M $C $T; done; done; done
echo MATRIX_DONE
