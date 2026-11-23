#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Ground Zero (Germany) car speakers from the English product pages' specification table
(ground-zero-audio.com/en/<slug>/, listed from the speaker-component, speaker-system and car-specific category pages, read
2026-11-23, 3 s apart). Pages give power, impedance, efficiency, frequency response, mounting diameter and depth, Fs, and on a
few models Qts/Vas/Xmax. Xmax: A3 found Ground Zero prints Xmax peak-to-peak ('Xmax (p2p)'); xmax_mm = printed / 2 (calculated).
Type: maker 'Model' line (component / coaxial / tweeter / midwoofer / midrange); GZ 'midrange' drivers of 6.5 in and larger are
stored as midbass (maker wording kept in maker_description). Car-specific under-seat subwoofers are R2's job and left out.
Raw: references/raw/car_drivers/ground-zero/. Usage: python3 -I build_ground_zero.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/ground-zero/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def table(t):
    i = t.find("|Model|")
    if i < 0:
        i = min([x for x in (t.find("|Diameter|"), t.find("|Impedance|")) if x > 0] or [-1])
        if i < 0: return {}, None
    j = min([x for x in (t.find("|Owner", i), t.find("|‹|", i), t.find("|Ground Zero History", i)) if x > 0] or [i + 2500])
    toks = [x.strip() for x in t[i + 1:j].split("|") if x.strip()]
    d = {}; sec = "main"; k = 0
    SECS = ("Tweeter", "Midwoofer", "Midrange Speaker", "Super Tweeter", "Crossover", "Coax-Speaker")
    while k < len(toks):
        x = toks[k]
        if x in SECS and (k + 1 >= len(toks) or toks[k + 1] in ("Diameter", "Impedance", "Dome", "Cone", "Power handling (RMS/max.)", "Crossover frequency", "Voice coil", "Membran Layout") or x == "Crossover"):
            sec = x; k += 1; continue
        if k + 1 < len(toks):
            key = x.rstrip(":").strip()
            if key.startswith("Damping ratio (Qts"): key = "Qts"
            d.setdefault(sec, {}).setdefault(key, toks[k + 1]); k += 2; continue
        k += 1
    return d, d.get("main", {}).get("Model")


def mmv(s):
    if not s: return None
    m = re.search(r"([\d.,]+)\s*(?:x\s*([\d.,]+)\s*)?mm", s.replace(",", "."))
    if not m: return None
    return [num(m.group(1)), num(m.group(2))] if m.group(2) else num(m.group(1))


def frr(s):
    if not s: return None
    m = re.search(r"([\d.,]+)\s*(k?)Hz\s*[–-]\s*([\d.,]+)\s*(k?)Hz", s.replace(",", "."))
    if not m: return None
    return [num(m.group(1)) * (1000 if m.group(2) else 1), num(m.group(3)) * (1000 if m.group(4) else 1)]


