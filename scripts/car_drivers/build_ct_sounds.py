#!/usr/bin/env python3
"""R4_CAR_DRIVERS: CT Sounds (USA) car speakers from the maker's Shopify catalogue (ctsounds.com/products.json, read 2026-11-23,
2 requests 3 s apart). Values from the 'Label:|value' specification lists in each product description (woofer, tweeter, crossover,
mounting sections). Imperial dimensions converted to mm (x25.4). USD prices not stored (not AU). Subwoofers (R2), home audio,
box designs, amps left out. Raw: references/raw/car_drivers/ct-sounds/. Usage: python3 -I build_ct_sounds.py"""
import sys, re, json, glob, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
R = "/workspace/references/raw/car_drivers/ct-sounds/"
ps = []
for f in sorted(glob.glob(R + "products_*.json")): ps += json.load(open(f))["products"]


def sections(b):
    toks = [x.strip() for x in b.split("|") if x.strip()]
    d = {"main": {}}; cur = "main"; key = None
    for x in toks:
        if re.match(r"^(Tweeter Specifications|Crossover Specifications|Mounting Specifications|Install Specifications|Mounting Info|Specifications|Woofer Specifications|Midrange Specifications|Thiele)", x):
            cur = "tweeter" if x.startswith("Tweeter") else ("xo" if x.startswith("Crossover") else ("mount" if re.match(r"^(Mounting|Install)", x) else "main"))
            d.setdefault(cur, {}); key = None; continue
        if x.endswith(":"): key = x[:-1].strip(); d[cur].setdefault(key, []); continue
        if key: d[cur][key].append(x); key = key  # values follow
    return {s: {k: " ".join(v) for k, v in kv.items()} for s, kv in d.items()}


def g(d, sec, *keys):
    for k, v in d.get(sec, {}).items():
        for kk in keys:
            if k.lower().startswith(kk.lower()): return v
    return None


def inch_mm(v):
    if not v: return None
    m = re.search(r"([\d.]+)\s*(?:\"|”|in)", v)
    if m: return round(num(m.group(1)) * 25.4, 1)
    m = re.search(r"([\d.]+)\s*mm", v)
    return num(m.group(1)) if m else None


def hzv(v):
    if not v: return None
    m = re.search(r"([\d.,]+)\s*(k?)Hz", v)
    return num(m.group(1).replace(",", "")) * (1000 if m.group(2) == "k" else 1) if m else None


