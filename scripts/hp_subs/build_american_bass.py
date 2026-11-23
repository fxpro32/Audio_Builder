#!/usr/bin/env python3
"""A2: American Bass (USA) records. Values transcribed by eye from maker spec-sheet PDFs (image PDFs, rendered with pdf_render.mjs),
linked from americanbassusa.com product pages; read 2026-11-21. PDFs kept in references/raw/hp_subs/us/american-bass/."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box_range, box, src, save
CDN = "https://cdn.shopify.com/s/files/1/0655/3550/8703/files/"
P = "https://americanbassusa.com/products/"
drivers, no_ts = [], []
K = ["re_ohm", "fs_hz", "sd_cm2", "bl_tm", "qms", "qes", "qts", "spl_db_1w1m", "vas_l", "mms_g", "xmax_mm"]
def add(model, size, ohm, rms, peak, vals, pdf, page_url, notes, basis="unknown", extra_src=None, **kw):
    p = dict(zip(K, vals))
    srcs = [src(CDN + pdf, ["params", "rms_w", "peak_w"], doc="maker specification sheet PDF (image), via product page " + page_url, page=1)]
    if extra_src: srcs.append(extra_src)
    drivers.append(rec(model, size, "DVC", ohm, rms, peak, p, basis, status="current", sources=srcs, notes=notes, **kw))
# KING (KING.pdf, linked from king-subwoofer and king-15-subwoofer)
KN = ("Sheet columns: Re, Fs, Sd, Md, BL, Qms, Qes, Qts, No, SPL, Vas, Cms, Krm, Erm, MMS, MMd, Kxm, Exm, Xmax; Md/Cms/Wright terms not stored. "
      "ts_basis not stated; Re 1.6 for Dual 1 and 4 for Dual 2 suggests coils in series (inference). Sheet dimensions A/B/C/D (12: 330/280/288/160 mm; "
      "15: 495/310/350/160 mm) are drawing letters without labels and are not mapped to cutout/depth. KING 18 has its own sheet (see no_ts or separate record).")
for model, size, ohm, vals in [("KING-12D1", 12, 1, (1.6, 47.28, 498, 21, 5.33, 0.63, 0.56, 82.3, 6.5, 606, 22.5)),
                               ("KING-12D2", 12, 2, (4, 49.28, 498.76, 27, 5.66, 0.69, 0.64, 80.7, 6.3, 582.9, 22.5)),
                               ("KING-15D1", 15, 1, (1.6, 43.62, 784.2, 20.24, 4.948, 0.69, 0.61, 85.2, 17.88, 650.18, 22.5)),
                               ("KING-15D2", 15, 2, (4, 49.31, 784.2, 30, 3.94, 0.77, 0.65, 85.7, 15.6, 580, 22.5))]:
    add(model, size, ohm, 6500, 15000, vals, "KING.pdf", P + ("king-subwoofer" if size == 12 else "king-15-subwoofer"),
        KN + (" Sd 498 cm2 for a 12 in and 784.2 cm2 for a 15 in as printed." if ohm == 1 else ""))
# GODFATHER (Godfather-Series.pdf p.1): one row per wiring (series and parallel). Columns: Imp, Power, VC, Dcr, Fs, SD (printed unit 'msqM' = 10^-3 m2,
# entered x10 as cm2), BL, Qms, Qes, Qts, n, SPLo, Vas, Cms, Mms, Mmd, Xmax, Xmech, AGH.
GK = ["re_ohm", "fs_hz", "sd_cm2", "bl_tm", "qms", "qes", "qts", "spl_db_1w1m", "vas_l", "mms_g", "xmax_mm"]
GF = {  # model: (size, ohm/coil, series row, parallel row) rows = Dcr, Fs, SD(msqM), BL, Qms, Qes, Qts, SPLo, Vas, Mms, Xmax
 "GF-1211": (12, 1, (1.6, 36.1, 53.1, 16.14, 3.027, 0.309, 0.28, 89.2, 35.1, 221.5, 20), (0.4, 37.2, 53.1, 8.00, 2.843, 0.332, 0.297, 89.7, 34.1, 215.7, 20)),
 "GF-1511": (15, 1, (1.6, 35.6, 80.4, 17.56, 3.054, 0.36, 0.322, 91.3, 65.6, 251.9, 20), (0.4, 35.4, 80.4, 8.40, 3.681, 0.341, 0.312, 91.6, 67.3, 265.1, 20)),
 "GF-1811": (18, 1, (1.6, 29.6, 119.5, 17.11, 3.511, 0.383, 0.345, 92.1, 155.8, 377.1, 20), (0.4, 30.1, 119.5, 8.28, 3.233, 0.387, 0.345, 92.4, 161.8, 350.0, 20)),
 "GF-1222": (12, 2, (3.2, 36.3, 53.1, 25.16, 3.03, 0.252, 0.233, 90.1, 35.2, 219.0, 20), (0.8, 37.1, 53.1, 13.08, 3.049, 0.265, 0.244, 89.5, 34.4, 213.0, 20)),
 "GF-1522": (15, 2, (3.2, 36.2, 80.4, 24.41, 3.499, 0.314, 0.288, 92.1, 68.4, 254.5, 20), (0.8, 37.3, 80.4, 11.36, 3.47, 0.339, 0.309, 92.3, 71.0, 231.8, 20)),
 "GF-1822": (18, 2, (3.2, 31.7, 119.5, 27.14, 3.635, 0.381, 0.345, 91.8, 116.0, 439.6, 20), (0.8, 31.9, 119.5, 13.18, 3.621, 0.396, 0.357, 91.7, 117.6, 428.6, 20)),
}
GDIM = {12: (288, 7.9), 15: (350, 9.6), 18: (422, 13.6)}
GDEP = {12: (215, 246), 15: (228, 258), 18: (267, 292)}
for model, (size, ohm, ser, par) in GF.items():
    ps = dict(zip(GK, ser)); ps["sd_cm2"] = round(ps["sd_cm2"] * 10, 1)
    pp = dict(zip(GK, par)); pp["sd_cm2"] = round(pp["sd_cm2"] * 10, 1)
    page = P + {12: "godfather-12-subwoofer", 15: "godfather-15-subwoofer", 18: "godfather-18-subwoofer"}[size]
    cut, disp = GDIM[size]; g, h = GDEP[size]
    add(model, size, ohm, 3000, 6000, tuple(ps[k] for k in GK), "Godfather-Series.pdf", page,
        f"Sheet gives a row per wiring: params = coils in series ({2*ohm} ohm); the parallel row ({ohm/2} ohm) is in params_parallel. SD printed as {ser[2]} 'msqM' (10^-3 m2), entered as cm2 x10. "
        f"Cutout = sheet 'Diameter C' {cut} mm (matches the product page cutout); displacement = sheet 'Vd'. Mounting depth not stated as such: sheet Depth G {g} mm and Depth H {h} mm (drawing letters); the product page lists mounting depth 9.29 in for the 12, which equals the motor diameter D 236 mm (possible page error). Xmech 55 mm, air gap height 25 mm. Break-in note on the sheet.",
        basis="series", cut_mm=cut, disp_l=disp)
    drivers[-1]["params_parallel"] = dict({k: None for k in drivers[-1]["params"]}, **pp)
# generic per-wiring sheet helper: rows (imp, dcr, fs, sd_msqM, bl, qms, qes, qts, spl, vas, mms, xmax)
def per_wiring(model, size, ohm, rms, peak, ser, par, pdf, page_slug, extra, cut=None, disp=None, depth=None):
    def P_(r): return dict(re_ohm=r[1], fs_hz=r[2], sd_cm2=round(r[3] * 10, 1), bl_tm=r[4], qms=r[5], qes=r[6], qts=r[7], spl_db_1w1m=r[8], vas_l=r[9], mms_g=r[10], xmax_mm=r[11])
    ps, pp = P_(ser), P_(par)
    add(model, size, ohm, rms, peak, tuple(ps[k] for k in K), pdf, P + page_slug,
        f"Sheet gives a row per wiring: params = coils in series ({ser[0]} ohm); parallel row ({par[0]} ohm) in params_parallel. SD printed in 'msqM' (10^-3 m2), entered x10 as cm2. " + extra,
        basis="series", cut_mm=cut, disp_l=disp, depth_mm=depth)
    drivers[-1]["params_parallel"] = dict({k: None for k in drivers[-1]["params"]}, **pp)
# HURRICANE (Hurricane_Subwoofers_Specs.pdf p.3 T/S, p.4 dimensions). Columns Imp, Dcr, Fs, SD, BL, Qms, Qes, Qts, SPLo, Vas, (Cms), Mms, (Mmd), Xmax, Vd
HU = {"HURRICANE 12D1": (12, 1, (2, 1.6, 28.479, 44.5, 19.078, 5.169, 0.325, 0.306, 83.8, 20.349, 428.226, 25), (0.5, 0.40, 28.265, 44.5, 11.032, 4.158, 0.241, 0.228, 83.9, 20.659, 424.148, 25)),
      "HURRICANE 12D2": (12, 2, (4, 2.8, 30.361, 44.5, 24.448, 4.989, 0.354, 0.330, 83.8, 19.184, 395.817, 26), (1, 0.7, 29.683, 44.5, 14.177, 4.434, 0.296, 0.278, 83.9, 19.431, 399.805, 26)),
      "HURRICANE 15D1": (15, 1, (2, 1.6, 28.455, 76.5, 20.472, 5.381, 0.325, 0.306, 87.7, 52.662, 491.392, 25), (0.5, 0.40, 28.265, 76.5, 12.321, 4.271, 0.243, 0.229, 87.6, 51.672, 493.672, 25)),
      "HURRICANE 15D2": (15, 2, (4, 2.8, 27.634, 76.5, 23.915, 5.254, 0.374, 0.349, 88.4, 61.598, 439.526, 26), (1, 0.7, 27.119, 76.5, 13.874, 4.397, 0.293, 0.275, 88.1, 59.426, 443.064, 26))}
for model, (size, ohm, ser, par) in HU.items():
    cut, disp = {12: (288, 10.66), 15: (350, 12.76)}[size]
    per_wiring(model, size, ohm, 3000, 6000, ser, par, "Hurricane_Subwoofers_Specs.pdf", f"hurricane-{size}-subwoofer",
        "Cutout = sheet 'Diameter C'; displacement = sheet 'Vd'. Depth G/H (12: 287/335 mm; 15: 302/350 mm) are drawing letters, not mapped to mounting depth. "
        + ("DATA PROBLEM: 15 in 'Diameter B' 275 mm is smaller than its cutout C 350 mm (likely a typo on the sheet)." if size == 15 else ""), cut=cut, disp=disp)
# HD V.2 (HD_Series_subwoofer.pdf p.2): one column per coil option, ts_basis not stated. RMS 2000 W from the product pages (sheet gives max 4000 W only).
HD = {10: ((47, 4.593, 0.523, 0.470, 8.01, 270.3, 84, 17.515), (47, 5.326, 0.465, 0.427, 7.049, 304.6, 84, 27.954), 239, 188),
      12: ((36, 6.483, 0.563, 0.518, 18.7, 285, 86.5, 16.37), (37, 6.241, 0.614, 0.559, 20.5, 260, 86.5, 21.7), 290, 213),
      15: ((37, 6.619, 0.577, 0.53, 50.8, 362, 88.3, 16.6), (38.5, 6.519, 0.704, 0.636, 45.4, 346, 88, 22.2), 358, 239),
      18: ((33, 6.211, 0.665, 0.601, 114, 399, 90.5, 15.7), (35, 6.074, 0.816, 0.62, 100, 435, 89, 21.7), 428, 264)}
for size, (d1, d2, cut, depth) in HD.items():
    for ohm, v in ((1, d1), (2, d2)):
        p = dict(zip(["fs_hz", "qms", "qes", "qts", "vas_l", "mms_g", "spl_db_1w1m", "bl_tm"], v)); p["xmax_mm"] = 21
        drivers.append(rec(f"HD{size}D{ohm}-V.2", size, "DVC", ohm, 2000, 4000, p, "unknown", cut_mm=cut, depth_mm=depth, status="current",
            sources=[src(CDN + "HD_Series_subwoofer.pdf", ["params", "peak_w", "cutout_mm", "mounting_depth_mm"], doc="maker specification sheet PDF (image)", page=2),
                     src(P + f"hd-{size}-subwoofer", ["rms_w"], doc="product page Specifications (RMS POWER)")],
            notes="Re and Sd not on the sheet. Cutout = sheet 'B' and mounting depth = sheet 'E' (both match the product page for the 12 in: 11.4 in and 8.38 in). ts_basis not stated."
                  + (" DATA PROBLEM: D2 Qts 0.62 contradicts Qms 6.074 / Qes 0.816 (calculated 0.719)." if (size, ohm) == (18, 2) else "")))
# XMAX series sheet (XMAX_Series_Subwoofer.pdf p.1), linked from the XMAXXX Monster 12 and 15 product pages. RMS from product page titles.
XM = {(12, 1): (31.9, 4.562, 0.415, 0.381, 24.263, 20, 313.335, 84.7, 23.33), (12, 2): (30.7, 5.344, 0.39, 0.364, 21.508, 20, 381.192, 85.9, 26.05),
      (15, 1): (30.78, 4.558, 0.427, 0.39, 43.717, 22.5, 534.718, 86.6, 22), (15, 2): (31.8, 3.067, 0.426, 0.374, 48.15, 22.5, 455.764, 87.5, 27.73)}
for (size, ohm), v in XM.items():
    p = dict(zip(["fs_hz", "qms", "qes", "qts", "vas_l", "xmax_mm", "mms_g", "spl_db_1w1m", "bl_tm"], v))
    rms, peak = (3000, 6000) if size == 12 else (4000, 8000)
    cut, depth = (290, 233) if size == 12 else (358, 275)
    drivers.append(rec(f"XMAXXX Monster {size} (XMAX {size}D{ohm})", size, "DVC", ohm, rms, peak, p, "unknown", cut_mm=cut, depth_mm=depth, status="current",
        sources=[src(CDN + "XMAX_Series_Subwoofer.pdf", ["params", "peak_w", "cutout_mm", "mounting_depth_mm"], doc="maker specification sheet PDF (image), titled 'XMAX SERIES'", page=1),
                 src(P + f"xmaxxx-monster-{size}-subwoofer", ["rms_w"], doc="product page title / Specifications")],
        notes="The product page links this 'XMAX SERIES' sheet; the sheet's max power (6000 / 8000 W) matches the page's peak. Re and Sd not on the sheet. Cutout = sheet 'B', mounting depth = sheet 'E' (letters as on HD sheet). ts_basis not stated."))
# VFL-COMP SIGNATURE (VFL_Comp_Subwoofers.pdf p.2): per-wiring rows. Tuple: imp, dcr, fs, sd(msqM), bl, qms, qes, qts, spl, vas, mms, xmax
VFL1 = {12: ((2, 1.6, 35.0, 51.1, 18.55, 4.389, 0.446, 0.405, 84.4, 17.1, 425.0, 27.5), (0.5, 0.4, 34.1, 51.1, 8.732, 4.967, 0.497, 0.452, 84.1, 17.2, 417.2, 27.5)),
        15: ((2, 1.6, 34.5, 77.9, 18.87, 4.394, 0.489, 0.440, 86.7, 36.6, 502.3, 27.5), (0.5, 0.4, 35.2, 77.9, 9.213, 4.855, 0.480, 0.437, 87.3, 38.3, 460.2, 27.5)),
        18: ((2, 1.6, 33.6, 113.4, 17.34, 4.494, 0.610, 0.537, 88.6, 88.5, 485.3, 27.5), (0.5, 0.4, 32.7, 113.4, 7.882, 5.280, 0.643, 0.573, 88.7, 89.1, 486.4, 27.5))}
VFL2 = {12: ((4, 3.2, 33.6, 51.1, 26.15, 3.968, 0.443, 0.398, 83.9, 18.5, 447.7, 27.5), (1, 0.8, 33.8, 51.1, 12.42, 4.425, 0.483, 0.435, 83.6, 18.7, 438.1, 27.5)),
        15: ((4, 3.2, 32.3, 77.9, 26.84, 4.123, 0.478, 0.428, 85.3, 39.6, 530.9, 27.5), (1, 0.8, 31.9, 77.9, 13.34, 4.413, 0.501, 0.450, 85.8, 38.6, 556.4, 27.5)),
        18: ((4, 3.2, 32.5, 113.4, 24.78, 4.257, 0.530, 0.471, 89.4, 88.0, 498.0, 27.5), (1, 0.8, 32.9, 113.4, 11.86, 4.938, 0.554, 0.498, 89.5, 90.6, 471.4, 27.5))}
VFLD = {12: (288, 10.9), 15: (350, 13.5), 18: (420, 15.9)}
for ohm, tab in ((1, VFL1), (2, VFL2)):
    for size, (ser, par) in tab.items():
        cut, disp = VFLD[size]
        per_wiring(f"VFL-COMP SIGNATURE {size}D{ohm}", size, ohm, 5000, 10000, ser, par, "VFL_Comp_Subwoofers.pdf", f"vfl-comp-signature-{size}-subwoofer",
                   "Peak 10000 W from the sheet's feature list. Cutout = sheet 'Diameter C', displacement = 'Vd' (dimension table read from a lower-resolution render; check). Xmech 45 mm, air gap height 25 mm.",
                   cut=cut, disp=disp)
# KING 18 (American_Bass_King_18.pdf p.3): D1 only on the sheet. Sd printed '1.19k' (cm2 assumed, 1190).
add("KING-18D1", 18, 1, 6500, 15000, (1.6, 43.07, 1190, 21, 6.9, 0.87, 0.77, 86.3, 30.4, 910, 22.5), "American_Bass_King_18.pdf", P + "king-18-subwoofer",
    "Sheet p.3 gives only the D1 column; Sd printed as '1.19k' (taken as 1190 cm2). SPL, Vas, MMS, Xmax read from a lower-resolution render (p.3 lower half); check. "
    "Sheet dimensions A 460, B 335, C 428, D 160 mm are drawing letters (not mapped). ts_basis not stated; Re 1.6 for Dual 1 suggests series (inference). "
    "Note Vas 30.4 L with Sd 1190 cm2 and Cms 14.99 µm/N on the same sheet is consistent (about 30 L).")
# XMAXXX Monster 18 sheet (p.3) repeats the 12/15 columns (identical to XMAX_Series_Subwoofer.pdf) and adds 18D1/18D2.
for ohm, v in ((1, (31.76, 5.55, 0.59, 0.53, 53.57, 22.5, 855, 86.5, 23.95)), (2, (32.5, 6.17, 0.47, 0.43, 46.98, 22.5, 929, 87.2, 38.12))):
    p = dict(zip(["fs_hz", "qms", "qes", "qts", "vas_l", "xmax_mm", "mms_g", "spl_db_1w1m", "bl_tm"], v))
    drivers.append(rec(f"XMAXXX Monster 18 (XMAX 18D{ohm})", 18, "DVC", ohm, 4000, 8000, p, "unknown", cut_mm=428, depth_mm=293, status="current",
        sources=[src(CDN + "American_Bass_XMAXXX_Monster_18_Specification_Sheet_1.pdf", ["params", "peak_w", "cutout_mm", "mounting_depth_mm"], doc="maker specification sheet PDF (image)", page=3),
                 src(P + "xmaxxx-monster-18-subwoofer", ["rms_w"], doc="product page title")],
        notes="Re and Sd not on the sheet. Cutout = sheet 'B' 428 mm, mounting depth = sheet 'E' 293 mm. ts_basis not stated."))
no_ts = [{"model": "Godzilla 12 / 15 / 18 (D1, D2)", "rms_w": 4700, "url": P + "godzilla-15-subwoofer", "note": "4700 W RMS on the product pages; no spec sheet or T/S found on the pages (2026-11-21)."},
         {"model": "VFL 8 (refurbished listing only)", "rms_w": None, "url": P + "vfl-8-subwoofer-refurbished", "note": "Not checked further (refurbished listing; power figure in text is ambiguous)."}]
save("american-bass", "American Bass", "https://americanbassusa.com",
     "Shopify store (public /products.json used to list products, then each linked spec-sheet PDF on cdn.shopify.com read once, 5 s apart). No terms forbidding this found (not read in full). Spec sheets are image PDFs: values transcribed by eye from renders; see notes for any low-resolution reads.",
     drivers, no_ts)
