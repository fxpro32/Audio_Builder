#!/usr/bin/env python3
"""R2_SUBS_ALL: Crunch (Audio Design GmbH, Germany) GTi subwoofers from the data sheets (crunchaudio.de/assets/<model>.pdf, same layout as
ESX/Musway, parsed with audiodesign_sheet.py), read 2026-11-23. Usage: python3 -I build_crunch.py"""
import sys, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
from audiodesign_sheet import parse, SIZE
R = "/workspace/references/raw/car_subs/crunch/"
drivers = []
for l in open(R + "list.txt"):
    if not l.strip(): continue
    url, name = l.split(); slug = name[:-4]
    d = parse(R + name)
    r = rec(d["model"] or slug.upper(), SIZE.get(d["size_cm"]), d.get("coil"), d.get("ohm"), d["rms"], d["peak"], d["params"], "per_coil" if d.get("coil") == "SVC" else "unknown",
            depth_mm=d["depth"], cut_mm=d["cut"], boxes=d["boxes"], status="current",
            sources=[src(url, doc="data sheet PDF"), src("https://www.crunchaudio.de/" + slug + ".html", ["status"], doc="product page (links the sheet)")], notes=" ".join(d["notes"]))
    if not d.get("coil"): r["final_loads_ohm"] = []
    drivers.append(r)
save("world", "crunch", "Crunch (Audio Design)", "Germany", "https://www.crunchaudio.de",
     "R2 2026-11-23: subwoofer page, 3 product pages and 3 data sheets read 3 s apart. Numbers only.", drivers, [], coverage="all three GTi subwoofer drivers on the maker's Subwoofer page")
