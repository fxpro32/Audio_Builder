#!/bin/bash
# R2_SUBS_ALL: save a Shopify store's public /products.json pages (250 per page) one at a time, D s apart (default 10).
# Usage: shopify_pages.sh <domain> <outdir> [maxpages] [delay]. Stops at a short page; 429 = stop (rate limited).
set -u
DOM=$1; OUT=$2; MAX=${3:-10}; D=${4:-10}; mkdir -p "$OUT"
for p in $(seq 1 "$MAX"); do
  f="$OUT/products_$p.json"
  if [ ! -s "$f" ]; then
    sleep "$D"
    code=$(curl -s -m 60 -A "Mozilla/5.0" -o "$f" -w "%{http_code}" "https://$DOM/products.json?limit=250&page=$p")
    echo "$DOM page $p HTTP $code $(stat -c %s "$f")"
    if [ "$code" != "200" ]; then mv "$f" "$f.err"; break; fi
  fi
  n=$(python3 -c "import json,sys;print(len(json.load(open('$f'))['products']))" 2>/dev/null || echo 0)
  [ "$n" -lt 250 ] && break
done