out, nospec = [], []
for fn, url in urls.items():
    path = R + fn
    if not os.path.exists(path): continue
    t = text_of(path)
    raw = open(path, encoding="utf-8", errors="replace").read()
    ti = re.search(r"<title>(.*?)</title>", raw, re.S)
    name = html.unescape(ti.group(1)).split("–")[0].split(" - ")[0].strip() if ti else fn[:-5].upper()
    d, desc = table(t)
    m = d.get("main", {})
    slug = fn[:-5]
    dl = (desc or "").lower()
    if re.search(r"\d+cx", slug): typ = "coaxial"
    elif "component" in dl or re.search(r"car specific 2-way speakers|car specific 2-way$", dl): typ = "component_set"
    elif "coax" in dl: typ = "coaxial"
    elif "tweeter" in dl: typ = "tweeter"
    elif "midwoofer" in dl: typ = "midbass"
    elif "midrange" in dl or "center" in dl or "surround" in dl: typ = "midrange"
    elif re.search(r"-m-\d|gz[a-z]m-", slug): typ = "midrange"
    elif re.search(r"gzcf-|gz[a-z]c-|gz[a-z]f-", slug): typ = "coaxial"
    elif re.search(r"gz[a-z]k-|-k-\d", slug): typ = "component_set" if "component" in dl else "midbass"
    elif re.search(r"gz[a-z]t-|-t-\d", slug): typ = "tweeter"
    else: typ = None
    if not m:
        nospec.append({"model": name, "type": typ or "midbass", "url": url, "note": "No specification table found on the page."}); continue
    if slug in ("gzpf-40sqx-2", "gzuf-60sq-a-2"): typ = "fullrange"  # maker category 'fullrange / midrange speaker' (no tweeter)
    if typ is None: print("no type", slug, desc); continue
    dia = m.get("Diameter") or ""
    size = None; lab = None
    mi = re.search(r"([\d.]+)\s*(?:″|\"|in)", dia); mmd = re.search(r"(\d+)\s*mm", dia)
    NOM = {165: 6.5, 160: 6.5, 200: 8, 250: 10, 100: 4, 130: 5.25, 120: 4.75, 87: 3.5, 80: 3.15, 25: 1, 28: 1.1, 30: 1.2, 26: 1, 20: 0.8, 19: 0.75}
    if mmd and int(mmd.group(1)) in NOM: size = NOM[int(mmd.group(1))]; lab = f"{mmd.group(1)} mm"
    elif mi: size = num(mi.group(1))
    ov = re.search(r"(\d+)\s*[x×]\s*(\d+)\s*(?:″|\"|in)", dia) or re.search(r"(4x6|5x7|6x8|6x9|7x10)", dia) or re.search(r"(46|57|68|69|710)(?=x?spl|cx|sqx|x-|-)", slug.replace("-", "") if re.search(r"gz[a-z]f-69|gz[a-z]f-71|46cx|-69", slug) else "")
    if ov:
        g1 = ov.group(1); lab = f"{g1}x{ov.group(2)}" if ov.lastindex == 2 else {"46": "4x6", "57": "5x7", "68": "6x8", "69": "6x9", "710": "7x10"}.get(g1, g1); size = None
    if typ == "midrange" and size and size >= 6.5: typ = "midbass"
    z = m.get("Impedance") or m.get("Impedanz") or ""
    zm = re.search(r"(?:(\d)\s*x\s*)?([\d.,]+)\s*[Oo]hm", z)
    coil = "DVC" if zm and zm.group(1) == "2" else "SVC"
    zo = num(zm.group(2)) if zm else None
    pw = m.get("Power handling (RMS/max.)") or m.get("Power Handling (RMS/max.)") or m.get("Power handling (RMS)") or m.get("Power Handling") or ""
    pm = re.search(r"([\d,.]+)\s*(?:/\s*([\d,.]+))?\s*Watt", pw)
    rms = num(pm.group(1).replace(",", "").replace(".", "")) if pm else None
    peak = num(pm.group(2).replace(",", "").replace(".", "")) if pm and pm.group(2) else None
    eff = num(m.get("Efficiency"))
    xm = m.get("Xmax (p2p)") or m.get("Max. Excursion (Xmax)")
    p = {"fs_hz": num(m.get("Resonance frequency (Fs)") or m.get("Resonance Frequency (Fs)")), "qts": num(m.get("Qts")),
         "vas_l": num(m.get("Equiv. air volume (Vas)")), "xmax_mm": (num(xm) / 2 if num(xm) else None)}
    notes = ["Efficiency printed without a drive reference; basis unknown."]
    if xm: notes.append(f"Printed Xmax '{xm}' is peak-to-peak; xmax_mm = printed / 2 (calculated).")
    if typ == "midbass" and "midrange" in dl: notes.append("Maker calls it a midrange speaker; stored as midbass by size (6.5 in or larger).")
    if "car specific" in dl or re.search(r"bmw|mb|vw|-cx-", slug): notes.append("Vehicle-specific model (maker wording / naming).")
    extra = {"maker_description": desc}
    xo = d.get("Crossover", {})
    passive = None
    if xo or m.get("Crossover frequency") or m.get("Crossover"):
        passive = {"as_printed": {**xo, **({"Crossover frequency": m["Crossover frequency"]} if m.get("Crossover frequency") else {}), **({"Crossover": m["Crossover"]} if m.get("Crossover") else {})}}
    for s in ("Tweeter", "Midwoofer", "Midrange Speaker", "Super Tweeter"):
        if d.get(s): extra[s.lower().replace(" ", "_") + "_part_as_printed"] = d[s]
    vc = m.get("Voice coil") or m.get("Voice Coil")
    if vc: extra["voice_coil_as_printed"] = vc
    mag = "neodymium" if re.search(r"neo", slug + dl) else None
    r = rec(name, typ, size, lab, zo, coil, rms, peak, eff, "unknown" if eff else None, frr(m.get("Frequency Response") or m.get("Frequency response")), mag,
            p, "unknown", depth_mm=mmv(m.get("Mounting depth") or m.get("Mounting Depth")), cutout_mm=mmv(m.get("Mounting Ø")),
            passive=passive, sources=[src(url, ["*"], doc="product page, specification table")], notes=" ".join(notes), extra=extra)
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out), "no specs:", len(nospec))
TERMS = ("R4 2026-11-23: product pages read 3 s apart, one at a time (R2 read the same site for subs). Site has Terms and Conditions "
         "(not read in full). Numbers only.")
# R4B_DRIVERS_MORE: T/S from the owner's manuals (scripts/car_drivers/manual_ts.py; only empty fields are filled)
import manual_ts as MT
MT.check(MT.GZ, "ground-zero")
_n = 0
for r in out:
    if r["model"] in MT.GZ: _n += 1 if MT.merge(r, MT.GZ[r["model"]], MT.GZM, "ground-zero") else 0
    elif r["model"] in MT.GZ_SETS:
        f, pg = MT.GZ_SET_FILES[r["model"]]; w = MT.GZ[MT.GZ_SETS[r["model"]]]
        _n += 1 if MT.merge(r, (f, pg, w[2], w[3], w[4]), MT.GZM, "ground-zero", via_set=MT.GZ_SETS[r["model"]]) else 0
print("manual T/S merged into", _n, "records")
save("ground-zero", "Ground Zero", "Germany", "https://www.ground-zero-audio.com", TERMS, out, nospec)