out = []
for p in ps:
    pt = p.get("product_type") or ""; title = p["title"]
    if pt != "Motor Vehicle Speakers": continue
    code = title.split("//")[0].strip(); tl = title.lower()
    if "horn driver" in tl or "tweeter" in tl: typ = "tweeter"
    elif "component" in tl: typ = "component_set"
    elif "cox" in code.lower() or "coaxial" in tl or "shallow-mount car speakers" in tl: typ = "coaxial"
    elif "midrange" in tl:
        typ = "midbass" if re.search(r"\b(6\.5|8|10)", title) else "midrange"
    else: typ = "coaxial"
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); b = re.sub(r"\s*\|[\s|]*", "|", b)
    d = sections(b)
    url = "https://www.ctsounds.com/products/" + p["handle"]
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:\"|”|″)\s*(?:x\s*(\d+)\s*(?:\"|”|″))?", title.split("//")[-1])
    mo = re.search(r"(\d)x(\d+)", title)
    size = None; lab = None
    if mo: lab = f"{mo.group(1)}x{mo.group(2)}"
    elif m: size = num(m.group(1))
    rms = peak = None; pw_basis = None
    pw = g(d, "main", "Power Per") if "3-way" not in tl else None  # 3-way set: 'Power per Speaker' belongs to the 3 in midrange section
    if pw:
        mr = re.search(r"(\d+)\s*W\s*\(?RMS", pw); mp = re.search(r"(\d+)\s*W\s*\(?MAX", pw, re.I)
        rms = num(mr.group(1)) if mr else None; peak = num(mp.group(1)) if mp else None; pw_basis = "per driver (maker 'Power Per ...')"
    else:
        r1 = g(d, "main", "RMS Power"); r2 = g(d, "main", "MAX Power", "Peak Power")
        if r1: rms = num(r1); peak = num(r2) if r2 else None; pw_basis = "as printed '" + r1 + "'" + (" (pair rating)" if "pair" in r1.lower() else "")
        else:
            mt = re.search(r"(\d+)\s*Watts?\s*RMS", title)
            if mt: rms = num(mt.group(1)); pw_basis = "from product title"
    z = g(d, "main", "Impedance Per", "Impedance", "Nominal Impedance")
    zo = num((re.search(r"(\d+(?:\.\d+)?)\s*-?\s*Ohm", z or "") or [None, None])[1]) if z and re.search(r"(\d+(?:\.\d+)?)\s*-?\s*Ohm", z) else None
    if zo is None:
        mz = re.search(r"-(\d)$", code); zo = num(mz.group(1)) if mz else None
    spl = g(d, "main", "Output SPL", "Sensitivity") or g(d, "tweeter", "Output SPL")
    sens = num((re.search(r"([\d.]+)\s*dB", spl or "") or [None, None])[1]) if spl and re.search(r"([\d.]+)\s*dB", spl) else None
    frs = g(d, "main", "Frequency Response") or (g(d, "tweeter", "Frequency Response") if typ == "tweeter" else None)
    fr = None
    if frs:
        mf = re.findall(r"([\d.,]+)\s*(k?)Hz", frs)
        if len(mf) >= 2: fr = [num(mf[0][0].replace(",", "")) * (1000 if mf[0][1] else 1), num(mf[1][0].replace(",", "")) * (1000 if mf[1][1] else 1)]
    allkv = {k: v for s_ in d.values() for k, v in s_.items()}
    def tsv(*keys, pat=r"([\d.]+)"):
        for k, v in allkv.items():
            for kk in keys:
                if re.fullmatch(kk, k, re.I):
                    mm_ = re.search(pat, v); return num(mm_.group(1)) if mm_ else None
        return None
    params = {"fs_hz": tsv(r"Fs.*", r"Resonant Frequency.*", r"Free Air Resonance.*"), "qts": tsv(r"Qts.*"), "qes": tsv(r"Qes.*"), "qms": tsv(r"Qms.*"),
              "vas_l": None, "sd_cm2": None, "xmax_mm": tsv(r"Xmax.*", pat=r"([\d.]+)\s*mm"), "re_ohm": tsv(r"Re\b.*", r"DC Resistance.*", r"Rdc.*"),
              "mms_g": tsv(r"Mms.*"), "bl_tm": tsv(r"BL.*", r"Bl.*"), "le_mh": tsv(r"Le\b.*"), "spl_db_1w1m": sens if spl and "1w/1m" in (spl + " ".join(allkv)).lower() else None}
    vas = next((v for k, v in allkv.items() if re.match(r"^Vas", k, re.I)), None)
    if vas:
        ml = re.search(r"([\d.]+)\s*(?:L|liters?)\b", vas); mc = re.search(r"([\d.]+)\s*(?:cu\.? ?ft|ft)", vas)
        params["vas_l"] = num(ml.group(1)) if ml else (round(num(mc.group(1)) * 28.3168, 2) if mc else num(vas))
    sdv = next((v for k, v in allkv.items() if re.match(r"^Sd", k, re.I)), None)
    if sdv:
        mc2 = re.search(r"([\d.]+)\s*cm", sdv); mi2 = re.search(r"([\d.]+)\s*(?:sq|in)", sdv)
        params["sd_cm2"] = num(mc2.group(1)) if mc2 else (round(num(mi2.group(1)) * 6.4516, 1) if mi2 else num(sdv))
    hp = g(d, "main", "Recommended High Pass") or g(d, "tweeter", "Recommended High Pass") or g(d, "xo", "Recommended High Pass")
    xover = {"hp_hz": hzv(hp), "note": "maker 'Recommended High Pass Crossover' " + hp} if hp else None
    passive = None
    if d.get("xo") or g(d, "tweeter", "Crossover Circuit") or g(d, "main", "Crossover Circuit"):
        # P1_PUBLIC_DATA: the "What's Included" box-contents list is not kept
        passive = {"as_printed": {**{k: v for k, v in d.get("xo", {}).items() if not re.match(r"(?i)what.s included", k)}, **{k: v for k, v in d.get("tweeter", {}).items() if k.startswith("Crossover")}, **{k: v for k, v in d["main"].items() if k.startswith(("Crossover", "Capacitor"))}}}
    mag = (g(d, "main", "Magnet Type") or "").lower() or None
    extra = {"title": title}
    if d.get("tweeter") and typ in ("component_set", "coaxial"): extra["tweeter_part_as_printed"] = d["tweeter"]
    notes = ["Imperial dimensions converted to mm (x25.4) from the maker description."]
    if pw_basis: notes.append("Power: " + pw_basis + ".")
    if params["fs_hz"] and not params["qts"]: notes.append("Only Fs printed (no full T/S).")
    r = rec(f"CT Sounds {code}", typ, size, lab, zo, "SVC", rms, peak, sens, "1W/1m" if sens and spl and "1w/1m" in spl.lower() + " ".join(allkv).lower() else ("unknown" if sens else None),
            fr, mag, params, "unknown", depth_mm=inch_mm(g(d, "mount", "Mounting Depth") or g(d, "main", "Mounting Depth")),
            cutout_mm=inch_mm(g(d, "mount", "Cutout Diameter", "Cut-out Diameter") or g(d, "main", "Cutout Diameter", "Cut-out Diameter")),
            frame_mm=inch_mm(g(d, "mount", "Overall Diameter") or g(d, "main", "Overall Diameter")), xover=xover, passive=passive,
            sources=[src(url, ["*"], doc="maker product description (Shopify products.json)")], notes=" ".join(notes), extra=extra)
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("ct-sounds", "CT Sounds", "USA", "https://www.ctsounds.com", "R4 2026-11-23: Shopify products.json read (2 requests, 3 s apart). Numbers only.", out)
