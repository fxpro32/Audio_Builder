#!/usr/bin/env python3
"""A2: KICKER (Stillwater Designs, Stillwater OK) L7X SoloX and L7XS records. T/S from kicker.com/app/tsparam/<model>.html (parsed from saved copies),
power, dimensions and boxes from the owner's manuals 49L7X.pdf and 52L7XS.pdf (metric values as printed). Read 2026-11-21."""
import sys, re; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
from html import unescape
R = "/workspace/references/raw/hp_subs/us/kicker/"
def ts(model):
    t = open(R + f"ts_{model}.html", encoding="utf-8", errors="replace").read()
    t = unescape(re.sub(r"<[^>]+>", "|", re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S))); parts = [p.strip() for p in re.split(r"\|+", t) if p.strip()]
    d = {}
    for i, p in enumerate(parts[:-1]):
        if p in ("Re","fs","Mms","Bl","Qms","Qes","Qts","Vas","Lnom","Lm","Sd","Xmax","Xmas","Le") and p not in d: d[p] = float(parts[i + 1])
    return d
# manual data: size: (rms range, cutout cm, depth cm, vented L, tuning, displacement L)
L7X = {10: ((1000, 2000), 23.7, 24, 56.6, 31, 5.09), 12: ((1000, 2000), 28.1, 25.7, 84.9, 31, 5.38), 15: ((1000, 2000), 34.9, 29.3, 141.6, 30, 5.94), 18: ((1000, 2000), 42, 33.5, 214.5, 28, 10.19)}
L7XS = {12: ((1500, 3000), 28.1, 25.7, 84.9, 31, 5.38), 15: ((1500, 3000), 34.9, 29.3, 141.6, 30, 5.94), 18: ((2000, 4000), 42, 33.5, 214.5, 28, 10.19)}
drivers = []
for series, table, prefix, manual in [("L7X SoloX", L7X, "49L7X", "49L7X.pdf"), ("L7XS SoloX-S", L7XS, "52L7XS", "52L7XS.pdf")]:
    for size, (rng, cut, depth, vb, tune, disp) in table.items():
        for ohm in (1, 2):
            m = f"{prefix}{size}{ohm}"; d = ts(m)
            p = dict(re_ohm=d["Re"], fs_hz=d["fs"], mms_g=d["Mms"], bl_tm=d["Bl"], qms=d["Qms"], qes=d["Qes"], qts=d["Qts"], vas_l=d["Vas"], sd_cm2=d["Sd"], xmax_mm=d.get("Xmax", d.get("Xmas")), spl_db_1w1m=d.get("Lm"))
            murl = "https://www.kicker.com/files/manuals/" + manual
            r = rec(f"{series} {size} D{ohm} ({m})", size, "DVC", ohm, rng[1], None, p, "unknown", depth_mm=depth * 10, cut_mm=cut * 10, disp_l=disp,
                    boxes=[box("ported", None, tune, "maker manual " + manual + " p.10", litres=vb, note="published as Recommended Vented Box Volume (L as printed); port displacement excluded per maker")],
                    status="current",
                    sources=[src(f"https://www.kicker.com/app/tsparam/{m}.html", ["params"], doc="KICKER Thiele/Small Parameters page"),
                             src(murl, ["rms_w", "rms_range_w", "mounting_depth_mm", "cutout_mm", "displacement_l", "recommended_boxes", "coil", "final_loads_ohm"], doc="Owner's Manual", page="4, 5, 10")],
                    notes=("Maker rates 'Recommended Amplifier Power' as a range; upper bound entered as rms_w, full range in rms_range_w. "
                           "spl_db_1w1m = maker 'Lm' (SPL at 1 m for 1 W at Re); maker also gives Lnom " + str(d.get("Lnom")) + " dB at nominal impedance. "
                           "ts_basis not stated; Re about twice the nominal coil impedance suggests coils in series (inference). Le given only as a Wright model, not stored."
                           + (" Maker T/S page labels this row 'Xmas' (typo for Xmax)." if "Xmas" in d else "")
                           + (" DATA PROBLEM: T/S page gives Xmax 49.1 mm; the manual gives 43.1 mm for all L7XS sizes." if m == "52L7XS181" else "")
                           + (" L7XS manual prints the same cutout and mounting depth as L7X for 12/15/18 (possible copy; check)." if prefix == "52L7XS" else "")))
            r["rms_range_w"] = list(rng); drivers.append(r)
no_ts_checked = [{"model": "L7X 8 (49L7X81/82)", "rms_w": 800, "url": "https://www.kicker.com/files/manuals/49L7X.pdf", "note": "Below threshold (400-800 W); listed only to show it was checked."}]
no_ts = []
save("kicker", "KICKER (Stillwater Designs)", "https://www.kicker.com",
     "robots.txt: Allow / (only /cart/ and one script disallowed). Footer has Terms & Conditions and a Copyright and Trademark Notice (not read in full). Pages read 4-5 s apart. Numbers only.",
     drivers, no_ts)
