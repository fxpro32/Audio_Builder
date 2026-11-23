#!/usr/bin/env python3
"""A2: Rockford Fosgate (Tempe, Arizona) records from rockfordfosgate.com product detail pages read 2026-11-21. Metric values used as printed in brackets."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
U = "https://rockfordfosgate.com/products/details/"
rows = [  # model, slug, size, ohm, rms, peak, params, depth_mm, cut_mm, disp_l, sealed_l, vented_l, spl_2v83
 ("Power T3 19 T3S1-19", "t3s1-19", 19, 1, 3000, 6000, dict(fs_hz=27, qts=0.32, qms=1.93, qes=0.38, re_ohm=0.8, le_mh=0.45, vas_l=104.9, xmax_mm=34, sd_cm2=1472, spl_db_1w1m=91), 396, 440, 9.6, None, 226.5, None),
 ("Power T3 19 T3S2-19", "t3s2-19", 19, 2, 3000, 6000, dict(fs_hz=27, qts=0.31, qms=1.92, qes=0.37, re_ohm=1.7, le_mh=0.96, vas_l=103.4, xmax_mm=34, sd_cm2=1472, spl_db_1w1m=90), 396, 440, 9.6, None, 226.5, None),
 ("Power T2 13 T2S1-13", "t2s1-13", 13, 1, 2000, 4000, dict(fs_hz=25, qts=0.34, qms=2.93, qes=0.39, re_ohm=0.9, le_mh=0.53, vas_l=69.3, xmax_mm=34, sd_cm2=707, spl_db_1w1m=87, spl_db_2v83=90), 246, 312, 7.08, 52.3, 113, None),
 ("Power T2 13 T2S2-13", "t2s2-13", 13, 2, 2000, 4000, dict(fs_hz=25.5, qts=0.35, qms=3.01, qes=0.40, re_ohm=1.6, le_mh=0.91, vas_l=68.7, xmax_mm=34, sd_cm2=707, spl_db_1w1m=87, spl_db_2v83=90), 246, 312, 7.08, 52.3, 113, None),
 ("Power T2 16 T2S1-16", "t2s1-16", 16, 1, 2500, 5000, dict(fs_hz=28.5, qts=0.49, qms=3.73, qes=0.57, re_ohm=0.9, le_mh=0.53, vas_l=84.5, xmax_mm=34, sd_cm2=1034, spl_db_1w1m=89, spl_db_2v83=92), 266, 382, 8.2, 67.9, 155, None),
 ("Power T2 16 T2S2-16", "t2s2-16", 16, 2, 2500, 5000, dict(fs_hz=28.5, qts=0.49, qms=3.76, qes=0.56, re_ohm=1.6, le_mh=0.91, vas_l=90.1, xmax_mm=34, sd_cm2=1034, spl_db_1w1m=90, spl_db_2v83=93), 266, 382, 8.2, 67.9, 155, None),
]
drivers = []
for model, slug, size, ohm, rms, peak, p, depth, cut, disp, sealed, vented, _ in rows:
    boxes = ([box("sealed", None, None, "maker page " + slug, litres=sealed, note="maker Vb as printed in litres")] if sealed else []) + \
            [box("ported", None, None, "maker page " + slug, litres=vented, note="maker Vb as printed in litres; tuning not published" + ("; maker: sealed not recommended" if not sealed else ""))]
    drivers.append(rec(model, size, "SVC", ohm, rms, peak, p, "per_coil", depth_mm=depth, cut_mm=cut, disp_l=disp, boxes=boxes, status="current",
        sources=[src(U + slug + "/", doc="product detail page, Specifications tab")],
        notes="Single voice coil, so the T/S are for the one coil (ts_basis per_coil by construction). Power rated to CEA-2031 per maker. Mms, Bl not published."
              + (" T3 page: 'dual (push/pull) windings' on a single voice coil; one terminal pair." if size == 19 else "")))
save("rockford-fosgate", "Rockford Fosgate", "https://rockfordfosgate.com",
     "robots.txt: 'Disallow:' empty (everything allowed). No terms clause on automated access checked beyond robots. Pages read 5-6 s apart. Numbers only.",
     drivers, [])
