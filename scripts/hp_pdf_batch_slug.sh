#!/bin/bash
# Like hp_pdf_batch.sh but names each file after the URL's parent folder (for sites whose PDFs are all called manual.pdf).
list="$1"; pdir="$2"; tdir="$3"; mkdir -p "$pdir" "$tdir"; i=0
while read -r u; do
  [ -z "$u" ] && continue; i=$((i+1)); f="$(basename "$(dirname "$u")")_$(basename "${u%%\?*}")"
  [ -s "$tdir/$f.txt" ] && { echo "$i $f (cached)"; continue; }
  python3 -I /workspace/scripts/hp_fetch.py "$u" --pdf "$pdir/$f" > "$tdir/$f.txt" 2>&1
  echo "$i $f $(wc -c < "$pdir/$f" 2>/dev/null) bytes"
done < "$list"
echo BATCH_DONE
