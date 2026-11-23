#!/usr/bin/env python3
"""A2: Massive Audio (Los Angeles, CA) records. T/S transcribed by eye from maker user-guide PDFs (cdn.shopify.com/s/files/1/0658/1297/files/...),
linked from massiveaudio.com product pages; read 2026-11-21. These sheets give values for one coil ('Individual'), coils in parallel and in series."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
CDN = "https://cdn.shopify.com/s/files/1/0658/1297/files/"
PG = "https://www.massiveaudio.com/products/"
drivers, no_ts = [], []
def add3(model, size, ohm, rms, peak, common, ind, par, ser, pdf, page, slug, extra, **kw):
    # ind/par/ser = (qes, re, le, bl, qts, spl_1w)
    def mk(t): 
        p = dict(common); p.update(dict(zip(["qes", "re_ohm", "le_mh", "bl_tm", "qts", "spl_db_1w1m"], t))); return p
    r = rec(model, size, "DVC", ohm, rms, peak, mk(ind), "per_coil", status="current",
            sources=[src(CDN + pdf, ["params", "params_parallel", "params_series", "rms_w", "peak_w", "mounting_depth_mm", "cutout_mm", "displacement_l"], doc="maker user guide PDF (image), Specifications", page=page),
                     src(PG + slug, ["status"], doc="product page (links the PDF)")],
            notes="Sheet gives columns 'Individual' (one coil), 'Parallel' and 'Series': params = Individual; the other two are in params_parallel / params_series. Sd printed in sq.m, entered x10000 as cm2. " + extra, **kw)
    blank = {k: None for k in r["params"]}
    r["params_parallel"] = dict(blank, **mk(par)); r["params_series"] = dict(blank, **mk(ser)); drivers.append(r)
# Hippo XR (HIPPO_H122XR-H124XR-H152XR_manual.pdf p.2, dimensions p.1/p.2 drawings)
add3("H122XR", 12, 2, 3000, 6000, dict(fs_hz=43, qms=2.424, vas_l=14.533, mms_g=377.339, xmax_mm=21, sd_cm2=530), (0.697, 2, 0.802, 17.1, 0.541, 84.18), (0.382, 1, 0.788, 16.265, 0.33, 86.8), (0.374, 4, 3.923, 33.02, 0.324, 86.89),
     "HIPPO_H122XR-H124XR-H152XR_manual.pdf", "2", "h122xr-12-3000-watts-rms-dual-2-ohm-3-v-c-mega-subwoofer",
     "Xmech 42 mm. Ported boxes from p.1 (small 1.6 cu ft Fb 29.2 Hz, large 2.4 cu ft Fb 26.2 Hz). The product page (2026-11-21) repeats Fs 43, Qms 2.424, Vas 14.533 and says web values supersede the manual.",
     depth_mm=225.3, cut_mm=281.04, disp_cuft=0.16, boxes=[box("ported (small)", 1.6, 29.2, "maker user guide p.1"), box("ported (large)", 2.4, 26.2, "maker user guide p.1")])
add3("H124XR", 12, 4, 3000, 6000, dict(fs_hz=43.087, qms=3.119, vas_l=16.841, mms_g=324.295, xmax_mm=21.6, sd_cm2=530), (0.942, 3.2, 1.069, 17.27, 0.724, 83.54), (0.471, 1.6, 1.076, 17.27, 0.402, 86.55), (0.49, 6.4, 5.434, 33.86, 0.422, 86.38),
     "HIPPO_H122XR-H124XR-H152XR_manual.pdf", "2", "h124xr-12-3000-watts-rms-dual-4-ohm-4-v-c-mega-70-lbs-subwoofer",
     "Dual 4 ohm: parallel gives 2 ohm (meets the 2 ohm criterion). Xmech 43.2 mm. DATA PROBLEM: parallel Bl equals the individual Bl (17.27) while H122XR/H152XR show the expected small drop; series Bl 33.86 is about 2x as expected.",
     depth_mm=225.3, cut_mm=281.04)
add3("H152XR", 15, 2, 3000, 6000, dict(fs_hz=41.279, qms=2.882, vas_l=45.207, mms_g=325.33, xmax_mm=21, sd_cm2=834), (0.864, 2, 0.786, 13.972, 0.664, 87.7), (0.445, 1, 0.777, 13.77, 0.379, 90.58), (0.456, 4, 3.775, 27.2, 0.391, 90.47),
     "HIPPO_H122XR-H124XR-H152XR_manual.pdf", "2", "h152xr-15-3000-watts-rms-dual-2-ohm-4-v-c-mega-subwoofer",
     "Xmech printed 24.1 mm (barely above Xmax 21; possible typo). Mounting depth 10 in and cutout 13.9 in from p.1 text block (order of values as printed: depth, mounting diameter 15.5 in, cutout, weight, displacement 0.23 cu ft); check.",
     depth_in=10, cut_in=13.9, disp_cuft=0.23)
# Hippo X (HIPPO_H104X-H124-H124X-H122X-H152X-H154X-_manual.pdf p.2). H124 (1500 W) excluded. Dimensions on the drawings are too small to read reliably: left null.
HX = [("H104X", 10, 4, "h104x-10-2000-watts-rms-dual-4-ohm-3-v-c-mega-subwoofer", dict(fs_hz=49.682, qms=3.722, vas_l=5.713, mms_g=342.519, xmax_mm=20.5, sd_cm2=366.44),
       (1.17, 3.2, 0.87, 17.099, 0.89, 79.8), (0.599, 1.6, 0.86, 16.89, 0.506, 82.7), (0.614, 6.4, 4.004, 33.38, 0.524, 82.6),
       "Sd printed '366.44' with unit sq.m (evidently cm2; entered as 366.44 cm2, not x10000). Dual 4 ohm: parallel gives 2 ohm. Xmech 23.6 mm."),
      ("H124X", 12, 4, "h124x-2000-watts-3-v-c-mega-subwoofer", dict(fs_hz=38, qms=2.481, vas_l=23.875, mms_g=236.1, xmax_mm=20.5, sd_cm2=530),
       (0.878, 3.2, 1.027, 15.15, 0.648, 85.2), (0.43, 1.6, 1.015, 15.32, 0.365, 88.3), (0.49, 6.4, 4.984, 28.7, 0.407, 87.8), "Dual 4 ohm: parallel gives 2 ohm. Xmech 23.6 mm."),
      ("H122X", 12, 2, "h122x-12-2000-watts-rms-dual-2-ohm-3-v-c-mega-subwoofer", dict(fs_hz=38, qms=2.309, vas_l=20.642, mms_g=284, xmax_mm=20.5, sd_cm2=530),
       (0.687, 1.8, 0.685, 13.95, 0.53, 85.4), (0.389, 0.9, 0.683, 13.02, 0.334, 87.8), (0.424, 3.6, 3.382, 25.18, 0.35, 87.4), "Xmech 23.5 mm."),
      ("H152X", 15, 2, "h152x-15-2000-watts-rms-dual-2-ohm-3-v-c-mega-subwoofer", dict(fs_hz=39.585, qms=2.211, vas_l=51.098, mms_g=312.976, xmax_mm=20, sd_cm2=835),
       (1.013, 1.8, 0.609, 11.76, 0.695, 86.94), (0.497, 0.9, 0.603, 11.87, 0.398, 90.04), (0.599, 3.6, 4.373, 21.63, 0.484, 88.84), "Xmech 40 mm. Product page repeats Fs 39.5, Qms 2.211, Vas 51.098 L, Mms 312.97 g."),
      ("H154X", 15, 4, "h154x-15-2000-watts-rms-dual-4-ohm-3-v-c-mega-subwoofer", dict(fs_hz=37.323, qms=2.154, vas_l=60.456, mms_g=297.571, xmax_mm=20.5, sd_cm2=834),
       (1.107, 3.2, 0.939, 14.2, 0.731, 86.52), (0.615, 1.6, 0.922, 13.47, 0.49, 89.07), (0.599, 6.4, 4.373, 27.3, 0.47, 89.19), "Dual 4 ohm: parallel gives 2 ohm. Xmech 41 mm. Series Le 4.373 mH is identical to H152X series Le (possible copy).")]
for model, size, ohm, slug, common, ind, par, ser, extra in HX:
    if model != "H104X": common = dict(common)
    add3(model, size, ohm, 2000, 4000, common, ind, par, ser, "HIPPO_H104X-H124-H124X-H122X-H152X-H154X-_manual.pdf", "2", slug, extra)
    if model == "H104X":  # Sd not x10000 here: fix note consistency
        drivers[-1]["notes"] = drivers[-1]["notes"].replace("Sd printed in sq.m, entered x10000 as cm2. ", "")
# BOA (BOA_SERIES_2021_MANUAL.pdf p.2 T/S; p.1 text dimensions). All Dual 1 ohm, 6000 W RMS / 12000 W peak. Ind/Par/Ser = (qes, re, le, bl, qts, spl_1w)
BOA = [("BOA121", 12, "boa151", dict(fs_hz=39, qms=7.08, vas_l=11.8, mms_g=401.2, xmax_mm=25, sd_cm2=450), (1.06, 0.9, 0.57, 9.2, 0.92, 87), (0.62, 0.5, 0.58, 8.9, 0.57, 88.5), (0.61, 1.9, 0.59, 17.6, 0.56, 88.7), (10, 11.02, 0.232), "Xmech 62.5 mm."),
       ("BOA151", 15, "boa151", dict(fs_hz=34, qms=6.69, vas_l=35.5, mms_g=473.9, xmax_mm=25, sd_cm2=750), (1.23, 1, 0.57, 9.2, 1.04, 88), (0.64, 0.5, 0.58, 9.4, 0.59, 89), (0.67, 2, 0.6, 17.5, 0.62, 89.5), (11.26, 14.06, 0.424), "Xmech 62.5 mm."),
       ("BOA181", 18, "boa181-18-inch-subwoofer", dict(fs_hz=30, qms=8.471, vas_l=89.54, mms_g=570, xmax_mm=25, sd_cm2=1130), (0.39, 1, 0.57, 16.6, 0.373, 89.91), (0.18, 0.5, 0.58, 17.29, 0.176, 93.28), (0.215, 2, 0.6, 31.59, 0.21, 92.49), (12.56, 16.79, 0.31), "Xmech 37.5 mm. DATA PROBLEM: BOA181 has much higher Bl (16.6 per coil) than BOA121/151 (9.2) with the same coil description; Vd 2.825 L vs 6.78 L for the 15 in (sheet as printed)."),
       ("BOA121N", 12, "boa121-n-12-inch-6000-watts-1-ohm-mega-neodymium-subwoofer", dict(fs_hz=56, qms=2.2, vas_l=17, mms_g=35.1, xmax_mm=13, sd_cm2=540), (0.398, 0.9, 0.39, 17, 0.338, 88), (0.19, 0.5, 0.39, 18, 0.172, 88.7), (0.202, 1.9, 1.88, 33, 0.204, 89), (10.75, 11.1, 0.253), "Neodymium. Xmech 46.5 mm. DATA PROBLEM: Mms printed 35.1 g is implausible for a 12 in high-power sub (likely 351 g)."),
       ("BOA151N", 15, "boa151-n-15-inch-car-subwoofer", dict(fs_hz=42, qms=2.1, vas_l=25, mms_g=529, xmax_mm=13, sd_cm2=750), (0.39, 1, 0.403, 19.12, 0.33, 89), (0.195, 0.5, 0.409, 18.63, 0.176, 92.6), (0.228, 2, 1.988, 34.81, 0.21, 92), (11.93, 14.17, 0.457), "Neodymium. Xmech 46.5 mm.")]
for model, size, slug, common, ind, par, ser, (dep, cut, disp), extra in BOA:
    add3(model, size, 1, 6000, 12000, common, ind, par, ser, "BOA_SERIES_2021_MANUAL.pdf", "2 (T/S), 1 (dimensions)", slug,
         extra + " Sheet power per coil 3000 W ('Individual' Pe); 6000 W parallel/series." + (" No product page matched BOA121 exactly; the BOA151 page (which links the same manual) is cited." if model == "BOA121" else ""),
         depth_in=dep, cut_in=cut, disp_cuft=disp)
# HippoXL (HIPPOXL_USER_GUIDE_2020_Combined.pdf p.3: Parallel and Series columns). For 122, 152, 122R the product pages also print T/S and say
# 'T/S Parameters on website supersede user manual specifications': those web values are used as params (their Re equals the guide's series Re).
def addxl(model, size, ohm, rms, peak, common, par, ser, slug, extra, web=None):
    def mk(t):
        p = dict(common); p.update(dict(zip(["qes", "re_ohm", "le_mh", "bl_tm", "qts", "spl_db_1w1m"], t))); return p
    params = web if web else mk(ser)
    srcs = [src(CDN + "HIPPOXL_USER_GUIDE_2020_Combined.pdf", ["params_parallel", "params_series"] + ([] if web else ["params"]) + ["rms_w", "peak_w"], doc="maker user guide PDF (image), Specifications", page=3)]
    if web: srcs.insert(0, src(PG + slug, ["params"], doc="product page T/S block (states web values supersede the manual)"))
    r = rec(model, size, "DVC", ohm, rms, peak, params, "series", status="current", sources=srcs,
            notes=("params = product-page values (Re equals the guide's series Re, so taken as series basis). " if web else "params = guide 'Series' column. ")
                  + "Guide Parallel and Series columns in params_parallel / params_series (shared mechanical values copied into both). Sd printed in sq.m, entered x10000 as cm2. " + extra)
    blank = {k: None for k in r["params"]}
    r["params_parallel"] = dict(blank, **mk(par)); r["params_series"] = dict(blank, **mk(ser)); drivers.append(r)
addxl("HIPPOXL102", 10, 2, 2000, 4000, dict(fs_hz=48, qms=5.62, vas_l=7.74, mms_g=263, xmax_mm=17.5, sd_cm2=360), (0.535, 0.9, 0.4373, 11.59, 0.488, 84.03), (0.561, 3.6, 1.423, 22.59, 0.51, 83.83),
      "hippoxl102-mega-subwoofer", "Guide 'Pe' row shows 1500 W while Watts RMS is 2000 W (sheet inconsistency). Xmech 26.25 mm.")
addxl("HIPPOXL104", 10, 4, 2000, 4000, dict(fs_hz=52, qms=6.139, vas_l=7.744, mms_g=223.6, xmax_mm=17.5, sd_cm2=360), (0.708, 1.6, 0.5969, 12.89, 0.635, 84.03), (0.709, 6.4, 1.883, 25.68, 0.635, 83.83),
      "hippoxl104-10-inch-2000-watts-4-ohm-mega-subwoofer", "Dual 4 ohm: parallel gives 2 ohm. Guide 'Pe' 1500 W vs 2000 W RMS. SPL rows identical to HIPPOXL102 (possible copy). Xmech 26.25 mm.")
addxl("HIPPOXL124", 12, 4, 2000, 4000, dict(fs_hz=45.32, qms=5.468, vas_l=14.621, mms_g=332.165, xmax_mm=17.5, sd_cm2=530), (0.587, 1.6, 2.368, 14.571, 0.481, 86.3), (0.506, 6.4, 7.245, 27.223, 0.464, 86.4),
      "hippoxl124", "Dual 4 ohm: parallel gives 2 ohm. No product page found in the store listing for HIPPOXL124 (guide only; status unknown). Xmech 45 mm.")
drivers[-1]["status"] = "unknown"; drivers[-1]["sources"] = [s for s in drivers[-1]["sources"] if "products/" not in s["url"]]
addxl("HIPPOXL122", 12, 2, 2000, 4000, dict(fs_hz=46.203, qms=7.983, vas_l=14.202, mms_g=334.435, xmax_mm=17.5, sd_cm2=530), (0.477, 0.9, 1.683, 14.958, 0.450, 86.6), (0.446, 3.6, 6.123, 29.939, 0.450, 86.8),
      "hippoxl122-12-inch-2000-watts-2-ohm-mega-subwoofer", "Guide and web differ (web Fs 44.71, Qms 5.46, Qes 0.388; guide series Fs 46.203, Qms 7.983, Qes 0.446).",
      web=dict(fs_hz=44.71, re_ohm=3.6, le_mh=9.8, bl_tm=30.49, qms=5.46, qes=0.388, qts=0.364, vas_l=14.22, mms_g=356.7, sd_cm2=530, xmax_mm=17.5))
addxl("HIPPOXL152", 15, 2, 2000, 4000, dict(fs_hz=43.089, qms=4.437, vas_l=30.194, mms_g=480.854, xmax_mm=17.5, sd_cm2=804), (0.428, 0.9, 1.741, 17.423, 0.391, 88.6), (0.749, 3.6, 7.246, 26.368, 0.672, 88.8),
      "hippoxl152-15-inch-2000-watts-2-ohm-mega-subwoofer", "DATA PROBLEM: web Qts 0.511 contradicts web Qms 5.15 / Qes 0.8 (calculated 0.692). Web Fs 38.34 vs guide 43.089.",
      web=dict(fs_hz=38.34, re_ohm=3.6, le_mh=8.46, bl_tm=27.84, qms=5.15, qes=0.8, qts=0.511, vas_l=31.25, mms_g=506.7, sd_cm2=804, xmax_mm=17.5))
addxl("HIPPOXL122R", 12, 2, 3000, 6000, dict(fs_hz=44.712, qms=5.968, vas_l=14.218, mms_g=356.707, xmax_mm=22, sd_cm2=530), (0.424, 0.9, 5.572, 14.693, 0.397, 86.1), (0.388, 3.6, 9.876, 30.493, 0.364, 86.3),
      "hippoxl122r-12-3000-watts-4-v-c-mega-subwoofer", "DATA PROBLEM: web block prints Re 6.4 ohm for this Dual 2 ohm model (guide series Re 3.6); web Re kept as printed. Xmech 35 mm.",
      web=dict(fs_hz=45.32, re_ohm=6.4, le_mh=7.24, bl_tm=34.55, qms=5.46, qes=0.507, qts=0.46, vas_l=14.62, mms_g=332.2, sd_cm2=530, xmax_mm=22))
addxl("HIPPOXL152R", 15, 2, 3000, 6000, dict(fs_hz=41.068, qms=5.150, vas_l=31.246, mms_g=506.721, xmax_mm=22, sd_cm2=804), (0.417, 0.9, 5.460, 15.608, 0.393, 86.8), (0.567, 3.6, 8.460, 31.563, 0.398, 82.0),
      "hippoxl152r-15-inch-3000-watts-2-ohm-mega-subwoofer", "DATA PROBLEM: series Qts 0.398 contradicts Qms 5.150 / Qes 0.567 (calculated 0.511); Xmech printed 356 mm (typo). No T/S on the product page.")
no_ts = [{"model": f"BOA{m}R (8000 W RMS)", "rms_w": 8000, "url": PG + h, "note": "No T/S or spec PDF on the product page (2026-11-21)."} for m, h in
         [("102", "boa102r-10-8-000-watts-rms-dual-2-ohm-mega-subwoofer-caution-85-pounds-special-handling-required"), ("121", "boa121r-12-8-000-watts-rms-dual-1-ohm-mega-subwoofer-caution-100-pounds-special-handling-required"),
          ("122", "boa122r-12-8-000-watts-rms-dual-2-ohm-mega-subwoofer-caution-132-pounds-special-handling-required"), ("151", "boa151r-15-8000-watts-rms-dual-1-ohm-mega-subwoofer"),
          ("152", "boa152r-15-8-000-watts-rms-dual-2-ohm-mega-subwoofer"), ("182", "boa182r-18-8-000-watts-rms-dual-2-ohm-mega-subwoofer")]]
no_ts += [{"model": "BOA181NV2 (6000 W RMS, Dual 1)", "rms_w": 6000, "url": PG + "boa181nv2-18-6-000-watts-rms-dual-1-ohm-mega-neodymium-subwoofer", "note": "Links the 2021 BOA manual, which has no 181N column."},
          {"model": "HIPPO124 (title '4000w')", "rms_w": None, "url": PG + "hippo124-4000w-dual-4-ohm", "note": "Text says coils 'hold 4000 Watts'; RMS not clearly stated; no T/S."}]
save("massive-audio", "Massive Audio", "https://www.massiveaudio.com",
     "Shopify store; public /products.json read once; user-guide PDFs on cdn.shopify.com read once each, 5 s apart. Product pages carry a purchase 'Terms and Conditions' (warranty exclusion), no clause on reading found. Guides are image PDFs: values transcribed by eye.",
     drivers, no_ts)
