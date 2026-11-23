#!/bin/bash
# R2B_SUBS_MORE (2026-11-23): read Vibe product pages with headless Chromium (curl gets 403), one page per launch, 6 s apart.
# Usage: vibe_pages.sh slugs.txt -> references/raw/car_subs/vibe/<slug>.txt
source /workspace/.playwright/env.sh; O=/workspace/references/raw/car_subs/vibe
while read -r s; do [ -z "$s" ] && continue; [ -s "$O/$s.txt" ] && continue; sleep 6
  timeout -k 5 90 node /workspace/scripts/car_subs/browser_page.mjs "https://vibeaudio.co.uk/product/$s/" "$O/$s.txt" | sed "s/^/$s: /"
  pgrep -P $$ -f chrome >/dev/null && { echo "own browser still live: stop"; exit 1; }  # own children only (other agents may run browsers)
done < "$1"
