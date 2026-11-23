#!/bin/bash
# R2B_SUBS_MORE (2026-11-23): for each Pioneer EU product slug: open the product page in headless Chromium (one page per launch),
# take its first user-manual link, then open that link in a new launch and save the PDF. 10 s between launches (robots Crawl-delay 10).
# Usage: pioneer_eu_manuals.sh slug1 slug2 ...   Output references/raw/car_subs/pioneer/eu_manuals/<slug>.pdf (+ page text in browser_r2b/).
source /workspace/.playwright/env.sh
O=/workspace/references/raw/car_subs/browser_r2b; M=/workspace/references/raw/car_subs/pioneer/eu_manuals
for s in "$@"; do
  [ -s "$M/$s.pdf" ] && { echo "have $s"; continue; }
  sleep 10; timeout -k 5 90 node /workspace/scripts/car_subs/browser_page.mjs "https://pioneer-car.eu/$s/$s" "$O/pioneer_eu_$s.txt"
  u=$(sed -n '/^LINKS:/,$p' "$O/pioneer_eu_$s.txt" | grep -m1 '/asset/user_manuals/')
  [ -z "$u" ] && { echo "$s: no user manual link"; continue; }
  sleep 10; timeout -k 5 90 node /workspace/scripts/car_subs/browser_download.mjs "$u" "$M/$s.pdf"; echo "$s <- $u"
  echo "$s $u" >> "$M/manual_urls.txt"
  n=$(ps -eo stat=,args= | awk '$1!~/^Z/ && /chrom/ && !/--type=/ && !/awk/' | wc -l); [ "$n" != 0 ] && { echo "live browsers $n: stop"; exit 1; }
done
