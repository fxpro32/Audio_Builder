#!/usr/bin/env python3
"""R3: validate data/parts_raw files: schema keys, unique ids, every record has a source URL + read_date, prices well formed, no NaN."""
import json, glob, math, sys
bad = 0; n = 0
for f in sorted(glob.glob("/workspace/data/parts_raw/*/*.json")):
    if "/_" in f: continue
    d = json.load(open(f)); ids = set()
    for k in ("schema", "category", "brand", "read_date", "agent", "method", "records"):
        if k not in d: print("missing", k, f); bad += 1
    for r in d["records"]:
        n += 1
        if r["id"] in ids: print("dup id", r["id"], f); bad += 1
        ids.add(r["id"])
        if not r.get("sources") or not all(s.get("url", "").startswith("http") and s.get("read_date") for s in r["sources"]): print("no source", r["id"], f); bad += 1
        for p in r.get("prices_aud", []):
            if not (isinstance(p.get("price_aud"), (int, float)) and p["price_aud"] > 0 and p.get("url")): print("bad price", r["id"], f); bad += 1
        txt = json.dumps(r)
        import re
        if re.search(r"[:\[,]\s*(NaN|-?Infinity)\b", txt): print("nan", r["id"], f); bad += 1
print(f"records {n}, problems {bad}"); sys.exit(1 if bad else 0)
