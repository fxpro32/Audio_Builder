#!/usr/bin/env python3
"""Sanity checks for data/hp_subs_raw/world/*.json (agent A3, 2026-11-22).
Prints a Markdown report: per-record flags for
 1 Qts vs Qes*Qms/(Qes+Qms) (flag if > 10 % apart)
 2 Vas vs Vas calculated from Mms, Fs, Sd (rho*c^2 = 1.42e5 Pa; flag if > 25 % apart)
 3 Sd vs nominal size (flag if outside the typical band for that size)
 4 Xmax plausible (one-way 3 to 50 mm)
 5 Re implied by Qes, Bl, Mms, Fs (Re = Qes*Bl^2/(2*pi*Fs*Mms)) compared with the printed Re per coil, coils in series, coils in parallel
Usage: python3 -I hp_world_sanity.py [--md OUT.md]"""
import glob, json, math, sys

RC2 = 1.42e5
SD_BAND = {8: (180, 260), 10: (290, 400), 12: (420, 600), 13: (480, 680), 15: (700, 980), 18: (1000, 1400), 21: (1400, 2000)}

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
    if x is not None and not 3 <= x <= 50: f.append(f"Xmax {x} mm outside 3-50")
    bl, re_ = p.get("bl_tm"), p.get("re_ohm")
    basis = None
    if qes and bl and fs and mms:
        rimp = qes * bl ** 2 / (2 * math.pi * fs * mms / 1000)
        if re_:
            opts = {"as printed": re_}
            if d.get("coils") == 2: opts.update({"series (2x)": 2 * re_, "parallel (/2)": re_ / 2})
            best = min(opts, key=lambda k: abs(opts[k] - rimp) / opts[k])
            err = abs(opts[best] - rimp) / opts[best]
            basis = f"implied Re {rimp:.2f}; closest {best} ({err*100:.0f} %)"
            if err > 0.25: f.append(f"Qes/Bl/Mms/Fs imply Re {rimp:.2f}, no wiring of printed Re {re_} fits within 25 %")
        else:
            basis = f"implied Re {rimp:.2f} (no Re printed)"
    return f, basis

def main():
    out = []; tot = flagged = 0
    for path in sorted(glob.glob("/workspace/data/hp_subs_raw/world/*.json")):
        doc = json.load(open(path))
        for d in doc["drivers"]:
            tot += 1
            f, basis = checks(d)
            if f: flagged += 1
            if f or basis:
                out.append(f"| {doc['brand']} | {d['model']} | {'; '.join(f) if f else 'ok'} | {basis or ''} |")
    rep = [f"Records checked: {tot}; records with at least one flag: {flagged}.", "",
           "| Brand | Model | Flags | Re implied by Qes/Bl/Mms/Fs (T/S basis hint) |", "|---|---|---|---|"] + out
    txt = "\n".join(rep)
    if "--md" in sys.argv: open(sys.argv[sys.argv.index("--md") + 1], "w").write(txt + "\n")
    print(txt)

main()
