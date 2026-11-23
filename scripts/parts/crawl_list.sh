#!/bin/bash
# R3: fetch a list of URLs (one per line in $2) into folder $1 as p_<last path part>.html, 3 s apart; skips existing files.
D=$1; L=$2; mkdir -p "$D"
while read u; do [ -z "$u" ] && continue; n=$(echo "$u" | sed 's:/*$::' | awk -F/ '{print $NF}'); [ -s "$D/p_$n.html" ] || /workspace/scripts/parts/fetch.sh "$u" "$D/p_$n.html" 3; done < "$L"
echo "CRAWL_DONE $D"
