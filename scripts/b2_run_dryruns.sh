#!/bin/bash
# B2_SECTIONS: run headless dry runs one after another, each on its own fresh data copy and its own test server (port 8421).
# Usage: b2_run_dryruns.sh <scratchRoot with app/dist + app/server> <outRoot> name1 name2 ...  (name = ui_dryrun_<name>.mjs)
SCR="$1"; OUT="$2"; shift 2
source /workspace/.playwright/env.sh
live() { ps -eo stat=,args= | awk '$1!~/^Z/ && /chrom/ && !/--type=/ && !/awk/' | wc -l; }
for n in "$@"; do
  until /workspace/scripts/resource_guard.sh check 600 >/dev/null; do /workspace/scripts/resource_guard.sh wait; done
  DC="$SCR/data_$n"; /workspace/scripts/b2_make_datacopy.sh "$DC" >/dev/null
  PORT=8421 AB_DATA_DIR="$DC" node "$SCR/app/server/server.mjs" > "$SCR/server_$n.log" 2>&1 & SPID=$!
  for i in $(seq 1 20); do curl -s 127.0.0.1:8421/api/health >/dev/null && break; sleep 0.3; done
  echo "== $n (browsers before: $(live))"
  PORT=8421 timeout -k 5 90 node /workspace/scripts/ui_dryrun_$n.mjs "$OUT/$n" "$DC" 2>&1 | grep -E "^(FAIL|DONE)|passed|REFUSED|Error" | head -20
  kill $SPID; wait $SPID 2>/dev/null
  echo "   browsers after: $(live)"
done
