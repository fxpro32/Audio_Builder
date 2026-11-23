#!/usr/bin/env python3
"""A2: Sundown Audio records, transcribed by hand from sundownaudio.com product pages read 2026-11-21 (raw copies in references/raw/hp_subs/us/sundown/)."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
B = "https://sundownaudio.com/products/"
SDN = (" DATA PROBLEM (all Sundown pages with Sd): Sd equals the area of a circle of the nominal size (10 in: 506.6, 12 in: 735.5, 15 in: 1141.9, 18 in: 1641.9 cm2), "
       "larger than a real piston area; with the published Vas and Mms it gives an Fs 30 to 60 % above the published Fs. Treat Sd (and SPL/Vd derived from it) with caution.")
SER = "ts_basis not stated on the page; Re is about twice the nominal coil impedance, which suggests both coils in series (inference only)."
drivers = []
def tbl(model, size, coils, url, rms, peak, cols, dims, boxes, status, extra_note="", fields_note=None):
    # cols: {ohm: {param: value}}
    for ohm, p in cols.items():
        n = SER + (" " + extra_note if extra_note else "") + (SDN if p.get("sd_cm2") else "")
        drivers.append(rec(f"{model} D{ohm}", size, "DVC", ohm, rms, peak, p, "unknown", boxes=boxes, status=status,
                           sources=[src(B + url, doc="product page, Specifications / Enclosure Specs tabs")], notes=n, **dims))
bx = lambda u, ported, tune, s4=None, p4=None, sealed=None: [b for b in [
    box("ported", ported, tune, "maker page " + u, note="maker: sealed not recommended" if sealed is None else None),
    box("sealed", sealed, None, "maker page " + u) if sealed else None,
    box("4th order bandpass, sealed chamber", s4, None, "maker page " + u) if s4 else None,
    box("4th order bandpass, ported chamber", p4, None, "maker page " + u, note="4th-order tuning not published (port area and 8 in port length are)") if p4 else None] if b]
# --- X v.4 (current, 2750 W RMS / 5500 W peak)
for size, url, D1, D2, dims, (pv, s4, p4) in [
 (12, "x-series-xv4-12-3000w-rms-subwoofer",
  dict(fs_hz=39.39, re_ohm=2.05, qms=4.95, qes=0.58, qts=0.50, mms_g=343.14, sd_cm2=735.5, vas_l=14.13, spl_db_1w1m=83.47, bl_tm=24.4, le_mh=1.33, xmax_mm=30),
  dict(fs_hz=36.06, re_ohm=3.25, qms=4.82, qes=0.54, qts=0.49, mms_g=367.13, sd_cm2=735.5, vas_l=15.75, spl_db_1w1m=83.06, bl_tm=22.25, le_mh=2.60, xmax_mm=30),
  dict(depth_in=11.75, cut_in=11.09, disp_cuft=0.23), (2.5, 1.0, 3.0)),
 (10, "x-series-xv4-10-3000w-rms-subwoofer",
  dict(fs_hz=41.37, re_ohm=3.20, qms=5.07, qes=0.58, qts=0.52, mms_g=341.70, sd_cm2=506.6, vas_l=8.24, spl_db_1w1m=81.76, bl_tm=22.19, le_mh=2.68, xmax_mm=30),
  dict(fs_hz=37.04, re_ohm=3.74, qms=3.99, qes=0.46, qts=0.41, mms_g=396.92, sd_cm2=506.6, vas_l=8.38, spl_db_1w1m=81.5, bl_tm=27.41, xmax_mm=30),
  dict(depth_in=11.0, cut_in=10.01, disp_cuft=0.22), (1.5, 0.75, 2.25)),
 (15, "x-series-xv4-15-3000w-rms-subwoofer",
  dict(fs_hz=29.91, re_ohm=3.20, qms=4.87, qes=0.55, qts=0.49, mms_g=457.51, sd_cm2=1141.9, vas_l=31.43, spl_db_1w1m=85.29, bl_tm=22.32, le_mh=2.57, xmax_mm=30),
  dict(fs_hz=29.51, re_ohm=3.74, qms=4.08, qes=0.49, qts=0.44, mms_g=538.24, sd_cm2=1141.9, vas_l=40.41, spl_db_1w1m=85.1, bl_tm=27.44, xmax_mm=30),
  dict(depth_in=12.95, cut_in=13.93, disp_cuft=0.26), (4.25, 2.0, 6.0)),
 (18, "x-series-xv4-18-3000w-rms-subwoofer",
  dict(fs_hz=25.87, re_ohm=2.05, qms=4.13, qes=0.63, qts=0.54, mms_g=737.81, sd_cm2=1641.9, vas_l=93.67, spl_db_1w1m=86.0, bl_tm=19.74, xmax_mm=30),
  dict(fs_hz=25.58, re_ohm=3.74, qms=4.03, qes=0.55, qts=0.84, mms_g=656.74, sd_cm2=1641.9, vas_l=17.58, spl_db_1w1m=87.0, bl_tm=26.8, xmax_mm=30),
  dict(depth_in=15.0, cut_in=16.69, disp_cuft=0.28), (7.0, 3.0, 9.0))]:
    tbl(f"X v.4 {size} (Xv4-{size})", size, 2, url, 2750, 5500, {1: D1, 2: D2}, dims, bx(url, pv, 32, s4, p4), "current",
        "Page title says 3000W but the spec table and text say 2750 W RMS / 5500 W peak; table values used. Le not published for D2 where null." +
        (" DATA PROBLEM: D2 Qts 0.84 contradicts Qms 4.03 / Qes 0.55 (calculated Qts 0.484), and D2 Vas 17.58 L is implausible beside D1 93.67 L for the same cone; check with the maker." if size == 18 else "") +
        (" DATA PROBLEM: D1 Re 3.20 ohm is high for a dual 1 ohm sub (other D1 models 1.8 to 2.3); check." if size in (10, 15) else ""))
# --- Z v.7 (current, 3500 / 7000)
for size, url, D1, D2, dims, (pv, s4, p4) in [
 (12, "z-series-zv7-12",
  dict(fs_hz=29.22, re_ohm=2.08, qms=5.466, qes=0.399, qts=0.372, mms_g=605.51, sd_cm2=735.5, vas_l=14.55, spl_db_1w1m=87.18, bl_tm=24.05, le_mh=1.99, xmax_mm=42),
  dict(fs_hz=31.52, re_ohm=4.14, qms=5.76, qes=0.407, qts=0.380, mms_g=596.29, sd_cm2=735.5, vas_l=12.70, spl_db_1w1m=84.99, bl_tm=34.679, le_mh=4.15, xmax_mm=42),
  dict(depth_in=12.76, cut_in=11.09, disp_cuft=0.26), (2.5, 1.0, 3.0)),
 (15, "z-series-zv7-15-subwoofer",
  dict(fs_hz=30.82, re_ohm=1.96, qms=5.919, qes=0.412, qts=0.385, mms_g=606.05, sd_cm2=1141.9, vas_l=33.27, spl_db_1w1m=91.58, bl_tm=23.647, le_mh=1.83, xmax_mm=42),
  dict(fs_hz=30.40, re_ohm=3.84, qms=5.607, qes=0.364, qts=0.342, mms_g=582.89, sd_cm2=1141.9, vas_l=35.56, spl_db_1w1m=89.32, bl_tm=34.26, le_mh=3.72, xmax_mm=42),
  dict(depth_in=13.94, cut_in=13.93, disp_cuft=0.29), (4.0, 2.0, 6.0)),
 (18, "z-series-zv7-18-subwoofer",
  dict(fs_hz=23.48, re_ohm=2.03, qms=6.282, qes=0.462, qts=0.433, mms_g=858.08, sd_cm2=1641.9, vas_l=98.84, spl_db_1w1m=92.11, bl_tm=23.588, le_mh=2.04, xmax_mm=42),
  dict(fs_hz=27.25, re_ohm=3.97, qms=6.365, qes=0.451, qts=0.421, mms_g=756.36, sd_cm2=1641.9, vas_l=94.97, spl_db_1w1m=91.07, bl_tm=33.742, le_mh=4.03, xmax_mm=42),
  dict(depth_in=15.61, cut_in=16.68, disp_cuft=0.34), (7.0, 3.0, 9.0))]:
    tbl(f"Z v.7 {size} (Zv7-{size})", size, 2, url, 3500, 7000, {1: D1, 2: D2}, dims, bx(url, pv, 32, s4, p4), "current", "Xmech 77.5 mm published.")
# --- M series (current, 2000 / 4000)
for size, url, D1, D2, dims, (pv, sealed, s4, p4) in [
 (10, "m-series-m10-1750w-subwoofer",
  dict(re_ohm=2.27, fs_hz=37.8, qms=4.931, qes=0.789, qts=0.680, vas_l=7.669, mms_g=439.50, bl_tm=17.339, le_mh=1.89, sd_cm2=506.6, xmax_mm=35, spl_db_1w1m=79.0),
  dict(re_ohm=4.19, fs_hz=37.7, qms=4.847, qes=0.761, qts=0.658, vas_l=7.793, mms_g=434.53, bl_tm=23.82, le_mh=3.68, sd_cm2=506.6, xmax_mm=35, spl_db_1w1m=79.1),
  dict(depth_in=10.09, cut_in=10.01, disp_cuft=0.20), (1.5, 1.75, 0.75, 2.25)),
 (12, "m-series-m12-1750w-subwoofer-1",
  dict(re_ohm=2.22, fs_hz=31.9, qms=4.654, qes=0.696, qts=0.606, vas_l=39.313, mms_g=477.93, bl_tm=17.484, le_mh=1.95, sd_cm2=735.5, xmax_mm=35, spl_db_1w1m=84.4),
  dict(re_ohm=4.07, fs_hz=32.7, qms=4.768, qes=0.686, qts=0.600, vas_l=15.060, mms_g=466.63, bl_tm=23.84, le_mh=3.64, sd_cm2=735.5, xmax_mm=35, spl_db_1w1m=80.6),
  dict(depth_in=10.88, cut_in=11.09, disp_cuft=0.21), (2.5, 2.0, 1.0, 3.0)),
 (15, "m-series-m12-1750w-subwoofer",
  dict(re_ohm=2.10, fs_hz=28.2, qms=5.232, qes=0.720, qts=0.633, vas_l=43.142, mms_g=558.91, bl_tm=17.006, le_mh=1.83, sd_cm2=1141.9, xmax_mm=35, spl_db_1w1m=83.0),
  dict(re_ohm=4.11, fs_hz=28.6, qms=5.233, qes=0.705, qts=0.622, vas_l=43.385, mms_g=541.08, bl_tm=23.799, le_mh=3.65, sd_cm2=1141.9, xmax_mm=35, spl_db_1w1m=83.3),
  dict(depth_in=12.06, cut_in=13.93, disp_cuft=0.23), (4.25, 3.5, 2.0, 6.0)),
 (18, "m-series-m18-1750w-subwoofer",
  dict(re_ohm=2.12, fs_hz=26.2, qms=5.452, qes=0.782, qts=0.684, vas_l=112.182, mms_g=651.24, bl_tm=17.044, le_mh=1.80, sd_cm2=1641.9, xmax_mm=35, spl_db_1w1m=85.8),
  dict(re_ohm=4.12, fs_hz=25.7, qms=5.379, qes=0.740, qts=0.650, vas_l=117.530, mms_g=638.99, bl_tm=24.026, le_mh=3.55, sd_cm2=1641.9, xmax_mm=35, spl_db_1w1m=86.1),
  dict(depth_in=14.05, cut_in=16.68, disp_cuft=0.25), (7.0, None, 3.0, 9.0))]:
    note = "Xmech 59.5 mm published. URL handle says 1750w but the page title and table say 2000 W RMS / 4000 W peak."
    if size == 12: note += " DATA PROBLEM: D1 Vas 39.313 L vs D2 15.060 L with near-identical Fs/Mms/Sd; one is likely a typo (Cms 0.05 mm/N for both gives about 38 L). Check."
    if size == 18: note += " Maker sealed volume published as a range 5 to 6 cu ft (not entered as a single box)."
    if size == 10: note += " Sealed volume cell reads 'Ported=1.5 cu ft -->1.75 CU FT'; entered as sealed 1.75 cu ft."
    tbl(f"M {size} (M{size})", size, 2, url, 2000, 4000, {1: D1, 2: D2}, dims, bx(url, pv, 32, s4, p4, sealed), "current", note)
# --- Nightshade NS v.6 (12, 15 pages show T/S; 3000 W on these pages, title shows 3500W)
for size, url, D1, D2, dims, pv, pa in [
 (12, "nightshade-ns-series-ns6-12-3000w-subwoofer-ns-v-6-used",
  dict(re_ohm=1.8468, fs_hz=37.6157, vas_l=11.7603, qes=0.4665, qms=5.0189, qts=0.4268, le_mh=1.6495, bl_tm=20.5703, mms_g=452.2261, spl_db_1w1m=83.0242, xmax_mm=35),
  dict(re_ohm=3.3377, fs_hz=37.1375, vas_l=11.8372, qes=0.4388, qms=5.2560, qts=0.4050, le_mh=3.1147, bl_tm=28.6043, mms_g=460.9337, spl_db_1w1m=83.1522, xmax_mm=35),
  dict(depth_in=12.75, cut_in=11.19, disp_cuft=0.24), 2.5, 38),
 (15, "nightshade-ns-series-ns6-15-3000w-subwoofer-ns-v-6-used",
  dict(re_ohm=1.8398, fs_hz=30.5930, vas_l=37.0627, qes=0.4382, qms=5.3509, qts=0.4050, le_mh=1.6641, bl_tm=21.1132, mms_g=552.2849, spl_db_1w1m=85.5892, xmax_mm=35),
  dict(re_ohm=3.5978, fs_hz=30.8881, vas_l=36.0601, qes=0.4133, qms=5.4272, qts=0.3841, le_mh=3.4904, bl_tm=30.6711, mms_g=556.8450, spl_db_1w1m=85.8487, xmax_mm=35),
  dict(depth_in=13.91, cut_in=13.93, disp_cuft=0.26), 4.0, 60)]:
    tbl(f"Nightshade NS v.6 {size}", size, 2, url, 3000, None, {1: D1, 2: D2}, dims, [box("ported", pv, 32, "maker page " + url, note="maker: sealed not recommended")],
        "current", "Read from the maker's used-stock page (same model). Page text says 3,000 W RMS; image captions say 3500W; 3000 used. Peak not stated in the text. Sd not published on this page. BL unit printed as 'NA' (taken as T·m). Cms published (µm/N) not stored.")
# --- InHuman 18 (current, D1 only)
drivers.append(rec("InHuman 18 D1", 18, "DVC", 1, 7500, 15000,
    dict(fs_hz=23.9, re_ohm=1.78, qms=3.601, qes=0.208, qts=0.197, mms_g=1470.8, sd_cm2=1641.9, vas_l=55.58, spl_db_1w1m=93.9, bl_tm=43.421, le_mh=4.253, xmax_mm=41),
    "unknown", depth_in=15.6, cut_in=16.69, disp_cuft=0.70, boxes=[box("ported", 7.0, 32, "maker page inhuman", note="maker recommends 6th order bandpass as the only intended use; ported 7.0 cu ft listed")],
    status="current", sources=[src(B + "inhuman", doc="product page, Specifications tab")], notes=SER + SDN + " Dual 1 ohm coil only. Xmech 77 mm. BL unit not printed (taken as T·m)."))
# --- discontinued with T/S on maker used/refurb pages
for size, url, D1, D2 in [
 (10, "nightshade-ns-series-ns5-10-3000w-subwoofer-ns-v-5-refurbished",
  dict(re_ohm=1.7892, fs_hz=44.7643, vas_l=6.4784, qes=0.4928, qms=5.9362, qts=0.4550, le_mh=1.4743, bl_tm=19.4775, mms_g=371.5023, spl_db_1w1m=82.4636),
  dict(re_ohm=3.4074, fs_hz=47.1702, vas_l=5.5066, qes=0.4961, qms=6.2811, qts=0.4597, le_mh=3.1838, bl_tm=28.3081, mms_g=393.6213, spl_db_1w1m=82.4110)),
 (12, "nightshade-ns-series-ns5-12-3000w-subwoofer-ns-v-5-used-1",
  dict(re_ohm=1.8822, fs_hz=39.5505, vas_l=12.002, qes=0.4433, qms=6.0739, qts=0.4131, le_mh=1.5815, bl_tm=20.5672, mms_g=400.8850, spl_db_1w1m=83.9874),
  dict(re_ohm=3.3581, fs_hz=38.7336, vas_l=11.6607, qes=0.4327, qms=5.3532, qts=0.4004, le_mh=3.0081, bl_tm=28.5017, mms_g=430.1454, spl_db_1w1m=83.6950)),
 (18, "nightshade-ns-series-ns5-18-3000w-subwoofer-ns-v-5-used",
  dict(re_ohm=1.9109, fs_hz=28.8828, vas_l=91.1940, qes=0.4748, qms=6.0933, qts=0.4405, le_mh=1.6927, bl_tm=21.1900, mms_g=614.8071, spl_db_1w1m=88.4011),
  dict(re_ohm=3.6205, fs_hz=28.7908, vas_l=89.5686, qes=0.4467, qms=6.2442, qts=0.4169, le_mh=3.3017, bl_tm=30.3917, mms_g=629.9743, spl_db_1w1m=88.5465))]:
    tbl(f"Nightshade NS v.5 {size}", size, 2, url, 3000, None, {1: D1, 2: D2}, {}, [], "discontinued",
        "Listed on the maker's Discontinued Products page; values from the maker's used/refurbished listing. Xmax, Sd, dimensions not on this page.")
tbl("X v.3 18", 18, 2, "x-series-v-3-18-subwoofer-used", 2000, None,
    {1: dict(re_ohm=1.4, fs_hz=26.650, vas_l=130.302, qes=0.526, qms=2.793, qts=0.442, bl_tm=14.543, mms_g=474.114, spl_db_1w1m=88.6, xmax_mm=30),
     2: dict(re_ohm=3.2, fs_hz=28.207, vas_l=109.935, qes=0.657, qms=3.091, qts=0.542, bl_tm=20.854, mms_g=504.115, spl_db_1w1m=87.6, xmax_mm=30)},
    dict(depth_in=13.6, cut_in=16.69, disp_cuft=0.23), [box("ported", 7.0, 32, "maker page x-series-v-3-18-subwoofer-used", note="maker: sealed N/A")], "discontinued",
    "Superseded by X v.4 (assumed from the series numbering; v.3 sold only as used stock). Values from the maker's used listing. Le printed blank.")
tbl("U v.2 15", 15, 2, "u-series-v-2-15-subwoofer-used", 1750, None, {}, {}, [], "discontinued")  # placeholder removed below (1750 W, below threshold)
drivers = [d for d in drivers if not d["model"].startswith("U v.2 15")]
no_ts = [
 {"model": "Z8 (Z-Series 8\") D1/D2", "rms_w": 2000, "url": B + "z-series-z8-4000w-subwoofer-z-8", "note": "2000 W RMS / 4000 W peak, Xmax 30 mm, ported 1.0 cu ft @ 32 Hz; no T/S table on the page (2026-11-21)."},
 {"model": "Nightshade NS v.6 10 D1/D2", "rms_w": 3500, "url": B + "nightshade-ns-series-ns6-10-3500w-subwoofer-ns-v-6-used", "note": "3500 W RMS / 7000 W peak on the page; no T/S table on the page."},
 {"model": "Nightshade NS v.6 18 D1/D2", "rms_w": 3500, "url": B + "nightshade-ns-series-ns6-18-3500w-subwoofer-ns-v-6-used", "note": "3500 W RMS on the page; no T/S table."},
 {"model": "Z v.6 15 D1/D2", "rms_w": 3250, "url": B + "z-series-zv6-15-3250w-subwoofer-z-v-6-refurbished", "note": "3250 W RMS / 6500 W peak, Xmax 35 mm; no T/S table on the refurbished page; status discontinued (superseded by Zv7)."},
 {"model": "Compact Neo v3 10/12/15/18 (D1, D2, plus SPL-only D0.25/0.35/0.5/0.7)", "rms_w": 3500, "url": B + "compact-neo-v3-12-subwoofer-copy", "note": "'Standard 3,500-watt rating'; build-to-order; no T/S table on the pages (10, 12, 15, 18 checked)."},
 {"model": "TEAM D4S x Sundown NEO 18 D2", "rms_w": 5000, "url": "https://www.down4soundshop.com/sundown-audio-used-d4s-team-neo-18-subwoofer-d2-5000w-rms-1-of-9/", "note": "Collaboration sub sold (used stock) by Down4Sound, a Sundown retailer (tier 2); page gives only '5000W RMS', no T/S."},
 {"model": "U v.2 10 / 12 D2/D4", "rms_w": 2000, "url": B + "u-series-v-2-12-subwoofer-used", "note": "2000 W RMS / 4000 W peak (used-stock pages); no T/S on the pages. U v.2 15/18 are 1750 W (below threshold)."},
]
save("sundown-audio", "Sundown Audio", "https://sundownaudio.com", 
     "Shopify store. robots.txt: public product pages crawlable; no terms page forbidding reading found. Server rate-limits fast requests ('local_rate_limited'), so pages were read 7 s apart. Only numbers recorded.",
     drivers, no_ts)
