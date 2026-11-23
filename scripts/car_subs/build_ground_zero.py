#!/usr/bin/env python3
"""R2_SUBS_ALL: Ground Zero (Germany) subwoofer drivers, all power levels, from the English product pages' 'Additional information'
table (ground-zero-audio.com/en/<slug>/, listed from the four subwoofer category pages, read 2026-11-23). Pages give Fs, Qts, Vas,
'Max. Excursion (Xmax)', power, impedance, efficiency, mounting depth. A3 found Ground Zero prints Xmax peak-to-peak on its sheets
(see data/hp_subs_raw/world/ground-zero.json notes); here xmax_mm = printed value / 2 (calculated), printed value kept in notes.
hp_subs_raw records (from manuals, fuller T/S) are kept and win over page records of the same model.
Usage: python3 -I build_ground_zero.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
R = "/workspace/references/raw/car_subs/ground-zero/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def text(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


def g(t, label):
    m = re.search(r"\|" + label + r"\|([^|]+)", t)
    return m.group(1).strip() if m else None


drivers = []
for name, url in urls.items():
    f = R + name
    if not os.path.exists(f): continue
    t = text(f)
    i = t.find("|Model|")
    if i < 0: print("no table", name); continue
    t = t[i:t.find("|Owner", i) if t.find("|Owner", i) > 0 else i + 2500]
    m = re.search(r"\|>\|([^|]+)\|Magnifier", text(f))
    model = m.group(1).strip() if m else name[:-5].upper()
    dia = g(t, "Diameter") or ""
    ms = re.search(r"([\d.]+)″|([\d.]+)\"", dia)
    size = num(ms.group(1) or ms.group(2)) if ms else None
    if size is None:
        mcm = re.search(r"(\d+)\s*(?:cm|mm)", dia) or re.search(r"GZ[A-Z]{2} (\d+)", model)
        if mcm: size = {16: 6.5, 165: 6.5, 20: 8, 200: 8, 25: 10, 250: 10, 30: 12, 300: 12, 38: 15, 46: 18}.get(int(mcm.group(1)))
    imp = g(t, "Impedance") or ""
    mi = re.search(r"(?:(\d)\s*x\s*)?([\d.,]+)\s*Ohm", imp)
    coils = int(mi.group(1)) if mi and mi.group(1) else 1
    coil = {1: "SVC", 2: "DVC", 4: "QVC"}.get(coils)
    ohm = num(mi.group(2)) if mi else None
    pw = g(t, r"Power [Hh]andling \((?:RMS|RMS/SPL|RMS/max\.|RMS / max\.|RMS/Max\.)\)") or ""
    rms = num(pw.replace(",", "")); pk = re.search(r"/\s*([\d,.]+)", pw); peak = num(pk.group(1).replace(",", "")) if pk else None
    if mi is None:
        coil = None
        md = re.search(r"-D(\d)\b", model)
        if md: coils, coil, ohm = 2, "DVC", int(md.group(1))
    xm = g(t, r"Max\. Excursion \(Xmax\)")
    xp = num(xm) if xm else None
    p = dict(fs_hz=num(g(t, r"Resonance frequency \(Fs\)")), qts=num(g(t, r"(?:Damping ratio|Overall quality|Total quality|Total Q) \(Qts\)")), vas_l=num(g(t, r"Equiv\. air volume \(Vas\)")),
             xmax_mm=(xp / 2 if xp else None))
    eff = g(t, "Efficiency")
    
    notes = []
    if xp: notes.append(f"Printed 'Max. Excursion (Xmax)' {xm}; Ground Zero prints Xmax peak-to-peak on its data sheets (A3 finding), so xmax_mm = printed / 2 (calculated).")
    if eff: notes.append(f"Efficiency {eff} printed without a reference (1 W or 2.83 V); not stored.")
    pr = g(t, "Power recommendation")
    if pw and peak: notes.append(f"Power printed '{pw}' (RMS / SPL or max); second figure entered as peak_w.")
    if mi is None and coil: notes.append("Impedance not printed on the page; coil and ohms taken from the model name (-D1/-D2).")
    if pr: notes.append(f"Power recommendation {pr}.")
    mdl = g(t, "Model")
    cutm = g(t, "Mounting Ø")
    if mdl: notes.append(f"Maker line: {mdl}.")
    if model.startswith("GZCS"): notes.append("Car-specific (OEM-fit) subwoofer driver.")
    dep = g(t, "Mounting depth")
    drivers.append(rec(model, size, coil, ohm, rms, peak, p, "per_coil" if coil == "SVC" else "unknown",
                       depth_mm=num(dep) if dep and "mm" in dep else None, cut_mm=num(cutm) if cutm and "mm" in cutm else None, status="current",
                       sources=[src(url, doc="Ground Zero product page (English), Additional information table")], notes=" ".join(notes)))
save("world", "ground-zero", "Ground Zero", "Germany", "https://www.ground-zero-audio.com",
     "R2 2026-11-23: product pages listed from the four subwoofer category pages and read 3 s apart, one at a time. EU maker: per-model facts only. Numbers only.",
     drivers, [], coverage="every subwoofer driver in the maker's 6.5-8, 10, 12 and 15 in categories (incl. 16/20/25/30/38 cm lines and car-specific drivers); page T/S are Fs, Qts, Vas only")
