#!/usr/bin/env python3
"""A2: Fi Car Audio records, transcribed from ficaraudio.com series pages read 2026-11-21 (raw copies in references/raw/hp_subs/us/fi-car-audio/)."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box_range, src, save
B = "https://ficaraudio.com/"
BASIS = ("ts_basis not stated. Re for the dual 1 ohm option is close to one coil's DC resistance and the D1/D2 Bl ratio is about 1.4 (square root of 2), "
         "which suggests per-coil values (inference only).")
SIZES = {12: dict(cut_in=11.125, depth_in=10.00, disp_cuft=0.19, rng=(1.8, 2.5)), 15: dict(cut_in=14.125, depth_in=11.00, disp_cuft=0.21, rng=(3, 5)),
         18: dict(cut_in=16.75, depth_in=12.25, disp_cuft=0.26, rng=(5, 8)), 21: dict(cut_in=19.25, depth_in=11.75, disp_cuft=0.34, rng=(7, 10))}
drivers = []
def add(series, url, size, ohm, rms, p, extra="", dims=None, rngs=None, status="current"):
    d = dict(SIZES[size]); d.update(dims or {}); rng = d.pop("rng")
    boxes = rngs if rngs is not None else [box_range("ported", rng[0], rng[1], None, "maker page " + url)]
    drivers.append(rec(f"{series} {size} D{ohm}", size, "DVC", ohm, rms, None, p, "unknown", boxes=boxes, status=status,
                       sources=[src(B + url + "/", doc="product page, Thiele-Small Parameters + Technical Specifications tables")],
                       notes=BASIS + (" " + extra if extra else "") + " Bl unit printed as 'N/A' (taken as T·m).", **d))
# Neo 3.x: values per size AND per coil option
neo3 = {
 "NEO 3.5": ("neo-35-15", 2000, {12: [(29.6, 0.9, 6.98, .41, .38, 297, 480, 26.11, 85.1, 15.6), (29.6, 1.8, 7.01, .41, .38, 294, 480, 26.19, 85.1, 21.1)],
                                 15: [(30.4, 0.9, 7.45, .48, .43, 338, 810, 74.51, 88.3, 15.6), (30.4, 1.8, 7.43, .48, .43, 341, 810, 75.02, 88.3, 21.1)],
                                 18: [(27.6, 0.9, 8.55, .55, .52, 427, 1210, 159.73, 89.7, 15.6), (27.6, 1.8, 8.79, .55, .52, 428, 1210, 158.33, 89.7, 21.1)]}),
 "NEO 3.7": ("neo-37-15", 2500, {12: [(34.1, 0.9, 7.19, .35, .33, 291, 480, 22.25, 86.4, 17.9), (34.1, 1.8, 7.23, .35, .33, 294, 480, 22.19, 86.4, 25.1)],
                                 15: [(33.3, 0.9, 8.01, .38, .37, 444, 810, 63.0, 89.3, 17.9), (33.3, 1.8, 7.97, .40, .38, 435, 810, 61.37, 89.3, 25.1)],
                                 18: [(29.9, 0.9, 8.91, .45, .43, 516, 1210, 121.04, 90.9, 17.9), (29.9, 1.8, 8.79, .47, .45, 503, 1210, 119.88, 90.9, 25.1)]}),
 "NEO 3.9": ("neo-39-15", 2500, {12: [(39.3, 0.9, 7.02, .29, .28, 294, 480, 17.88, 87.6, 21.2), (39.5, 1.8, 6.83, .29, .28, 294, 480, 17.71, 87.6, 30.0)],
                                 15: [(36.0, 0.9, 7.52, .32, .31, 353, 810, 50.88, 90.5, 21.2), (36.0, 1.8, 7.47, .32, .31, 355, 810, 52.03, 90.5, 30.0)],
                                 18: [(32.1, 0.9, 8.21, .34, .33, 419, 1210, 120.00, 92.5, 21.2), (32.0, 1.8, 8.39, .34, .33, 413, 1210, 118.95, 92.5, 30.0)]}),
 "MT": ("mt-series-15-subwoofer", 4500, {12: [(34.3, 0.75, 7.93, .36, .35, 408, 480, 17.17, 84.6, 19), (34.3, 1.49, 7.83, .38, .37, 404, 480, 17.17, 84.4, 26.1)],
                                 15: [(32.2, 0.75, 8.52, .38, .37, 444, 810, 49.0, 88.1, 19), (32.6, 1.49, 8.43, .40, .38, 435, 810, 49.0, 88.1, 26.1)],
                                 18: [(31.7, 0.75, 9.91, .45, .43, 516, 1210, 95.4, 90.2, 19), (32.1, 1.49, 9.79, .47, .45, 503, 1210, 95.4, 90.1, 26.1)]}),
}
for series, (url, rms, sizes) in neo3.items():
    xm = 33 if series == "MT" else 34
    for size, rows in sizes.items():
        for ohm, r in zip((1, 2), rows):
            p = dict(zip(["fs_hz","re_ohm","qms","qes","qts","mms_g","sd_cm2","vas_l","spl_db_1w1m","bl_tm"], r)); p["xmax_mm"] = xm
            extra = "MT Cms row printed as 0.53/0.68 without unit (not stored); MT 12 and MT 15 Mms equal NEO 3.7 15/18 values (possible copy-paste on the maker page)." if series == "MT" else ""
            add(series, url, size, ohm, rms, p, extra)
# Neo 4.x: Fs/Q/Mms/Sd/Vas/SPL once per size; Re and Bl per coil option
neo4 = {
 "NEO 4.7": ("neo-47-15", 3500, None, {12: (32.8, 6.62, .45, .42, 367, 480, 20.70, 83.9), 15: (30.4, 6.93, .48, .44, 402, 810, 59.05, 87.6), 18: (29.1, 7.61, .53, .50, 484, 1210, 126.58, 89.5)}, (0.7, 1.4), (15.27, 21.6)),
 "NEO 4.9": ("neo-49-15", 3500, "3500-4500W *", {12: (34.2, 6.51, .37, .35, 368, 480, 19.3, 85.2), 15: (32.0, 7.39, .39, .37, 419, 810, 55.2, 88.7), 18: (31.7, 8.21, .45, .42, 489, 1210, 111.3, 90.4), 21: None}, (0.7, 1.4), (17.6, 24.9)),
 "NEO 4.11": ("neo-411-15", 3500, "3500-4500W+", {12: (36.1, 6.83, .28, .27, 381, 480, 17.1, 86.4), 15: (33.6, 7.31, .30, .29, 420, 810, 48.8, 89.7), 18: (33.4, 8.44, .35, .33, 489, 1210, 95.1, 91.9), 21: (31.4, 9.36, .43, .41, 639, 1650, 153.6, 92.3)}, (0.7, 1.4), (20.4, 28.7)),
}
for series, (url, rms, rmstxt, sizes, res, bls) in neo4.items():
    for size, r in sizes.items():
        for ohm, re_, bl in zip((1, 2), res, bls):
            if r is None:
                p = dict(re_ohm=re_, bl_tm=bl, sd_cm2=1650, xmax_mm=34)
                extra = "Maker table shows 0.00 placeholders for Fs, Q, Mms, Vas, SPL of the 21 in (treated as not published)."
            else:
                p = dict(zip(["fs_hz","qms","qes","qts","mms_g","sd_cm2","vas_l","spl_db_1w1m"], r)); p.update(re_ohm=re_, bl_tm=bl, xmax_mm=34)
                extra = "Fs, Qms, Qes, Qts, Mms, Vas, SPL published once per size (not per coil option); the same values are entered for D1 and D2."
            if rmstxt: extra += f" RMS published as '{rmstxt}'; lower bound entered."
            dims = {"disp_cuft": 0.33} if (series == "NEO 4.9" and size == 21) else None
            add(series, url, size, ohm, rms, p, extra, dims)
# HC (2500 W): ferrite, own dimensions; HC Plus page shows the same T/S with shallower mounting depth
HC = {12: [(33.9, .9, 6.15, .26, .25, 279, 480, 24.9, 87.6), (33.9, 1.8, 6.11, .27, .26, 282, 480, 24.8, 87.5)],
      15: [(32.8, .9, 6.61, .30, .29, 326, 810, 28.1, 90.8), (32.7, 1.8, 6.52, .31, .30, 331, 810, 28.1, 90.7)],
      18: [(32.4, .9, 7.71, .36, .34, 393, 1210, 126.3, 92.6), (32.3, 1.8, 7.52, .38, .35, 399, 1210, 125.2, 92.4)]}
HCD = {12: (11.125, 9.80, 7.25, 0.08, (.5, 1.5), (1.8, 2.5)), 15: (14.125, 10.90, 8.75, 0.09, (1.5, 2.5), (3, 5)), 18: (16.75, 11.90, 9.50, 0.10, (2.5, 4), (5, 7))}
for size, rows in HC.items():
    cut, depth, depth_plus, disp, sr, pr = HCD[size]
    for ohm, r, bl in zip((1, 2), rows, (20.0, 28.2)):
        p = dict(zip(["fs_hz","re_ohm","qms","qes","qts","mms_g","sd_cm2","vas_l","spl_db_1w1m"], r)); p.update(bl_tm=bl, xmax_mm=34)
        rngs = [box_range("sealed", sr[0], sr[1], None, "maker page hc-series-15-subwoofers"), box_range("ported", pr[0], pr[1], 33, "maker page hc-series-15-subwoofers")]
        extra = f"HC Plus (page hc-plus-series-12-subwoofers) shows the same T/S table with mounting depth {depth_plus} in." + (" DATA PROBLEM: HC-15 Vas 28.1 L is out of line with HC-12 24.9 L and HC-18 126 L for the same motor; check with the maker." if size == 15 else "")
        add("HC", "hc-series-15-subwoofers", size, ohm, 2500, p, extra, dict(cut_in=cut, depth_in=depth, disp_cuft=disp, rng=None), rngs)
no_ts = [
 {"model": "SP4v3 12/15/18 D1/D2 (and SP4v3 Plus)", "rms_w": 3000, "url": B + "sp4v3-subwoofer/", "note": "3000 W RMS (Plus 3500 W RMS); 'More details coming soon', no T/S on the page (2026-11-21)."},
 {"model": "SP3v2 Plus 12/15/18 D1/D2", "rms_w": 2500, "url": B + "sp3v2-subwoofer/", "note": "Plus version 2500 W RMS (standard SP3v2 is 1500 W); no T/S on the page."},
 {"model": "BTL / BTL4, SSD, Team series (older Fi lines)", "rms_w": None, "url": B, "note": "Only recone kits remain on the maker site; no maker T/S page found. Third-party aggregators carry values but are excluded by the brief."},
]
save("fi-car-audio", "Fi Car Audio", "https://ficaraudio.com",
     "BigCommerce store. robots.txt allows product pages for all agents; AI user agents (ClaudeBot, anthropic-ai, etc.) get Crawl-delay 10, so pages were read 10 s apart. Terms and Conditions: no reproduction of 'Company IP' (copyright, trademarks) without permission; only numeric facts recorded, no text, images or logos.",
     drivers, no_ts)
