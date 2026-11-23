#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): Reiss Audio (Turkey), the product pages A6 saved through a non-VPN connection on 2026-11-22
(references/raw/hp_subs/direct/reiss-audio/_extract.json, made by scripts/a6_reiss_extract.py; no new requests: the site does not answer
the container). hp_subs_raw holds 25 models; the other saved subwoofer pages (lower power) are added here. No T/S published by the maker
(pages or catalogue), so all are listed incomplete. Usage: python3 -I build_reiss.py"""
import sys, json, re
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import save, num, src
X = json.load(open("/workspace/references/raw/hp_subs/direct/reiss-audio/_extract.json"))
P = "https://www.reissaudio.com.tr/product/"
no_ts = []
for slug, v in sorted(X.items()):
    s = v.get("spec") or {}
    if (s.get("Type") or "Subwoofer").lower() != "subwoofer": continue
    size = num(s.get("Size")); size_in = {20: 8, 25: 10, 30: 12, 38: 15, 46: 18, 53: 21, 84: 33}.get(size)
    no_ts.append({"model": s.get("Model", slug.upper()), "rms_w": num((s.get("RMS Power") or "").split()[0]) if s.get("RMS Power") else None,
                  "url": P + slug + "/", "size_in": size_in, "peak_w": num((s.get("Max Power") or "").split()[0]) if s.get("Max Power") else None,
                  "note": f"Product page: size {s.get('Size')}, RMS {s.get('RMS Power')}, max {s.get('Max Power')}, impedance '{s.get('Impedance')}', sensitivity {s.get('Sensitivity')}, "
                          f"frequency response {s.get('Frequency Response')}. No T/S published. Page read through a non-VPN connection by A6 on 2026-11-22." + (f" size_in from {size} cm (nominal)." if size_in else ""),
                  "sources": [src(P + slug + "/", doc="product page (saved by A6 via a non-VPN connection)", date="2026-11-22")]})
save("world", "reiss-audio", "Reiss Audio", "Turkey", "https://www.reissaudio.com.tr/",
     "R2B 2026-11-23: built from the pages A6 saved through a non-VPN connection on 2026-11-22 (no new requests; the site does not answer the container). Numbers only.",
     [], no_ts, coverage="every subwoofer product page A6 saved (32, all power levels); no T/S published, all listed incomplete")
