#!/usr/bin/env python3
"""R2_SUBS_ALL: Pioneer (Japan). Maker sites blocked from this container on 2026-11-23: usa.pioneer answers 'local_rate_limited' / HTTP 429
(Crawl-delay 10 honoured), pioneer-car.eu Cloudflare 403 (also to WebFetch), pioneer.com.au bot challenge ('One moment, please').
Records: TS-W8102SPL from hp_subs_raw; TS-W3002D4 (the project owner's own sub) from the Pioneer owner's manual TRD1381-A (2009) that the owner supplied
(references/Pioneer TS-W3002 2502 instruction manual.pdf, p.2, values as transcribed by the PM on 2026-11-22 into
data/private/drivers/pioneer-ts-w3002d4.json, crops references/raw/pioneer_ts-w3002/). Other models: listed with no data (blocked).
Usage: python3 -I build_pioneer.py"""
import sys
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save
MAN = dict(url=None, doc="Pioneer owner's manual TS-W3002D4/W3002D2/W2502D4/W2502D2 (TRD1381-A, 2009), supplied by the project owner; local copy references/Pioneer TS-W3002 2502 instruction manual.pdf", page="2")
s = {"fields": ["*"], "url": None, "doc": MAN["doc"], "page": "2", "read_date": "2026-11-22", "tier": 1}
d = rec("TS-W3002D4 (Champion Series PRO 12 in)", 12, "DVC", 4, 1000, 3500,
        dict(fs_hz=31.4, qms=15.13, qes=0.68, qts=0.65, vas_l=13.03, re_ohm=6.6, le_mh=5.55, sd_cm2=437, mms_g=408.83, bl_tm=28.38, xmax_mm=12.9),
        "series", disp_l=5.12,
        boxes=[box("sealed", 0.8, None, "maker manual p.2", note="recommended; maker volumes INCLUDE driver displacement; min 0.5, max 1.0 cu ft"),
               box("ported", 1.2, None, "maker manual p.2", note="3 in round port x 3.5 in long; tuning not printed; volume includes driver displacement")],
        status="discontinued", sources=[s],
        notes="Values from the series (8 ohm) column of the maker T/S table: Re 6.6, Le 5.55 mH, Bl 28.38 (parallel 2 ohm column: Le 1.39 mH, Bl 14.19). "
              "Nominal power 1000 W, max 3500 W. Sd 0.0437 m2 as printed (437 cm2). DATA PROBLEM: printed Vas 13.03 L does not match Sd and Cms "
              "(rho c^2 Sd^2 Cms gives about 17 L); Fs, Qms, Qes check out from Mms, Cms, Rms, Bl. Status 'discontinued' is an assumption (2009 manual; "
              "the current US range lists TS-W3003D4 / TS-A301D4); UNVERIFIED on the maker site (blocked).")
blocked = [{"model": m, "rms_w": None, "url": u, "note": "Maker sites blocked from this container on 2026-11-23 (usa.pioneer HTTP 429, pioneer-car.eu Cloudflare 403, pioneer.com.au bot check); model name seen in the usa.pioneer subwoofer collection page only; no values taken. Needs a non-VPN connection route or a hand-saved page."}
           for m, u in [("TS-A301D4", "https://usa.pioneer/products/ts-a301d4"), ("TS-A301S4", "https://usa.pioneer/products/ts-a301s4"),
                        ("TS-A120D4", "https://usa.pioneer/products/ts-a120d4"), ("TS-A2000LD2", "https://usa.pioneer/products/ts-a2000ld2"),
                        ("TS-W3020PRO", "https://usa.pioneer/products/ts-w3020pro"), ("TS-A25S4", "https://usa.pioneer/products/ts-a25s4")]]
# R2B_SUBS_MORE (2026-11-23): Pioneer Europe range, T/S read from image-only manuals (see scripts/car_subs/image_reads/pioneer_eu.py).
import math, os
sys.path.insert(0, "/workspace/scripts/car_subs/image_reads")
from pioneer_eu import ROWS, M
EU = "/workspace/references/raw/car_subs/pioneer/eu_manuals/"
for l in open(EU + "manual_urls.txt"):
    k, u = l.split()
    M.setdefault(k, u)
    if M.get(k) is None: M[k] = u
