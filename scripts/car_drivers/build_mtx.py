#!/usr/bin/env python3
"""R4_CAR_DRIVERS: MTX Audio (USA) car speakers from the 'Speaker Specs' table on page 35 of the MTX 2025 product catalogue
(https://www.mtx.com/MTX006907-MTX-Product-Catalog-2025.pdf; local copy downloaded by the PM through a non-VPN connection on 2026-11-22 for A2,
references/raw/hp_subs/us/mtx/catalog_dl/mtx_catalog_2025.txt, read here without new requests). Columns: model, type, size,
RMS power, sensitivity, frequency response, impedance, overall diameter, cut-out, mounting depth (metric values in brackets used).
Marine (MA*) and powersports (RZR, PROXP, X3, PS*, MUD, pods) rows are left out; MTX publishes no T/S.
Usage: python3 -I build_mtx.py"""
import sys, re
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
F = "/workspace/references/raw/hp_subs/us/mtx/catalog_dl/mtx_catalog_2025.txt"
URL = "https://www.mtx.com/MTX006907-MTX-Product-Catalog-2025.pdf"
t = open(F, encoding="utf-8", errors="replace").read()
pg = t[t.find("=== page 35 ==="):t.find("=== page 36 ===")]
pg = pg[:pg.find("Powersports Vehicle Kit Fit Guide")]
lines = [l.strip() for l in pg.splitlines() if l.strip()]
recs = []; cur = None
START = re.compile(r"^([A-Z][A-Z0-9\-()/]*\d[A-Z0-9\-()/]*)(\s|$)")
for l in lines:
    m = START.match(l)
    if m and not l.startswith(("RMS", "Type")):
        cur = [l]; recs.append(cur)
    elif cur is not None: cur.append(l)
out = []
for r_ in recs:
    s = " ".join(r_)
    code = s.split()[0]
    if re.match(r"^(MA\d|RZR|PROXP|X3-|PS\d|MUD|RNGR|RZRPOD)", code): continue
    m = re.search(r"^(\S+)\s+(2-Way Components|3-Way Coaxials|2-Way Coaxials|Midbass Driver|Bullet Tweeter|Compression Horns|Coaxials|Components|Tweeter|Midrange)\s+(.*)$", s)
    if not m: print("skip", s[:80]); continue
    kind, rest = m.group(2), m.group(3)
    typ = {"2-Way Components": "component_set", "Components": "component_set", "3-Way Coaxials": "coaxial", "2-Way Coaxials": "coaxial", "Coaxials": "coaxial",
           "Midbass Driver": "midbass", "Bullet Tweeter": "tweeter", "Tweeter": "tweeter", "Compression Horns": "coaxial", "Midrange": "midrange"}[kind]
    sz = re.match(r"^([\d.]+)\"\s*(?:x\s*([\d.]+)\")?", rest)
    size = None; lab = None
    if sz and sz.group(2): lab = f"{sz.group(1)}x{sz.group(2)}"
    elif sz: size = num(sz.group(1))
    rms = num((re.search(r"(\d+)W", rest) or [None, None])[1])
    sens = re.search(r"([\d.]+)dB", rest)
    fr = re.search(r"([\d.]+)(k?)Hz - ([\d.]+)(k?)Hz", rest)
    z = re.search(r"(\d+)Ω", rest)
    mms = re.findall(r"\(([\d.]+)(?: x ([\d.]+))?mm\)", rest)
    od = cut = dep = None
    if len(mms) >= 3:
        od = [num(mms[0][0]), num(mms[0][1])] if mms[0][1] else num(mms[0][0])
        cut = [num(mms[1][0]), num(mms[1][1])] if mms[1][1] else num(mms[1][0])
        dep = num(mms[2][0])
    elif len(mms) == 1: od = num(mms[0][0])
    notes = ["MTX catalogue 2025 p.35 'Speaker Specs' table; sensitivity reference not stated; no T/S published."]
    if typ == "midbass" and size and size >= 10: notes.append("Pro-style midbass driver (MTX RTX line).")
    r = rec(f"MTX {code}", typ, size, lab, num(z.group(1)) if z else None, "SVC", rms, None, num(sens.group(1)) if sens else None, "unknown" if sens else None,
            [num(fr.group(1)) * (1000 if fr.group(2) else 1), num(fr.group(3)) * (1000 if fr.group(4) else 1)] if fr else None, None, {}, "unknown",
            depth_mm=dep, cutout_mm=cut, frame_mm=od, sources=[src(URL, ["*"], doc="MTX product catalogue 2025 (PDF)", page="35", date="2026-11-22")],
            notes=" ".join(notes), extra={"maker_type": kind})
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("mtx", "MTX Audio", "USA", "https://www.mtx.com", "mtx.com is behind Cloudflare (A2: curl 403). Values from the maker catalogue PDF the PM fetched through a non-VPN connection on 2026-11-22 (no new requests by R4). Numbers only.", out)
