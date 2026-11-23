#!/usr/bin/env python3
"""R2_SUBS_ALL: Planet Audio (BOSS Audio Systems group, USA) car subwoofers from the product pages' SPECIFICATIONS block
(planetaudio.com/auto/<model>/, listed from the Subwoofers category page, read 2026-11-23). The pages print long binary-float
renderings (e.g. 'Qes 0.91200000000000003286'); values are rounded to 4 significant decimals. Vas printed in cu ft (converted).
Usage: python3 -I build_planet_audio.py"""
import sys, re, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save, L
R = "/workspace/references/raw/car_subs/planet-audio/"


def n(s):
    if s is None: return None
    m = re.search(r"\d+(?:\.\d+)?", s)
    if not m: return None
    v = round(float(m.group(0)), 4); return int(v) if v.is_integer() else v


def frac_in(s):
    if not s: return None
    m = re.match(r"\s*(\d+)(?:[- ](\d+)/(\d+))?(?:\.(\d+))?", s)
    if not m: return None
    if m.group(4): return float(m.group(1) + "." + m.group(4))
    return int(m.group(1)) + (int(m.group(2)) / int(m.group(3)) if m.group(2) else 0)


drivers = []
for l in open(R + "list.txt"):
    if not l.strip(): continue
    url, name = l.split()
    if not os.path.exists(R + name): continue
    t = open(R + name, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"(\s*\|\s*)+", "|", re.sub(r"\s+", " ", t))
    if "Amplified Subwoofer System" in t: continue  # powered sub with enclosure, not a driver
    i = t.find("|SPECIFICATIONS|General Specs|")
    if i < 0: print("no specs", name); continue
    s = t[i:t.find("|REVIEWS", i) if t.find("|REVIEWS", i) > 0 else i + 1500]
    g = lambda lab: (re.search(r"\|" + lab + r"\|([^|]+)", s) or [None, None])[1]
    model = name[:-5].upper()
    vc = (g("Voice Coil Configuration") or "").upper()
    coil = "DVC" if "DUAL" in vc else ("SVC" if "SINGLE" in vc else None)
    vas = g("Vas")
    p = dict(fs_hz=n(g("FS")), qes=n(g("Qes")), qms=n(g("Qms")), qts=n(g("Qts")), xmax_mm=n(g(r"Xmax \(One-Way\)")), spl_db_1w1m=n(g(r"Sensitivity \(1W/1m\)")),
             vas_l=L(n(vas)) if vas and "CuFt" in vas else n(vas))
    boxes = []
    if g("Recommended Sealed"): boxes.append(box("sealed", n(g("Recommended Sealed")), None, "maker page " + url))
    if g("Recommended Ported"): boxes.append(box("ported", n(g("Recommended Ported")), n(g("Port Frequency")), "maker page " + url,
                                                 note=f"port {g('Port Diameter')} diameter x {g('Port Length')} long as printed"))
    r = rec(model, n(g("Subwoofer Size")), coil, n(g("Impedance")), n(g("RMS Power Handling")), n(g("Peak Power Handling")), p, "per_coil" if coil == "SVC" else "unknown",
            depth_in=frac_in(g("Mounting Depth")), cut_in=frac_in(g("Mounting Diameter")), boxes=boxes, status="current",
            sources=[src(url, doc="product page, SPECIFICATIONS block")],
            notes="Long float renderings on the page rounded to 4 decimals. Vas printed in cu ft, converted." + (" Impedance printed per coil for DVC (as 'DUAL' + 'N ohm'); taken as ohms per coil." if coil == "DVC" else ""))
    if coil is None: r["final_loads_ohm"] = []
    drivers.append(r)
save("us", "planet-audio", "Planet Audio (BOSS Audio Systems)", "USA", "https://planetaudio.com",
     "R2 2026-11-23: Subwoofers category page and 14 product pages read 3 s apart. Numbers only.",
     drivers, [], coverage="every subwoofer driver on the maker's Subwoofers category page")
