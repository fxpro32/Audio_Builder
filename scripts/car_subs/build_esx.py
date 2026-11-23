#!/usr/bin/env python3
"""R2_SUBS_ALL: ESX (Audio Design GmbH, Germany) subwoofer drivers from the data-sheet PDFs (esxaudio.de/assets/<model>.pdf) of every
driver on the maker's Subwoofer page (read 2026-11-23); VX PRO models come from hp_subs_raw. Usage: python3 -I build_esx.py"""
import sys, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
from audiodesign_sheet import parse, SIZE
R = "/workspace/references/raw/car_subs/esx/"
drivers, no_ts = [], []
for l in open(R + "list.txt"):
    if not l.strip() or not l.split()[1].endswith(".pdf"): continue
    url, name = l.split(); slug = name[:-4]
    if not os.path.exists(R + name) or open(R + name, "rb").read(4) != b"%PDF":
        no_ts.append({"model": slug.upper(), "rms_w": None, "url": "https://www.esxaudio.de/" + slug + ".html", "note": "No data sheet PDF at the usual asset URL; product page not parsed."}); continue
    d = parse(R + name)
    size = SIZE.get(d["size_cm"])
    r = rec(d["model"] or slug.upper(), size, d.get("coil"), d.get("ohm"), d["rms"], d["peak"], d["params"], "per_coil" if d.get("coil") == "SVC" else "unknown",
            depth_mm=d["depth"], cut_mm=d["cut"], boxes=d["boxes"], status="current",
            sources=[src(url, doc="data sheet PDF"), src("https://www.esxaudio.de/" + slug + ".html", ["status"], doc="product page (links the sheet)")],
            notes=" ".join(d["notes"]) + (f" Size printed {d['size_cm']} cm." if d["size_cm"] and not size else ""))
    if not d.get("coil"): r["final_loads_ohm"] = []
    drivers.append(r)
save("world", "esx", "ESX / Audio Design", "Germany", "https://www.esxaudio.de",
     "R2 2026-11-23: subwoofer page, 16 product pages and data sheets read 3 s apart. EU maker: per-model facts only. Numbers only.",
     drivers, no_ts, coverage="every passive subwoofer driver on the maker's Subwoofer page (QXE, QXP, QXS, SX, SXE, SXT, VXP, VX PRO)")
