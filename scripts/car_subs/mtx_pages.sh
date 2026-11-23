#!/bin/bash
# R2B_SUBS_MORE (2026-11-23): MTX product pages in headless Chromium (one page per launch, 6 s apart; curl gets Cloudflare 403 on pages),
# then the linked '<model>_tech_data_sheet.pdf' with curl (answers 200), 3 s apart. Usage: mtx_pages.sh slugs.txt
source /workspace/.playwright/env.sh; O=/workspace/references/raw/car_subs/mtx
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
while read -r s; do [ -z "$s" ] && continue
  [ -s "$O/$s.txt" ] || { sleep 6; timeout -k 5 90 node /workspace/scripts/car_subs/browser_page.mjs "https://www.mtx.com/$s" "$O/$s.txt" | sed "s/^/$s: /"; }
  u=$(grep -m1 -o -i 'https://www.mtx.com/f/[0-9]*/[^ ]*tech[^ ]*\.pdf' "$O/$s.txt")
  [ -z "$u" ] && { echo "$s: no tech data sheet link"; continue; }
  n=${u##*/}; n=${n//%20/_}; n=$(echo "$n" | sed "s/_Tech_Data_Sheet/_tech_data_sheet/"); [ -s "$O/$n" ] && continue; sleep 3
  curl -s -m 60 -A "$UA" -o "$O/$n" -w "$n %{http_code} %{size_download}\n" "$u"
  node /workspace/scripts/pdf_text.mjs "$O/$n" > "$O/${n%.pdf}.txt" 2>/dev/null
done < "$1"
