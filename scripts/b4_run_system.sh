#!/bin/bash
# B4_SYSTEM_UI: run the System dry run (scripts/ui_dryrun_system.mjs) phase by phase (one browser launch each, under
# timeout -k 5 90) on ONE fresh data copy and ONE test server on port 8421 (never 8420, never the real data).
# Usage: b4_run_system.sh <scratchRoot with app/dist + app/server> <outDir> [phases...]   default: smoke parts cables wire alert old
SCR="$1"; OUT="$2"; shift 2
PH="${*:-smoke parts cables wire alert old}"
source /workspace/.playwright/env.sh
live() { ps -eo stat=,args= | awk '$1!~/^Z/ && /chrom/ && !/--type=/ && !/awk/' | wc -l; }
DC="$SCR/data_system"; rm -rf "$DC"; /workspace/scripts/b2_make_datacopy.sh "$DC" >/dev/null
PORT=8421 AB_DATA_DIR="$DC" node "$SCR/app/server/server.mjs" > "$SCR/server_system.log" 2>&1 & SPID=$!
for i in $(seq 1 30); do curl -s 127.0.0.1:8421/api/health >/dev/null && break; sleep 0.3; done
for ph in $PH; do
  until /workspace/scripts/resource_guard.sh check 600 >/dev/null; do /workspace/scripts/resource_guard.sh wait; done
  echo "== $ph (browsers before: $(live))"
  PORT=8421 timeout -k 5 90 node /workspace/scripts/ui_dryrun_system.mjs "$OUT" "$DC" --phase "$ph" 2>&1 | grep -E "^(FAIL|DONE)|REFUSED|Error" | head -30
  echo "   browsers after: $(live)"
done
kill $SPID; wait $SPID 2>/dev/null
echo "server stopped"
