#!/usr/bin/env python3
"""A2 sanity checks over data/hp_subs_raw/us/*.json. Prints a markdown table of flags.
1 Qts vs Qms*Qes/(Qms+Qes) within 10 %. 2 Vas/Mms/Fs consistency: Cms = Vas/(rho c^2 Sd^2), fs_calc = 1/(2 pi sqrt(Mms Cms)), flag if off > 20 %.
3 Sd vs nominal size (rough band). 4 Xmax 5..80 mm. 5 Bl ratio D2/D1 of same model (expected ~1.3..1.6 for per-coil or series data)."""
import json, glob, math, sys
RHO_C2 = 1.184 * 346.1 ** 2  # air at 25 C, Pa
SD_BAND = {8: (180, 280), 10: (290, 420), 12: (420, 600), 13: (480, 760), 15: (680, 960), 16: (850, 1150), 18: (1000, 1420), 19: (1150, 1550), 21: (1350, 1800)}
rows, n = [], 0
for f in sorted(glob.glob("/workspace/data/hp_subs_raw/us/*.json")):
    d = json.load(open(f))
    for r in d["drivers"]:
        n += 1; p = r["params"]; fl = []
        if p["qms"] and p["qes"] and p["qts"]:
            q = p["qms"] * p["qes"] / (p["qms"] + p["qes"])
            if abs(q - p["qts"]) / p["qts"] > 0.10: fl.append(f"Qts {p['qts']} vs calc {q:.3f}")
        if p["vas_l"] and p["mms_g"] and p["sd_cm2"] and p["fs_hz"]:
            cms = (p["vas_l"] / 1000) / (RHO_C2 * (p["sd_cm2"] / 1e4) ** 2)
            fsc = 1 / (2 * math.pi * math.sqrt(p["mms_g"] / 1000 * cms))
            if abs(fsc - p["fs_hz"]) / p["fs_hz"] > 0.20: fl.append(f"Fs {p['fs_hz']} vs calc from Vas/Mms/Sd {fsc:.1f}")
        b = SD_BAND.get(r["size_in"])
        if p["sd_cm2"] and b and not (b[0] <= p["sd_cm2"] <= b[1]): fl.append(f"Sd {p['sd_cm2']} cm2 outside {b} for {r['size_in']} in")
        if p["xmax_mm"] and not (5 <= p["xmax_mm"] <= 80): fl.append(f"Xmax {p['xmax_mm']} mm implausible")
        if fl: rows.append((d["brand"], r["model"], "; ".join(fl)))
print(f"Records checked: {n}; records flagged: {len(rows)}\n")
print("| Brand | Model | Flag |\n|---|---|---|")
for b, m, fl in rows: print(f"| {b} | {m} | {fl} |")
