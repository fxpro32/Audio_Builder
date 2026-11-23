#!/bin/bash
# Polite PDF reader for agent A3 (2026-11-21): downloads each listed maker PDF (3 s apart) into PDFDIR
# (gitignored local reference copy) and writes its text to TXTDIR. Usage: hp_pdf_batch.sh URLLIST PDFDIR TXTDIR
list="$1"; pdir="$2"; tdir="$3"; mkdir -p "$pdir" "$tdir"; i=0
while read -r u; do
  [ -z "$u" ] && continue; i=$((i+1)); f=$(basename "${u%%\?*}")
  [ -s "$tdir/$f.txt" ] && { echo "$i $f (cached)"; continue; }
  python3 -I /workspace/scripts/hp_fetch.py "$u" --pdf "$pdir/$f" > "$tdir/$f.txt" 2>&1
  echo "$i $f $(wc -c < "$pdir/$f" 2>/dev/null) bytes, $(grep -c . "$tdir/$f.txt") text lines"
done < "$list"
echo BATCH_DONE
