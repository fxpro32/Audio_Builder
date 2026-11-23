#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): Fi Car Audio (Spanish Springs NV, USA) lower-power lines, added to the hp_subs_raw copy.
Pages read 10 s apart (robots Crawl-delay 10 for AI agents honoured) into references/raw/car_subs/fi/ (product sitemap products.txt).
- Xv4 (10/12/15; 18 'tba') and Alpha V1 (10/12/15): T/S in page text tables (parsed below from xv4-series-10-subwoofer and alpha-series-10,
  the pages whose tables carry every size). Shared T/S per size; Re and Bl printed per coil option.
- Xv5 (8/10/12/15) and Alpha V2 (10/15): T/S only in images, READ FROM IMAGE (scripts/car_subs/image_reads/fi.py).
Usage: python3 -I build_fi_lower.py"""
import sys, re, math
sys.path.insert(0, "/workspace/scripts/car_subs"); sys.path.insert(0, "/workspace/scripts/car_subs/image_reads")
from common import rec, src, save, num, L as cuft_l
import fi as FI
R = "/workspace/references/raw/car_subs/fi/"
U = "https://ficaraudio.com/"
LAB = ["Coils", "FS", "RE", "QMS", "QES", "QTS", "MMS", "CMS", "SD", "VAS", "SPL", "BL (NA)", "XMAX", "RMS"]
LAB2 = ["Overall Diameter", "Cutout Diameter", "Mounting Depth", "DriverDisplacement", "Sealed Box", "Ported Box"]


def table(slug, start, labs, stop):
    t = open(R + slug + ".txt", encoding="utf-8").read()
    i = t.index(start); j = min([k for k in (t.find(s, i + len(start)) for s in stop) if k > 0] or [len(t)])
    rows, cur = {"hdr": []}, "hdr"
    for x in (y.strip() for y in t[i + len(start):j].replace("\n", " ").split("|")):
        if x in labs: cur = x; rows[cur] = []; continue
        rows[cur].append(x)
    rows["hdr"] = [h for h in rows["hdr"] if h]
    return rows


def dims(slug):
    try: d = table(slug, "TECHNICAL SPECIFICATIONS", LAB2, ["Close", "Warranty", "Ported Box"])
    except ValueError: return {}
    out = {}
    vals = lambda k: [v for v in d.get(k, []) if v]
    for n, h in enumerate(d["hdr"]):
        g = lambda k: vals(k)[n] if n < len(vals(k)) else None
        out[re.search(r"(\d+)\D*$", h).group(1)] = (num(g("Cutout Diameter")), num(g("Mounting Depth")), num(g("DriverDisplacement")))
    return out


drivers, no_ts = [], []
# Xv4 + Alpha V1 from page text
for slug, series, opts, coil in (("xv4-series-10-subwoofer", "Xv4", ["D1", "D2"], "DVC"), ("alpha-series-10", "Alpha V1", ["S1", "S2", "S4"], "SVC")):
    t = table(slug, "THIELE-SMALL PARAMETERS", LAB, ["TECHNICAL", "Warranty", "Close"])
    sizes = [int(re.search(r"(\d+)$", h).group(1)) for h in t["hdr"]]
    dm = {}
    for s2 in ([slug, "xv4-series-12"] if series == "Xv4" else [slug, "alpha-series-15"]):
        for k, v in dims(s2).items(): dm.setdefault(k, v)
    re_tok = [x for x in t["RE"] if x]
    for n, size in enumerate(sizes):
        g = lambda k: t[k][n] if n < len(t[k]) else None
        if (g("FS") or "").startswith("tba"):
            no_ts.append({"model": f"{series} {size} ({'/'.join(opts)})", "rms_w": num(g("RMS")), "url": U + slug + "/",
                          "note": "Maker T/S table prints 'tba' for this size (2026-11-23).", "size_in": size, "coil": coil,
                          "sources": [src(U + slug + "/", doc="product page, Thiele-Small table")]}); continue
        res = (re_tok[2 * n:2 * n + 2] if series == "Xv4" else g("RE").split("/"))
        bls = (g("BL (NA)") or "").split("/")
        cut, dep, disp = dm.get(str(size) + ("" if series == "Xv4" else ""), (None, None, None)) if dm else (None, None, None)
        for k, o in enumerate(opts):
            ohm = int(o[1:])
            bl = num(bls[k]) if len(bls) == len(opts) else None
            note = ("Page T/S table: one column per size for all coil options; Re and Bl printed per option ('" + g("RE") + "' / '" + g("BL (NA)") + "'), the other values shared. "
                    + ("Bl printed as a single " + bls[0] + " for this size without the option split, so bl_tm is left empty. " if bl is None and bls[0] else "")
                    + "Bl unit printed 'NA' (taken as T m). ts_basis not stated.")
            drivers.append(rec(f"{series} {size} {o}", size, coil, ohm, num(g("RMS")), None,
                               dict(fs_hz=num(g("FS")), re_ohm=num(re.sub(r"^\.", "0.", res[k].strip())), qms=num(g("QMS")), qes=num(g("QES")), qts=num(g("QTS")), mms_g=num(g("MMS")),
                                    sd_cm2=num(g("SD")) if g("SD") else None, vas_l=num(g("VAS")), spl_db_1w1m=num(g("SPL")) if g("SPL") else None, bl_tm=bl, xmax_mm=num(g("XMAX"))),
                               "unknown", cut_in=cut, depth_in=dep, disp_cuft=disp, status="current",
                               sources=[src(U + slug + "/", doc="product page, Thiele-Small Parameters table (text)")], notes=note))
# Xv5 + Alpha V2 read from images
checks = []
for (model, size, ohm, img, slug, rms, D, re_, fs, zmax, bl, qms, qes, qts, vas, le, eta, spl, mms, cms, xmax, xmech, disp, cut, dep) in FI.ROWS:
    sd = round(math.pi * (D / 20) ** 2, 1)
    cm = float(re.sub(r"x10\^", "e", cms.split()[0]))
    vas_c = 1.184 * 343 ** 2 * (sd / 1e4) ** 2 * cm * 1000
    qts_c = qms * qes / (qms + qes)
    checks.append(f"{model}: Qts {qts} vs calc {qts_c:.3f}; Vas {vas} L vs rho c^2 Sd^2 Cms {vas_c:.1f} L")
    drivers.append(rec(model, size, "DVC", ohm, rms, None,
                       dict(fs_hz=fs, re_ohm=re_, qms=qms, qes=qes, qts=qts, vas_l=vas, le_mh=le, spl_db_1w1m=spl, mms_g=mms, bl_tm=bl, sd_cm2=sd, xmax_mm=xmax),
                       "series", depth_mm=dep, cut_mm=cut, disp_cuft=disp, status="current",
                       sources=[src(FI.IMG + img, doc="maker T/S spec image on the product page " + U + slug + "/ (READ FROM IMAGE)"),
                                src(U + slug + "/", fields=("rms_w", "cutout_mm", "mounting_depth_mm"), doc="product page + series dimensions image")],
                       notes=(f"T/S READ FROM IMAGE (maker spec PNG), double-checked: {checks[-1]}. Sd calculated from the printed diameter D {D} mm (pi D^2/4), not printed. "
                              f"Re {re_} ohm on a dual {ohm} ohm coil = the coils in series (inference: ts_basis series). Le printed as L10K (at 10 kHz). "
                              f"Other printed values: Zmax {zmax} ohm, efficiency {eta} %, Cms {cms}, Xmech {xmech} mm. RMS from the image badge.")))
for (model, slug, rms, cut, dep, note) in FI.LISTED:
    no_ts.append({"model": model, "rms_w": rms, "url": U + slug + "/", "note": note + f" Cut-out {cut} mm, mounting depth {dep} mm (series dimensions image).",
                  "cutout_mm": cut, "mounting_depth_mm": dep, "sources": [src(U + slug + "/", doc="product page")]})
no_ts.append({"model": "SP3v2 12/15/18 D1/D2 (standard, 1500 W)", "rms_w": 1500, "url": U + "sp3v2-subwoofer/",
              "note": "Page text: 'More Details coming soon', no T/S (2026-11-23); the 2500 W Plus is listed in the hp_subs_raw part.", "sources": [src(U + "sp3v2-subwoofer/", doc="product page")]})
print("\n".join(checks))
save("us", "fi-car-audio", "Fi Car Audio", "USA", "https://ficaraudio.com",
     "R2B 2026-11-23: product sitemap and 14 lower-line product pages read 10 s apart (robots Crawl-delay 10 for AI agents honoured); spec images fetched 4 s apart. Numbers only; Xv5/Alpha V2 values read from the maker's images.",
     drivers, no_ts, coverage="all current subwoofer lines in the maker product sitemap: NEO, MT, HC (hp_subs_raw), Xv4, Xv5, Alpha V1, Alpha V2, SP3v2/SP4v3 (listed); recone kits left out")
