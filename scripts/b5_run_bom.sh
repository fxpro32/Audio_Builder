#!/bin/bash
# B5_BOM: build the app into a scratch folder and run scripts/ui_dryrun_bom.mjs phase by phase (one browser launch each, under
# timeout -k 5 90) on ONE fresh data copy and ONE test server on port 8421 (never 8420, never the real data).
# Usage: b5_run_bom.sh <scratchRoot> <outDir> [phases...]   default: smoke main old
SCR="$1"; OUT="$2"; shift 2
PH="${*:-smoke main old}"
source /workspace/.playwright/env.sh
live() { ps -eo stat=,args= | awk '$1!~/^Z/ && /chrom/ && !/--type=/ && !/awk/' | wc -l; }
mkdir -p "$SCR/app" "$OUT"
if [ ! -f "$SCR/app/dist/index.html" ] || [ -n "$REBUILD" ]; then
  until /workspace/scripts/resource_guard.sh check 1000 >/dev/null; do /workspace/scripts/resource_guard.sh wait; done
  (cd /workspace/app && npx vite build --outDir "$SCR/app/dist" --emptyOutDir >/dev/null 2>&1) || { echo "build failed"; exit 1; }
  rm -rf "$SCR/app/server"; cp -r /workspace/app/server "$SCR/app/server"
fi
DC="$SCR/data_copy_bom"; rm -rf "$DC"; /workspace/scripts/b2_make_datacopy.sh "$DC" >/dev/null
PORT=8421 AB_DATA_DIR="$DC" node "$SCR/app/server/server.mjs" > "$SCR/server_bom.log" 2>&1 & SPID=$!
for i in $(seq 1 30); do curl -s 127.0.0.1:8421/api/health >/dev/null && break; sleep 0.3; done
for ph in $PH; do
  until /workspace/scripts/resource_guard.sh check 600 >/dev/null; do /workspace/scripts/resource_guard.sh wait; done
  echo "== $ph (browsers before: $(live))"
  PORT=8421 timeout -k 5 90 node /workspace/scripts/ui_dryrun_bom.mjs "$OUT" "$DC" --phase "$ph" 2>&1 | grep -E "^(FAIL|DONE)|REFUSED|Error" | head -30
  echo "   browsers after: $(live)"
done
kill $SPID; wait $SPID 2>/dev/null
echo "server stopped"
