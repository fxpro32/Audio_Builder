#!/bin/bash
# R2B_SUBS_MORE (2026-11-23): one slow retry of Shopify stores that answered HTTP 429 to R2.
# Usage: shopify_retry.sh <domain> <outdir> [maxpages] [delay_s]. Full browser user agent, products.json pages of 250,
# delay (default 20 s) before every request; any non-200 answer = stop for that store (no further retries).
set -u
DOM=$1; OUT=$2; MAX=${3:-8}; D=${4:-20}; mkdir -p "$OUT"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
for p in $(seq 1 "$MAX"); do
  f="$OUT/products_$p.json"
  if [ ! -s "$f" ]; then
    sleep "$D"
    code=$(curl -s -m 60 --compressed -A "$UA" -H 'Accept: application/json,text/html;q=0.9,*/*;q=0.8' -H 'Accept-Language: en-US,en;q=0.9' \
      -o "$f" -w "%{http_code}" "https://$DOM/products.json?limit=250&page=$p")
    echo "$(date +%H:%M:%S) $DOM page $p HTTP $code $(stat -c %s "$f")"
    if [ "$code" != "200" ]; then mv "$f" "$f.err$(date +%s)"; echo "STOP $DOM (HTTP $code)"; break; fi
  fi
  n=$(python3 -I -c "import json,sys;print(len(json.load(open(sys.argv[1]))['products']))" "$f" 2>/dev/null || echo 0)
  [ "$n" -lt 250 ] && break
done
