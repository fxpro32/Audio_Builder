#!/bin/bash
# Polite batch reader for agent A3 (2026-11-21): reads a list of individual product pages one at a time
# (hp_fetch.py waits 3 s before each), saves each page's text to OUTDIR, prints a line per page.
# Usage: hp_batch.sh URLLIST OUTDIR [GREP_REGEX_FOR_SUMMARY]
list="$1"; out="$2"; rx="${3:-RMS|Power}"
mkdir -p "$out"; i=0; n=$(wc -l < "$list")
while read -r u; do
  [ -z "$u" ] && continue; i=$((i+1)); s=$(basename "$u")
  [ -s "$out/$s.txt" ] && { echo "$i/$n $s (cached)"; continue; }
  python3 -I /workspace/scripts/hp_fetch.py "$u" > "$out/$s.txt" 2>&1
  echo "$i/$n $s :: $(grep -i -m2 -E "$rx" "$out/$s.txt" | tr '\n' ' ')"
done < "$list"
echo BATCH_DONE
