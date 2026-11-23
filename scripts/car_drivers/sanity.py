#!/usr/bin/env python3
"""R4_CAR_DRIVERS sanity checks over data/car_drivers_raw/*/*.json, adapted from scripts/hp_world_sanity.py (A3) for car
tweeters, midrange, midbass, coaxials and component sets. Calculations only; no record is changed.
Checks:
 1 Qts vs Qes*Qms/(Qes+Qms), flag > 10 % apart
 2 Vas vs Vas from Fs, Mms, Sd (rho*c^2 = 1.42e5 Pa; Cms = 1/((2 pi Fs)^2 Mms)), flag > 25 % apart
 3 Sd vs nominal size (typical band per size class), flag outside
 4 Xmax plausible for the type (one way: midbass/coax/set 0.5-15 mm, midrange 0.3-8 mm)
 5 Re implied by Qes, Bl, Mms, Fs (Re = Qes*Bl^2/(2 pi Fs Mms)) vs printed Re, flag > 25 % apart
 6 Fs plausible for the type (tweeter 300-4000 Hz, midrange 40-1000 Hz, midbass/coax/set 20-200 Hz)
 7 Sensitivity 75-115 dB; RMS <= peak; impedance 1-16 ohm
Usage: python3 -I sanity.py [--md OUT.md]"""
import glob, json, math, sys

RC2 = 1.42e5
SD_BAND = {2: (10, 30), 2.5: (15, 35), 2.75: (15, 40), 3: (20, 50), 3.15: (20, 50), 3.5: (25, 55), 4: (40, 70), 4.75: (60, 95), 5: (65, 110),
           5.25: (70, 115), 5.75: (75, 125), 6: (100, 150), 6.5: (110, 160), 6.75: (120, 165), 7: (130, 200), 8: (170, 250), 10: (290, 400)}
OVAL_SD = {"4x6": (60, 110), "5x7": (100, 160), "6x8": (120, 190), "6x9": (150, 240), "4x10": (80, 140), "7x10": (190, 280)}


def checks(d):
    p = d["params"]; f = []; t = d["type"]
    qes, qms, qts = p.get("qes"), p.get("qms"), p.get("qts")
    if qes and qms and qts:
        c = qes * qms / (qes + qms)
        if abs(c - qts) / qts > 0.10: f.append(f"Qts {qts} vs calc {c:.3f} from Qes/Qms")
    fs, mms, sd, vas = p.get("fs_hz"), p.get("mms_g"), p.get("sd_cm2"), p.get("vas_l")
    if fs and mms and sd and vas and t != "tweeter":
        cms = 1 / ((2 * math.pi * fs) ** 2 * (mms / 1000))
        vc = RC2 * (sd / 1e4) ** 2 * cms * 1000
        if abs(vc - vas) / vas > 0.25: f.append(f"Vas {vas} L vs calc {vc:.2f} L (Fs/Mms/Sd)")
    sz = d.get("size_in"); lab = d.get("size_label") or ""
    band = SD_BAND.get(sz) if sz else None
    if not band:
        for k, v in OVAL_SD.items():
            if lab.startswith(k): band = v
    if sd and band and t != "tweeter":
        lo, hi = band
        if not lo <= sd <= hi: f.append(f"Sd {sd} cm2 unusual for {sz or lab} ({lo}-{hi})")
    x = p.get("xmax_mm")
    if x is not None:
        lim = {"midrange": (0.3, 8), "tweeter": (0.05, 3)}.get(t, (0.5, 15))
        if not lim[0] <= x <= lim[1]: f.append(f"Xmax {x} mm outside {lim[0]}-{lim[1]} for {t}")
    bl, re_ = p.get("bl_tm"), p.get("re_ohm")
    basis = None
    if qes and bl and fs and mms:
        rimp = qes * bl ** 2 / (2 * math.pi * fs * mms / 1000)
        basis = f"implied Re {rimp:.2f}"
        if re_ and abs(rimp - re_) / re_ > 0.25: f.append(f"Qes/Bl/Mms/Fs imply Re {rimp:.2f} vs printed {re_}")
    if fs:
        lim = {"tweeter": (300, 4000), "midrange": (40, 1000), "fullrange": (40, 1000)}.get(t, (20, 200))
        if not lim[0] <= fs <= lim[1]: f.append(f"Fs {fs} Hz outside {lim[0]}-{lim[1]} for {t}")
    s = d.get("sensitivity_db")
    if s is not None and not 75 <= s <= 115: f.append(f"sensitivity {s} dB outside 75-115")
    if d.get("rms_w") and d.get("peak_w") and d["rms_w"] > d["peak_w"]: f.append(f"RMS {d['rms_w']} W > peak {d['peak_w']} W")
    z = d.get("impedance_ohm")
    if z is not None and not 1 <= z <= 16: f.append(f"impedance {z} ohm outside 1-16")
    return f, basis


def main():
    rows = []; tot = flagged = 0; per = {}
    for path in sorted(glob.glob("/workspace/data/car_drivers_raw/*/*.json")):
        doc = json.load(open(path))
        for d in doc["drivers"]:
            tot += 1
            f, basis = checks(d)
            per.setdefault(doc["brand"], [0, 0]); per[doc["brand"]][0] += 1
            if f:
                flagged += 1; per[doc["brand"]][1] += 1
                rows.append(f"| {doc['brand']} | {d['type']} | {d['model']} | {'; '.join(f)} |")
    rep = [f"Records checked: {tot}; records with at least one flag: {flagged}.", "", "| Brand | Records | Flagged |", "|---|---|---|"]
    rep += [f"| {b} | {n} | {k} |" for b, (n, k) in sorted(per.items())]
    rep += ["", "| Brand | Type | Model | Flags |", "|---|---|---|---|"] + rows
    txt = "\n".join(rep)
    if "--md" in sys.argv: open(sys.argv[sys.argv.index("--md") + 1], "w").write(txt + "\n")
    print(txt if "--quiet" not in sys.argv else rep[0])


if __name__ == "__main__":
    main()
