#!/bin/bash
# R4B_DRIVERS_MORE: dump a Shopify store's public products.json (250 per page) politely: one request at a time, D s apart,
# browser user agent, stop at the first empty page or on 4xx/5xx. Usage: shopify_dump.sh <host> <outdir> [delay_s] [max_pages]
set -u
H=$1; OUT=$2; D=${3:-4}; MAX=${4:-20}
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
mkdir -p "$OUT"
for ((n=1; n<=MAX; n++)); do
  f="$OUT/products_$n.json"
  if [ ! -s "$f" ]; then
    sleep "$D"
    code=$(curl -s -L -m 60 --compressed -A "$UA" -o "$f" -w "%{http_code}" "https://$H/products.json?limit=250&page=$n")
    echo "$code $H page $n $(wc -c < "$f")"
    case "$code" in 4*|5*) mv "$f" "$f.err$(date +%s)"; echo "stop: HTTP $code"; break;; esac
  fi
  python3 -I -c "import json,sys; sys.exit(0 if json.load(open('$f')).get('products') else 1)" || { echo "stop: $H page $n empty"; rm -f "$f"; break; }
done
