#!/usr/bin/env python3
"""R2_SUBS_ALL: Gladen (Germany) subwoofer drivers from the English product pages' 'Technical Data' table and header
(gladen.com/en-us/gladen/subwoofer/<series>/<model>, listed from the series pages, read 2026-11-23). Header prints power as
'N / M watts' (larger first): the smaller figure is taken as RMS and the larger as peak, as printed order suggests (noted).
Plug & fit boxes, vented/sealed box versions (-VB, -SB) left out. Usage: python3 -I build_gladen.py"""
import sys, re, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
R = "/workspace/references/raw/car_subs/gladen/"


def n(s):
    if s is None: return None
    m = re.search(r"\d+(?:[.,]\d+)?", s)
    if not m: return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


def text(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


drivers = []
for l in open(R + "list.txt"):
    if not l.strip(): continue
    url, name = l.split()
    if not os.path.exists(R + name): continue
    t = text(R + name)
    i = t.lower().find("|technical data|")
    if i < 0 and "Resonance frequency (Fs)" in t: i = max(0, t.find("Resonance frequency (Fs)") - 900)
    if i < 0: print("no table", name); continue
    tb = t[i:i + 2500]
    g = lambda lab: (re.search(r"\|" + lab + r"\|([^|]+)", tb) or [None, None])[1]
    hm = re.search(r"\|(\d+(?:[.,]\d+)?) cm / ([\d.,]+)” Subwoofer\|(\d+) / (\d+) watts", t)
    tm = re.search(r"<title>([^<]+)</title>", open(R + name, encoding="utf-8", errors="replace").read())
    model = html.unescape(tm.group(1)).split(" - ")[0].split("|")[0].split(":")[0].strip() if tm else name[:-5]
    size = n(hm.group(2)) if hm else None
    a, b = (int(hm.group(3)), int(hm.group(4))) if hm else (None, None)
    rms, peak = (min(a, b), max(a, b)) if a else (None, None)
    zn = g(r"Nominal impedance \(ZN\):") or ""
    mz = re.search(r"(\d)\s*x\s*([\d,.]+)", zn)
    coil, ohm = (("DVC" if mz.group(1) == "2" else "QVC"), n(mz.group(2))) if mz else (("SVC", n(zn)) if n(zn) else (None, None))
    p = dict(xmax_mm=n(g(r"X-Max linear \(\+/-\):")), re_ohm=n(g(r"DC resistance \(Rdc\):")), fs_hz=n(g(r"Resonance frequency \(Fs\):")),
             qms=n(g(r"Mechanical Q factor \(Qms\):")), qes=n(g(r"Electrical Q factor \(Qes\):")), qts=n(g(r"Total Q factor \(Qts\):")),
             mms_g=n(g(r"Moving mass \(Mms\):")), sd_cm2=n(g(r"Piston area \(sd\):")), bl_tm=n(g(r"Force factor \(BL\):")),
             vas_l=n(g(r"Equivalent air volume \(Vas\):")), spl_db_2v83=n(g(r"SPL 2,83V/1m:")))
    rv = g(r"Recommended volume:")
    notes = (f"Header power printed '{a} / {b} watts'; smaller taken as RMS, larger as peak. " if a else "") + \
            ("DC resistance printed with '(dual)': per-coil value as printed; ts_basis not stated. " if "(dual)" in tb else "") + \
            (f"Recommended volume {rv} (as printed). " if rv else "") + "Xmax printed '+/-' (one-way)."
    r = rec(model, size, coil, ohm, rms, peak, p, "per_coil" if coil == "SVC" else "unknown",
            depth_mm=n(g(r"Installation depth:")), cut_mm=n(g(r"Installation diameter:")), status="current",
            sources=[src(url, doc="product page, header and Technical Data table")], notes=notes)
    if coil is None: r["final_loads_ohm"] = []
    drivers.append(r)
save("world", "gladen", "Gladen", "Germany", "https://www.gladen.com",
     "R2 2026-11-23: Joomla site, robots.txt has only the Joomla default paths. 6 series pages + 18 product pages read 3 s apart. EU maker: per-model facts only. Numbers only.",
     drivers, [], coverage="all subwoofer drivers in the Alpha, Gamma, High-End, Sigma and Zeta series; plug-and-fit boxes left out")
