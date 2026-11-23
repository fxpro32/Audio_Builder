#!/usr/bin/env python3
"""A2: per-brand counts table (markdown) from data/hp_subs_raw/us/*.json."""
import json, glob, os
tot = [0, 0]
print("| Brand (file) | Country | Records with T/S | Models listed without T/S | Status mix |\n|---|---|---|---|---|")
for f in sorted(glob.glob("/workspace/data/hp_subs_raw/us/*.json")):
    d = json.load(open(f)); st = {}
    for r in d["drivers"]: st[r["status"]] = st.get(r["status"], 0) + 1
    tot[0] += len(d["drivers"]); tot[1] += len(d["no_ts_published"])
    print(f"| {d['brand']} ({os.path.basename(f)}) | {d['country']} | {len(d['drivers'])} | {len(d['no_ts_published'])} | {', '.join(f'{k} {v}' for k, v in st.items()) or 'none'} |")
print(f"| **Total** | | **{tot[0]}** | **{tot[1]}** | |")