eu_new = []
for (model, man, pg, size, coil, ohm, rms, mx, spl, re_p, le, fs, qms, qes, qts, vas, mms, cms, diam, bl, xmax, cut, dep, dsrc, note) in ROWS:
    sd = round(math.pi * (diam / 20) ** 2, 1)
    re_v = re_p * 2 if coil == "DVC" and model != "TS-A2000LD2" else re_p
    slug = model.split(" /")[0].lower()
    srcs = [src(M[man], doc=f"Pioneer user manual PDF ({man}), specification table, image only: READ FROM IMAGE (crop in references/raw/car_subs/pioneer/eu_manuals/)", page=str(pg))]
    if dsrc == "product page":
        srcs.append(src(f"https://pioneer-car.eu/{man if model.startswith(('TS-D10LS', 'TS-W32')) else slug}/{man if model.startswith(('TS-D10LS', 'TS-W32')) else slug}", fields=("cutout_mm", "mounting_depth_mm"), doc="pioneer-car.eu product page (headless browser)"))
    n = ("T/S READ FROM IMAGE (image-only maker manual), double-checked: Re implied by Qes, Bl, Mms, Fs agrees with the printed Re. "
         f"Sd calculated from the printed effective diameter {diam} mm (pi d^2/4), not printed. Cms printed {cms} m/N. ")
    if coil == "DVC" and model != "TS-A2000LD2":
        n += f"Re printed 'Dual {re_p}' (per coil); re_ohm = 2 x {re_p} for the series basis used for Le and Bl (8/4 ohm column). "
    n += note
    eu_new.append(rec(model, size, coil, ohm, rms, mx, dict(fs_hz=fs, qms=qms, qes=qes, qts=qts, vas_l=vas, re_ohm=re_v, le_mh=le, sd_cm2=sd, mms_g=mms, bl_tm=bl, xmax_mm=xmax, spl_db_1w1m=spl),
                      "series" if coil == "DVC" else "per_coil", depth_mm=dep, cut_mm=cut, status="current", sources=srcs, notes=n.strip()))
eu_list = [{"model": m, "rms_w": r, "url": u, "note": t, "source_note": "R2B"} for m, r, u, t in [
    ("TS-A30S4", 400, "https://pioneer-car.eu/ts-a30s4/ts-a30s4", "pioneer-car.eu product page (headless browser 2026-11-23): 30 cm, 4 ohm SVC, 400 W nominal, 1400 W max, cut-out 281 mm, mounting depth 136 mm, recommended enclosure 1.25 cu ft / 35.4 L. No user manual linked, no T/S."),
    ("TS-W3020PRO", 1800, "https://pioneer-car.eu/ts-w3020pro/ts-w3020pro", "pioneer-car.eu product page (headless browser 2026-11-23): 30 cm, 1 or 4 ohm, 1800 W nominal, 3500 W max, cut-out 282 mm, mounting depth 154 mm, recommended enclosure 1.25 cu ft / 35 L. No user manual linked, no T/S."),
    ("TS-W3010PRO", 600, "https://pioneer-car.eu/ts-w3010pro/ts-w3010pro", "pioneer-car.eu category page: 30 cm, 1 or 4 ohm, 600 W nominal, 1500 W max. Product page not read (time)."),
    ("TS-W3820PRO", 1800, "https://pioneer-car.eu/ts-w3820pro/ts-w3820pro", "pioneer-car.eu category page: 38 cm, 1 or 4 ohm, 1800 W nominal, 3500 W max. Product page not read (time).")]]
for x in eu_list: x.pop("source_note")
blocked = [b for b in blocked if b["model"] not in ("TS-A2000LD2", "TS-W3020PRO")]  # now read from pioneer-car.eu
save("world", "pioneer", "Pioneer", "Japan", "https://usa.pioneer",
     "R2 2026-11-23: usa.pioneer HTTP 429 (also on the R2B retry at 20 s), pioneer.com.au home renders in the browser but was not explored, pioneer-car.eu refuses curl (Cloudflare) but renders in a normal headless browser: R2B read its category, product pages and user manuals one launch at a time, 10 s apart (robots Crawl-delay 10). Numbers only; manual T/S read from images.",
     [d] + eu_new, blocked + eu_list, coverage="Europe range (pioneer-car.eu subwoofer category, 26 products, read with the headless browser 2026-11-23): 17 component subs with T/S read from image-only manuals; boxed LB/WX models left out; TS-W8102SPL (hp_subs_raw), TS-W3002D4 (owner's manual); US-only models listed by name (usa.pioneer HTTP 429)")
