#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Audiofrog (USA) car speakers (GB and GS series) from audiofrog.com product pages, read 2026-11-23 3 s apart.
'Technical Details' list gives impedance, power, response, sensitivity (2.83 V/1 m), recommended high/low-pass, mounting data and the
'Thiele & Small Parameters' (Revc, Levc, Sd, Mms, Cms, Vas, Fs, BL, Qms, Qes, Qts, Xmax one-way linear). Passive crossover pages
(GB2510C ...) are stored as notes on the matching drivers' sets only if they give numbers. OE-housing tweeter variants
(GB10OE-00xx) are the same drivers in vehicle housings and are left out. Raw: references/raw/car_drivers/audiofrog/.
Usage: python3 -I build_audiofrog.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/audiofrog/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def kv(t):
    i = t.find("|Technical Details|"); i2 = t.find("|Technical Details|", i + 5); i = i2 if i2 > 0 else i
    j = t.find("|Downloads|", i)
    if i < 0: return {}, ""
    seg = t[i:j if j > 0 else i + 4000]
    d = {}
    for tok in seg.split("|"):
        m = re.match(r"^([^:]{2,80}):\s*(.+)$", tok.strip())
        if m: d.setdefault(m.group(1).strip(), m.group(2).strip())
    return d, seg


def first(d, *keys):
    for k in d:
        for kk in keys:
            if k.lower().startswith(kk.lower()): return d[k]
    return None


def hz(s):
    if not s: return None
    m = re.search(r"([\d.,]+)\s*(k?Hz)", s)
    return num(m.group(1).replace(",", "")) * (1000 if m.group(2) == "kHz" else 1) if m else None


out, sets = [], []
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    d, seg = kv(t)
    slug = url.rstrip("/").split("/")[-1]; code = slug.split("-")[0].upper()
    if re.search(r"\d+C$", code):  # passive crossover network
        sets.append((code, url, d)); continue
    if not d: print("no table", fn); continue
    if code in ("GB10", "GS10", "GB15"): typ = "tweeter"
    elif code in ("GS42", "GS62", "GS682", "GS693"): typ = "coaxial"
    elif code in ("GB25", "GS25"): typ = "fullrange" if "full-range" in slug else "midrange"
    elif code in ("GB40", "GS40"): typ = "midrange"
    elif code in ("GB60", "GS60", "GS690"): typ = "midbass"
    else: typ = "midbass"
    size = {"GB10": 1, "GS10": 1, "GB15": 1.5, "GB25": 2.5, "GS25": 2.5, "GB40": 4, "GS40": 4, "GS42": 4, "GB60": 6.5, "GS60": 6.5, "GS62": 6.5}.get(code)
    lab = {"GS682": "6x8", "GS690": "6x9", "GS693": "6x9"}.get(code)
    rms = num(first(d, "RMS Power Handling")); peak = num(first(d, "Peak Power Handling"))
    fr = None
    m = re.search(r"([\d.,]+)\s*(k?Hz)\s*[–-]\s*([\d.,]+)\s*(k?Hz)", first(d, "Frequency Response") or "")
    if m: fr = [num(m.group(1)) * (1000 if m.group(2) == "kHz" else 1), num(m.group(3)) * (1000 if m.group(4) == "kHz" else 1)]
    sens = num(first(d, "Sensitivity (2.83"))
    hp = first(d, "Recommended High Pass"); lp = first(d, "Recommended Low Pass")
    sl = re.search(r"(\d+)\s*dB/oct", hp or "")
    xover = {"hp_hz": hz(hp), "lp_hz": hz(lp), "slope_db_oct": int(sl.group(1)) if sl else None,
             "note": "maker: HP " + (hp or "-") + "; LP " + (lp or "-")} if (hp or lp) else None
    xm = first(d, "Xmax")
    p = {"re_ohm": num(first(d, "Revc")), "le_mh": num(first(d, "Levc")), "sd_cm2": num(first(d, "Sd")), "mms_g": num(first(d, "Mms")),
         "vas_l": num(first(d, "Vas")), "fs_hz": num(first(d, "Fs")), "bl_tm": num(first(d, "BL")), "qms": num(first(d, "Qms")),
         "qes": num(first(d, "Qes")), "qts": num(first(d, "Qts")), "xmax_mm": num(xm) if xm and "1-way" in [k for k in d if k.startswith("Xmax")][0] else None,
         "spl_db_2v83": sens}
    if typ == "tweeter" and p.get("vas_l") is not None: pass
    depth = first(d, "Mounting Depth"); cut = first(d, "Mounting Hole", "Cutout", "Cut-out", "Mounting Diameter")
    def mm(s):
        if not s: return None
        m2 = re.search(r"\(([\d.]+)\s*mm\)", s) or re.search(r"([\d.]+)\s*mm", s)
        return num(m2.group(1)) if m2 else None
    extra = {}
    bd = first(d, "Basket Displacement")
    if bd: extra["basket_displacement_as_printed"] = bd
    notes = ["Sensitivity is 2.83 V / 1 m as printed."]
    if xm: notes.append(f"Xmax as printed: '{xm}'.")
    if rms and "with recommended crossover" in (first(d, "RMS Power Handling") or ""): notes.append("Power rating is with the maker's recommended crossover.")
    disc = "DISCONTINUED" in t[t.find("|DISCONTINUED|"):t.find("|DISCONTINUED|") + 400] and code in t[t.find("|DISCONTINUED|"):t.find("|DISCONTINUED|") + 400].upper()
    r = rec(f"Audiofrog {code}", typ, size, lab, num(first(d, "Nominal Impedance")), "SVC", rms, peak, sens, "2.83V/1m" if sens else None, fr, None, p, "per_coil",
            depth_mm=mm(depth), cutout_mm=mm(cut), xover=xover, status="discontinued (maker menu)" if disc else "current",
            sources=[src(url, ["*"], doc="product page, Technical Details")], notes=" ".join(notes), extra=extra)
    out.append(r)
for code, url, d in sets:
    print("crossover page", code, len(d), list(d)[:6])
from collections import Counter
print(Counter(r["type"] for r in out))
save("audiofrog", "Audiofrog", "USA", "https://www.audiofrog.com", "R4 2026-11-23: robots.txt open (Yoast); pages read 3 s apart. Numbers only.", out)
