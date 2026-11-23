#!/usr/bin/env bash
# A2: fetch DS18 owner's manuals (maker CDN, URL pattern seen in search results) for qualifying SKUs, 3 s apart; first pattern that returns a PDF wins.
cd /workspace/references/raw/hp_subs/us/ds18 || exit 1
for sku in "$@"; do
  [ -s "man_$sku.pdf" ] && continue
  for pat in "${sku}_SPANGLISH_MANUAL_WEB_V1" "${sku}_SPANGLISH_MANUAL_WEB_V2" "${sku}_SPANGLISH_MANUAL_WEB_V3" "${sku}_MANUAL_WEB" "${sku}_SPANGLISH_MANUAL_WEB" "${sku}_WEB_MANUAL_SPANGLISH_2021" "${sku}_SPL_WEB_MANUAL_SPANGLISH_2021"; do
    sleep 3
    code=$(curl -s -m 40 -A "Mozilla/5.0" -o "man_$sku.pdf" -w "%{http_code} %{content_type}" "https://ds18.com/cdn/shop/files/$pat.pdf")
    if [[ "$code" == 200*pdf* ]]; then echo "$sku OK $pat"; echo "$sku https://ds18.com/cdn/shop/files/$pat.pdf" >> manual_urls.txt; break; else rm -f "man_$sku.pdf"; fi
  done
  [ -s "man_$sku.pdf" ] || echo "$sku NOT FOUND"
done
