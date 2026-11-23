#!/usr/bin/env python3
"""R2_SUBS_ALL: Timpano Audio (USA) car subwoofers, all power levels, from the THIELE-SMALL PARAMETERS block of each product description
in the store's public /products.json (saved by A2 on 2026-11-21 in references/raw/hp_subs/us/timpano/, re-used 2026-11-23; no new requests).
RMS from the description ('... N watts RMS'); hp_subs_raw records (>= 2000 W) are kept. Usage: python3 -I build_timpano.py"""
import sys, re, glob, json, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
R = "/workspace/references/raw/hp_subs/us/timpano/"
P = [p for f in sorted(glob.glob(R + "products_*.json")) for p in json.load(open(f))["products"]]
drivers = []
for p in P:
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); b = re.sub(r"(\s*\|\s*)+", "|", re.sub(r"\s+", " ", b))
    i = b.upper().find("THIELE-SMALL")
    if i < 0: continue
    t = b[i:i + 700]
    g = lambda lab: (re.search(r"\|" + lab + r"\|([\d.]+)", t) or [None, None])[1]
    m = re.search(r"TPT-([A-Z]*\d+)-?(\d+)?\s*(?:_| )?D(\d)", p["title"].upper().replace("TSUB", "TSUB-"))
    model = p["title"].strip()
    mz = re.search(r"-(\d{2})\s*_?\s*D(\d)|TSUB(\d{2}) D(\d)", model.upper())
    size = int(mz.group(1) or mz.group(3)) if mz else None
    ohm = int(mz.group(2) or mz.group(4)) if mz else None
    par = re.search(r"Wired in Parallel Re ([\d.]+)", t)
    rms = re.search(r"([\d,]+)\s*watts RMS", b, re.I)
    xmech = g("Xmech")
    params = dict(fs_hz=num(g("Fs")), qes=num(g("Qes")), vas_l=num(g("Vas")), qts=num(g("Qts")), qms=num(g("Qms")), xmax_mm=num(g("Xmax")),
                  bl_tm=num(g("Bl")), re_ohm=num(par.group(1)) if par else None)
    drivers.append(rec(model, size, "DVC", ohm, num(rms.group(1).replace(",", "")) if rms else None, None, params, "parallel" if par else "unknown",
                       status="current", sources=[src("https://timpanoaudio.com/products/" + p["handle"], doc="product page description, THIELE-SMALL PARAMETERS block (via public products.json)")],
                       notes=("Maker states the T/S are for the coils wired in parallel. " if par else "Wiring basis of the T/S not stated; Vas printed without unit (litres assumed from the other Timpano pages). ")
                             + (f"Xmech {xmech} mm. " if xmech else "") + "Box recommendations on the page not entered (tuning not given)."))
save("us", "timpano", "Timpano Audio", "USA", "https://timpanoaudio.com",
     "R2 2026-11-23: re-used the store's public /products.json saved by A2 on 2026-11-21 (no new requests). Numbers only.",
     drivers, [], coverage="every product description with a T/S block (all power levels)")
