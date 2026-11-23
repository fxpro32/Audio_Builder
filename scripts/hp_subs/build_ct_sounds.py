#!/usr/bin/env python3
"""A2: CT Sounds (USA) EXO-12 records from the product description (ctsounds.com Shopify /products.json body, saved in references/raw/hp_subs/us/ct-sounds/), read 2026-11-21."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
U = "https://www.ctsounds.com/products/exo-12"
common = dict(depth_in=9.33, cut_in=10.79, disp_cuft=0.25,
              boxes=[box("ported (flat response / SQ)", 2.5, 33, "maker page exo-12", note="port area 40 sq in; excludes sub, bracing and port displacement per maker"),
                     box("ported (boomer / SPL)", 3.0, 36, "maker page exo-12", note="excludes sub, bracing and port displacement per maker")])
d = []
for ohm, p in ((1, dict(qes=0.51, qms=2.95, qts=0.43, fs_hz=37.251, vas_l=14.98, mms_g=346.32, re_ohm=1.7, bl_tm=16.92, sd_cm2=471.4, xmax_mm=27.5, spl_db_1w1m=86.4)),
               (2, dict(qes=0.59, qms=3.19, qts=0.5, fs_hz=37.61, vas_l=16.23, mms_g=348.31, re_ohm=3.7, bl_tm=22.65, sd_cm2=471.4, xmax_mm=27.5, spl_db_1w1m=85.5))):
    d.append(rec(f"EXO-12-D{ohm}", 12, "DVC", ohm, 3000, 6000, p, "unknown", status="current", sources=[src(U, doc="product page description, Specs and Box Specs sections")],
                 notes="Le printed '/' (not published). Cms printed with unit 'm/N' (0.047 / 0.051), evidently mm/N; not stored. SPL reference (1 W or 2.83 V) not stated; entered as 1 W/1 m. ts_basis not stated; Re 1.7 / 3.7 suggests series (inference).", **common))
save("ct-sounds", "CT Sounds", "https://www.ctsounds.com",
     "Shopify store; public /products.json read once (product descriptions). No terms forbidding this found (not read in full). Only EXO-12 is rated >= 2000 W RMS (others 500 to 1500 W).",
     d, [])
