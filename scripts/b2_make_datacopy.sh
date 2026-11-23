#!/bin/bash
# B2_SECTIONS: fresh copy of data/ for a headless dry run (research raw folders left out). Usage: b2_make_datacopy.sh <dest>
set -e; DEST="$1"; [ -n "$DEST" ] || { echo "usage: $0 <dest>"; exit 2; }
rm -rf "$DEST"; mkdir -p "$DEST"
for x in /workspace/data/*; do b=$(basename "$x"); case "$b" in car_subs_raw|car_drivers_raw|parts_raw|hp_subs_raw|source_dbs) ;; *) cp -r "$x" "$DEST/";; esac; done
echo "data copy at $DEST"
