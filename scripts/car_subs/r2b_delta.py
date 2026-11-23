#!/usr/bin/env python3
"""R2B_SUBS_MORE: per-brand change of data/car_subs_raw against the committed R2 state (git HEAD), as a Markdown table.
Columns: brand file, with T/S before -> after, listed before -> after, records whose notes say 'READ FROM IMAGE'. Usage: python3 -I r2b_delta.py"""
import json, glob, subprocess, os
os.chdir("/workspace")
rows, T = [], [0, 0, 0, 0, 0]
for f in sorted(glob.glob("data/car_subs_raw/*/*.json")):
    d = json.load(open(f))
    try: o = json.loads(subprocess.run(["git", "show", "HEAD:" + f], capture_output=True, text=True, check=True).stdout)
    except subprocess.CalledProcessError: o = {"drivers": [], "no_ts_published": []}
    a, b, c, e = len(o["drivers"]), len(d["drivers"]), len(o["no_ts_published"]), len(d["no_ts_published"])
    img = sum(1 for r in d["drivers"] if "READ FROM IMAGE" in (r.get("notes") or "") or any("READ FROM IMAGE" in (s.get("doc") or "") for s in r.get("sources", [])))
    if (a, c) != (b, e) or img:
        rows.append(f"| {d['brand']} | {f.split('car_subs_raw/')[1]} | {a} -> {b} (+{b - a}) | {c} -> {e} ({e - c:+d}) | {img} |")
    T[0] += a; T[1] += b; T[2] += c; T[3] += e; T[4] += img
print("| Brand | File | With T/S (R2 -> R2B) | Listed without T/S (R2 -> R2B) | Of which read from images |\n|---|---|---|---|---|")
print("\n".join(rows))
print(f"| **All files** | | **{T[0]} -> {T[1]} (+{T[1] - T[0]})** | **{T[2]} -> {T[3]} ({T[3] - T[2]:+d})** | **{T[4]}** |")
