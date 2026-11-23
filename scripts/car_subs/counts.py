#!/usr/bin/env python3
"""R2_SUBS_ALL: per-brand counts over data/car_subs_raw/*/*.json as a Markdown table (for references/research_j_car_subs_all.md).
'With T/S' = records in drivers[] (at least one of Fs, Qts, Vas). 'Full T/S' = Fs, Qts, Qes, Qms, Vas, Re, Bl, Mms and Sd all present.
Usage: python3 -I counts.py"""
import json, glob, os
FULL = ("fs_hz", "qts", "qes", "qms", "vas_l", "re_ohm", "bl_tm", "mms_g", "sd_cm2")
rows, T = [], dict(d=0, hp=0, new=0, full=0, n=0, nnew=0)
for f in sorted(glob.glob("/workspace/data/car_subs_raw/*/*.json")):
    d = json.load(open(f)); dr, nt = d["drivers"], d["no_ts_published"]
    hp = sum(1 for r in dr if r.get("source") == "hp_subs_raw"); new = len(dr) - hp
    nnew = sum(1 for r in nt if r.get("source") == "R2_SUBS_ALL")
    full = sum(1 for r in dr if all(r["params"].get(k) is not None for k in FULL))
    rows.append(f"| {d['brand']} | {f.split('/')[-2]}/{os.path.basename(f)} | {len(dr)} | {hp} | {new} | {full} | {len(nt)} | {nnew} | {d.get('coverage') or ''} |")
    for k, v in (("d", len(dr)), ("hp", hp), ("new", new), ("full", full), ("n", len(nt)), ("nnew", nnew)): T[k] += v
print("| Brand | File | With T/S | of which hp_subs_raw | of which new (R2) | Full T/S | Listed without T/S | of which new (R2) | Coverage |")
print("|---|---|---|---|---|---|---|---|---|")
print("\n".join(rows))
print(f"| **Total ({len(rows)} files)** | | **{T['d']}** | {T['hp']} | {T['new']} | {T['full']} | **{T['n']}** | {T['nnew']} | |")
