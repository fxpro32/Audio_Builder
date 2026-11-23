#!/bin/bash
# R2_SUBS_ALL: fetch pages as plain text with scripts/hp_fetch.py (3 s pause inside), one at a time, same text format A3 used.
# Usage: fetch_text_list.sh <outdir> <base_url_prefix> <slugfile>   (saves <outdir>/<slug>.txt; skips existing)
OUT=$1; BASE=$2; LIST=$3; mkdir -p "$OUT"
while read -r s; do [ -z "$s" ] && continue; n=${s##*/}; [ -s "$OUT/$n.txt" ] && continue
  python3 -I /workspace/scripts/hp_fetch.py "$BASE$s/" --max 200000 > "$OUT/$n.txt"; echo "$n $(wc -c < "$OUT/$n.txt")"; done < "$LIST"
