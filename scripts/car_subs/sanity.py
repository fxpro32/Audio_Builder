#!/usr/bin/env python3
"""R2_SUBS_ALL sanity checks over data/car_subs_raw/*/*.json, adapted from scripts/hp_subs/sanity_us.py (A2) and
scripts/hp_world_sanity.py (A3); bands widened for 6.5 and 8 in subs. Checks (calculations only; no record is changed):
 1 Qts vs Qms*Qes/(Qms+Qes), flag > 10 % apart
 2 Vas vs Vas from Fs, Mms, Sd (rho c^2 = 1.42e5 Pa), flag > 25 % apart
 3 Sd vs nominal size band
 4 Xmax one-way 2..60 mm
 5 Re implied by Qes, Bl, Mms, Fs vs printed Re (per coil / series / parallel), flag if none within 25 %
Usage: python3 -I sanity.py [--md OUT.md] [--only-new]"""
import glob, json, math, sys
RC2 = 1.42e5
SD_BAND = {6.5: (110, 170), 6.75: (110, 180), 8: (170, 280), 10: (280, 420), 12: (420, 620), 13: (480, 760), 15: (680, 1000), 16: (850, 1150),
           18: (1000, 1450), 19: (1150, 1550), 21: (1350, 2000)}


def checks(d):
    p = d["params"]; f = []
    qes, qms, qts = p.get("qes"), p.get("qms"), p.get("qts")
    if qes and qms and qts:
        c = qes * qms / (qes + qms)
        if abs(c - qts) / qts > 0.10: f.append(f"Qts {qts} vs calc {c:.3f}")
    fs, mms, sd, vas = p.get("fs_hz"), p.get("mms_g"), p.get("sd_cm2"), p.get("vas_l")
    if fs and mms and sd and vas:
        cms = 1 / ((2 * math.pi * fs) ** 2 * (mms / 1000))
        vc = RC2 * (sd / 1e4) ** 2 * cms * 1000
        if abs(vc - vas) / vas > 0.25: f.append(f"Vas {vas} L vs calc {vc:.1f} L")
    sz = d.get("size_in")
    if sd and sz in SD_BAND:
        lo, hi = SD_BAND[sz]
        if not lo <= sd <= hi: f.append(f"Sd {sd} cm2 unusual for {sz} in ({lo}-{hi})")
    x = p.get("xmax_mm")
    if x is not None and not 2 <= x <= 60: f.append(f"Xmax {x} mm outside 2-60")
    bl, re_ = p.get("bl_tm"), p.get("re_ohm")
    if qes and bl and fs and mms and re_:
        rimp = qes * bl ** 2 / (2 * math.pi * fs * mms / 1000)
        opts = [re_] + ([2 * re_, re_ / 2] if d.get("coils") == 2 else [])
        if min(abs(o - rimp) / o for o in opts) > 0.25: f.append(f"Qes/Bl/Mms/Fs imply Re {rimp:.2f}; printed Re {re_} fits no wiring within 25 %")
    return f


def main():
    only_new = "--only-new" in sys.argv
    rows, tot, flagged, per = [], 0, 0, {}
    for path in sorted(glob.glob("/workspace/data/car_subs_raw/*/*.json")):
        doc = json.load(open(path))
        for d in doc["drivers"]:
            if only_new and d.get("source") != "R2_SUBS_ALL": continue
            tot += 1
            f = checks(d)
            if f:
                flagged += 1; per[doc["brand"]] = per.get(doc["brand"], 0) + 1
                rows.append(f"| {doc['brand']} | {d['model']} | {d.get('source')} | {'; '.join(f)} |")
    rep = [f"Records checked: {tot}; records with at least one flag: {flagged}.", "",
           "Flags per brand: " + ", ".join(f"{b} {n}" for b, n in sorted(per.items())), "",
           "| Brand | Model | Record source | Flags |", "|---|---|---|---|"] + rows
    txt = "\n".join(rep)
    if "--md" in sys.argv: open(sys.argv[sys.argv.index("--md") + 1], "w").write(txt + "\n")
    print(txt)


main()
