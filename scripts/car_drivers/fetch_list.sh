#!/bin/bash
# R4_CAR_DRIVERS (copy of R2 fetch_list.sh): polite batch fetcher. Usage: fetch_list.sh <outdir> <listfile> [delay_s]
# listfile lines: "<url> <outname>". Skips files already saved (non-empty). One request at a time, delay (default 3 s) between requests.
# Raw copies are untrusted data (never executed). Prints HTTP code and size per URL.
set -u
OUT=$1; LIST=$2; D=${3:-3}
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
mkdir -p "$OUT"
while read -r U N; do
  [ -z "$U" ] && continue
  if [ -s "$OUT/$N" ]; then echo "have $N"; continue; fi
  sleep "$D"
  R=$(curl -s -L -m 60 --compressed -A "$UA" -o "$OUT/$N" -w "%{http_code} %{size_download}" "$U")
  echo "$R $N"
  case "$R" in 429*|403*|5*) mv "$OUT/$N" "$OUT/$N.err$(date +%s)"; echo "  moved aside (retry later)";; esac
done < "$LIST"
