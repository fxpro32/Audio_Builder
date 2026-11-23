#!/bin/bash
# P1_PUBLIC_DATA: start a test server on port 8421 on a data copy (never 8420, never the real data), check the overlay answers
# (parts prices, boards supplier / generic, driver library prices and VIBE), stop the server.
# Usage: api_check.sh <appDir with dist+server> <dataCopy> <label>
APP="$1"; DC="$2"; L="$3"
PORT=8421 AB_DATA_DIR="$DC" node "$APP/server/server.mjs" > "$DC/../server_$L.log" 2>&1 & SPID=$!
for i in $(seq 1 40); do curl -s 127.0.0.1:8421/api/health >/dev/null && break; sleep 0.25; done
echo "== $L (server pid $SPID, data $(curl -s 127.0.0.1:8421/api/health | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"])'))"
curl -s 127.0.0.1:8421/api/parts/amplifiers | python3 -c 'import json,sys;d=json.load(sys.stdin);r=d["records"];print("parts/amplifiers:",len(r),"records,",sum(1 for x in r if x["n"].get("priceAud")),"with priceAud; brands",len(d["brands"]))'
curl -s 127.0.0.1:8421/api/parts | python3 -c 'import json,sys;d=json.load(sys.stdin);print("parts index total:",sum(c["count"] for c in d["categories"]),"withAudPrice",sum(c["withAudPrice"] for c in d["categories"]))'
for b in boards boards/plywood; do curl -s 127.0.0.1:8421/api/$b | python3 -c 'import json,sys,collections;d=json.load(sys.stdin);s=d["sheets"];print("'$b':",len(s),"sheets, suppliers",dict(collections.Counter(x["supplier"] for x in s)),", priced",sum(1 for x in s if x.get("priceAud")))'; done
curl -s 127.0.0.1:8421/api/drivers | python3 -c 'import json,sys,collections;d=json.load(sys.stdin);c=collections.Counter(x.get("library","own") for x in d);print("drivers:",len(d),dict(c),"; with priceAud",sum(1 for x in d if x.get("priceAud")),"; VIBE",sum(1 for x in d if "vibe" in str(x.get("brand","")).lower()))'
kill $SPID; wait $SPID 2>/dev/null; echo "server $SPID stopped"
