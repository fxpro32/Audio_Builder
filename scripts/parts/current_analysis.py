#!/usr/bin/env python3
"""R3: how maker 'max current draw' relates to rated power: eta_implied = P_max_total / (V x I_max), per brand and class.
P_max_total = largest total output over the published loads (sum over channel groups at one load, bridged ratings excluded unless the amp is mono)."""
import json, statistics as st
def ptot(r):
    best = 0
    for ohm in sorted({x["ohm"] for x in r["rms_ratings"]}):
        tot = sum(x["w_per_ch"] * (x["channels"] or 1) for x in r["rms_ratings"] if x["ohm"] == ohm and not x["bridged"])
        best = max(best, tot)
    return best or None
rows = []
for b, key, V in (("rockford-fosgate", "current_draw_max_sine_13v8_a", 13.8), ("dd-audio", "current_draw_max_a", 14.4), ("taramps", "current_draw_max_sine_a", 14.4), ("kenwood", "current_draw_a", 14.4)):
    try: d = json.load(open(f"/workspace/data/parts_raw/amplifiers/{b}.json"))
    except FileNotFoundError: continue
    for r in d["records"]:
        I = r.get(key); P = r.get("total_power_w") if b == "rockford-fosgate" else ptot(r)
        if I and P: rows.append((b, (r.get("class") or "?"), r["model"], P, I, round(P / (V * I), 2), V))
by = {}
for b, c, m, P, I, e, V in rows: by.setdefault(b, []).append(e)
print("| Brand | Amps with both figures | eta_implied min | median | max | Voltage used |"); print("|---|---|---|---|---|---|")
for b, es in by.items(): print(f"| {b} | {len(es)} | {min(es)} | {st.median(es)} | {max(es)} | {[r[6] for r in rows if r[0] == b][0]} V |")
json.dump([dict(zip(("brand", "class", "model", "p_total_w", "i_max_a", "eta_implied", "v"), r)) for r in rows], open("/workspace/data/parts_raw/_reference/current_vs_power.json", "w"), indent=1)
print("rows", len(rows))
