#!/bin/bash
# R1_IB: save one public page (html or pdf) + extracted text into references/raw/ib_door_home/<name>.*; 3 s pause after.
# Usage: save_page.sh <name> <url>
set -u; R=/workspace/references/raw/ib_door_home; n=$1; u=$2
code=$(curl -sL -m 40 -A "Mozilla/5.0 (X11; Linux x86_64)" -o "$R/$n.raw" -w "%{http_code}" "$u")
if head -c 5 "$R/$n.raw" | grep -q '%PDF'; then mv "$R/$n.raw" "$R/$n.pdf"; node /workspace/scripts/pdf_text.mjs "$R/$n.pdf" "$R/$n.txt" >/dev/null 2>&1
else mv "$R/$n.raw" "$R/$n.html"; python3 -I -c "
import sys,re,html
t=open(sys.argv[1],errors='ignore').read()
t=re.sub(r'(?is)<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>','',t)
t=re.sub(r'(?i)<(br|p|div|li|h[1-6]|tr)[^>]*>','\n',t)
t=html.unescape(re.sub(r'<[^>]+>',' ',t)); t=re.sub(r'[ \t]+',' ',t); t=re.sub(r'\n\s*\n+','\n',t)
open(sys.argv[2],'w').write('source: '+sys.argv[3]+'\nfetched: 2026-11-23\n\n'+t)" "$R/$n.html" "$R/$n.txt" "$u"; fi
echo "$code $n $(wc -c < $R/$n.txt 2>/dev/null) $u"; sleep 3
