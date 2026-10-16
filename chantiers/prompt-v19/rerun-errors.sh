#!/bin/bash
# Relance seuls les cas en erreur (429/503) d'un dossier de résultats et fusionne. Usage : rerun-errors.sh <dossier> <cible> [module prompt]
export PATH=~/.local/node/bin:$PATH OLLAMA_HOST=http://127.0.0.1:9
cd ~/dicta-ai
DIR=$1; TARGET=$2; PROMPT=$3; TAG=$(echo $TARGET | sed 's#[:/]#_#g'); DELAY=${DELAY:-6000}
for pass in 1 2; do
for f in $DIR/${TAG}__${VER:-}*.json; do
  case "$f" in *_rerun*) continue;; esac
  ids=$(python3 -c "import json;print(','.join(r['id'] for r in json.load(open('$f'))['rows'] if r.get('error')))")
  [ -z "$ids" ] && continue
  set=$(basename $f .json | sed -E 's/.*_standard_?//'); cases=${set:-cases}.jsonl; [ "$cases" = "cases.jsonl" ] || true
  mkdir -p $DIR/rerun
  node scripts/with-app-keys.mjs node --experimental-strip-types bench/run.ts $TARGET --level standard --cases $cases --delay $DELAY --only $ids --out $DIR/rerun ${PROMPT:+--prompt $PROMPT}
  python3 - "$f" $DIR/rerun/$(basename $f) <<'PY'
import json,sys
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2]))
nb={r['id']:r for r in b['rows'] if not r.get('error')}
a['rows']=[nb.get(r['id'],r) for r in a['rows']]
json.dump(a,open(sys.argv[1],'w'),ensure_ascii=False,indent=2)
print('fusion', sys.argv[1], len(nb), 'cas récupérés')
PY
done; done
