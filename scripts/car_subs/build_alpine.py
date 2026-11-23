#!/usr/bin/env python3
"""R2_SUBS_ALL: Alpine (Alps Alpine, Japan; US site alpine-usa.com) car subwoofers from the product pages' Tech Specs lists
(references/raw/car_subs/alpine/<slug>.html, read 2026-11-23). T/S are NOT entered: the 'Tech Sheet' links (support.alpine-usa.com
/products/documents/TS_*.pdf) return a 'page does not exist' page, and the owner's manuals are image-only PDFs or have the T/S
table text out of column order (R-Series shallow manual), so values cannot be tied to models safely. All models listed incomplete.
Coil type from the model code (D2/D4 = dual 2/4 ohm, S2/S4 = single 2/4 ohm). Marine, Halo (powered) and vehicle kits left out.
Usage: python3 -I build_alpine.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
R = "/workspace/references/raw/car_subs/alpine/"
U = "https://www.alpine-usa.com/product/"


def text(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


drivers, seen = [], set()
for slug in [l.strip() for l in open(R + "slugs.txt") if l.strip() and "hdz-65" not in l]:
    f = R + slug + ".html"
    if not os.path.exists(f): continue
    t = text(f)
    i = t.find("Tech Specs|")
    if i < 0: print("no specs", slug); continue
    spec = t[i:i + 1500].replace(":|", ": ")
    m = re.search(r"\|Products\|([A-Z0-9-]+)\|", t)
    model = m.group(1) if m else slug.upper()
    if model in seen: continue
    seen.add(model)
    mc = re.search(r"(\d+)(?:\")?\s*(?:-inch)?", model)
    size = None
    ms = re.search(r"W(\d+)|SWT-(\d+)", model)
    if ms: size = int(ms.group(1) or ms.group(2))
    mco = re.search(r"([DS])(\d)$", model.replace("-", "")) or re.search(r"([DS])(\d)", model.split("W")[-1])
    coil = {"D": "DVC", "S": "SVC"}.get(mco.group(1)) if mco else None
    ohm = int(mco.group(2)) if mco else None
    rms = re.search(r"([\d,]+)\s*W(?:atts)? RMS", spec) or re.search(r"RMS Power Handling: ([\d,]+) Watts", spec)
    peak = re.search(r"([\d,]+)\s*W(?:atts)? Peak", spec) or re.search(r"Peak Power Handling: ([\d,]+) Watts", spec)
    sens = re.search(r"Sensitivity \(1W/1m\):\s*([\d.]+)", spec, re.I)
    xm = re.search(r"(?:X-?Max(?: \(1-Way\))?|Linear Excursion):\s*([\d.]+)\s*mm", spec, re.I)
    dep = re.search(r"Mounting Depth:[^|(]*\((\d+(?:\.\d+)?)\s*mm\)", spec) or re.search(r"Mounting Depth: (\d+(?:\.\d+)?) mm", spec)
    cut = re.search(r"Cutout(?: Size)?:[^|(]*\((\d+(?:\.\d+)?)\s*mm\)", spec) or re.search(r"Mounting Diameter: (\d+(?:\.\d+)?) mm", spec)
    if not dep:
        di = re.search(r"Mounting Depth: (\d+)(?:-(\d+)/(\d+))?\"", spec)
        if di: dep_in = int(di.group(1)) + (int(di.group(2)) / int(di.group(3)) if di.group(2) else 0)
        else: dep_in = None
    else: dep_in = None
    p = {"spl_db_1w1m": num(sens.group(1)) if sens else None, "xmax_mm": num(xm.group(1)) if xm else None}
    r = rec(model, size, coil, ohm, num(rms.group(1).replace(",", "")) if rms else None, num(peak.group(1).replace(",", "")) if peak else None, p,
            depth_mm=num(dep.group(1)) if dep else None, depth_in=dep_in, cut_mm=num(cut.group(1)) if cut else None, status="current",
            sources=[src(U + slug, doc="product page, Tech Specs list")],
            notes="T/S not entered (tech sheet link dead, manual T/S tables image-only or unordered text). Coil from the model code."
                  + (" Page text describes the X-Max figure as total cone excursion in places; one-way vs peak-to-peak UNVERIFIED." if xm else ""))
    drivers.append(r)
save("world", "alpine", "Alpine (Alps Alpine)", "Japan", "https://www.alpine-usa.com",
     "R2 2026-11-23: alpine-usa.com robots.txt 'Allow: /'. 28 product pages and 6 owner's manual PDFs read 3 s apart. Alpine Australia (alpine.com.au) did not connect from here. Numbers only.",
     drivers, [], coverage="current US car subwoofer drivers (Status HDZ, R2, R-Series shallow, S2, S, SWT, W); T/S not available in machine-readable maker documents")
