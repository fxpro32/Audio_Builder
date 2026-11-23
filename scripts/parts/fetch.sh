#!/bin/bash
# R3: polite single fetch (browser UA), raw copy kept. Usage: fetch.sh URL OUTFILE [delay_s=3]
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
mkdir -p "$(dirname "$2")"
c=$(curl -s -L -m 60 --compressed -A "$UA" -H 'Accept-Language: en-AU,en;q=0.9' -o "$2" -w "%{http_code}" "$1")
echo "HTTP $c $(stat -c %s "$2" 2>/dev/null) $1"
sleep "${3:-3}"
