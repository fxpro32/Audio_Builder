#!/usr/bin/env python3
"""R3: counts per category and brand file in data/parts_raw (markdown), with tier and how many records have AUD prices."""
import json, glob, collections
rows = []; tot = collections.Counter(); totp = collections.Counter()
for f in sorted(glob.glob("/workspace/data/parts_raw/*/*.json")):
    if "/_" in f: continue
    d = json.load(open(f)); cat = d["category"]; b = f.split("/")[-1][:-5]; R = d["records"]
    tiers = sorted({s["tier"] for r in R for s in r.get("sources", [])})
    pa = sum(1 for r in R if r.get("prices_aud")); rows.append((cat, b, len(R), ",".join(tiers), pa)); tot[cat] += len(R); totp[cat] += pa
print("| Category | Brand file | Records | Source tier | With AUD price |"); print("|---|---|---|---|---|")
for r in rows: print("| %s | %s | %d | %s | %d |" % r)
print(); print("| Category | Records | With AUD price | Brand files |"); print("|---|---|---|---|")
for c in sorted(tot): print(f"| {c} | {tot[c]} | {totp[c]} | {sum(1 for r in rows if r[0] == c)} |")
print(f"| **all** | {sum(tot.values())} | {sum(totp.values())} | {len(rows)} |")
