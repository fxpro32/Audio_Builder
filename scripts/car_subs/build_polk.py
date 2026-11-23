#!/usr/bin/env python3
"""R2_SUBS_ALL: Polk Audio (USA) car/marine subwoofers (DB+ and MM series) from the product pages' specification list
(polkaudio.com/en-us/product/..., read 2026-11-23). Polk publishes no T/S (the DB+ owner's manual PDF was checked: none), so every
model is listed incomplete. Usage: python3 -I build_polk.py"""
import sys, re, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
R = "/workspace/references/raw/car_subs/polk/"
pages = [("https://www.polkaudio.com/en-us/product/car-and-marine-speakers/db1242-dvc/112445.html", "db1242dvc.html")] + \
        [tuple(l.split()) for l in open(R + "list.txt") if l.strip()]
drivers = []
for url, f in pages:
    t = open(R + f, encoding="utf-8", errors="replace").read()
    ti = re.search(r"<title>([^<]*)", t); title = html.unescape(ti.group(1)).split(" - ")[0].strip() if ti else f
    sp = {a: html.unescape(b).strip() for a, b in re.findall(r'<span class="name">([^<]*)</span>\s*<span class="value">([^<]*)</span>', t)}
    if not sp: print("no specs", f); continue
    full = html.unescape(ti.group(1)) if ti else ""
    coil = "DVC" if "Dual Voice-Coil" in full or "DVC" in title else "SVC"
    size = num((re.search(r'(\d+)"', full) or [None, None])[1])
    dep = re.search(r"\(([\d.]+) cm\)", sp.get("Full-Range Mounting Depth - Top Mount", ""))
    drivers.append(rec(title, size, coil, num(sp.get("Nominal Impedance")), num(sp.get("Continuous Power Handling")), num(sp.get("Peak Power Handling")),
                       {"spl_db_1w1m": num(sp.get("Sensitivity (1 watt @ 1 meter)"))}, depth_mm=round(float(dep.group(1)) * 10, 1) if dep else None,
                       status="discontinued" if "/archive/" in url else "current", sources=[src(url, doc="product page, Specifications list")],
                       notes=f"Nominal impedance printed '{sp.get('Nominal Impedance')}' (for DVC models not stated per coil or total). 'Diameter' {sp.get('Diameter')} printed (not labelled cut-out, not entered). "
                             f"Mounting depth top mount as printed (bottom mount {sp.get('Full-Range Mounting Depth - Bottom Mount')}). Marine certified model. No T/S published."))
save("us", "polk", "Polk Audio", "USA", "https://www.polkaudio.com",
     "R2 2026-11-23: robots.txt allows product pages (disallows only cart/search/demandware.store paths). 7 product pages and 1 manual read 3-4 s apart. Numbers only.",
     drivers, [], coverage="DB+ (DB842 DVC, DB1042 SVC/DVC, DB1242 SVC/DVC) and MM (MM842, MM1042) subwoofers; no T/S published")
