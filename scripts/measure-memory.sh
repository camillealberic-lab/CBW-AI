#!/bin/bash
# Mesure la mémoire (RSS) de CBW AI et de ses processus enfants (Electron, whisper-server, helpers),
# sur l'app DÉJÀ ouverte. Ne lance rien. Usage : bash scripts/measure-memory.sh
set -u
APP="CBW AI.app/Contents"
PIDS=$(pgrep -f "$APP" || true)
if [ -z "$PIDS" ]; then
  echo "CBW AI n'est pas ouverte : ouvre l'app, laisse-la au repos, puis relance ce script."
  exit 1
fi
# ps : pid, rss (Ko), commande ; on ne garde que les processus de l'app.
ps -o pid=,rss=,command= -p "$(echo "$PIDS" | paste -sd, -)" | awk '
{
  pid=$1; rss=$2; cmd=$0
  name="autre"
  if (cmd ~ /^ *[0-9]+ +[0-9]+ \/bin\/sh/) next
  if (cmd ~ /whisper-server/) name="whisper-server"
  else if (cmd ~ /--type=renderer/) name="Electron renderer"
  else if (cmd ~ /--type=gpu-process/) name="Electron GPU"
  else if (cmd ~ /--type=utility/) name="Electron utilitaire"
  else if (cmd ~ /MacOS\/CBW AI$/ || cmd ~ /MacOS\/CBW AI /) name="Electron principal"
  else if (cmd ~ /Resources\/bin\/dicta-/) name="helper natif"
  tot[name]+=rss; n[name]++; all+=rss; cnt++
}
END {
  for (k in tot) printf "%-22s %2d proc.  %7.0f Mo\n", k, n[k], tot[k]/1024
  printf "~TOTAL (RSS)           %2d proc.  %7.0f Mo\n", cnt, all/1024
}' | sort | sed 's/^~//'
echo "(RSS compte les pages partagées plus d'une fois : le total est un majorant. Mesure au repos, hors dictée.)"
