#!/usr/bin/env python3
"""R4_CAR_DRIVERS: DLS (Sweden) car speakers from dls.se product pages (WooCommerce), read 2026-11-23 3 s apart.
'Specifications' block gives size, power, impedance, frequency range, sensitivity, mounting depth/hole; T/S where printed sit in
the description as 'Fs .. Re .. Qms .. Vas .. Qes .. Qts .. Sd .. BL ..' (decimal commas); crossover lines 'Crossover point (Hz)'.
Type from the page's short description and slug (coaxial / kit / tweeter / midrange / midbass). Raw: references/raw/car_drivers/dls/.
Usage: python3 -I build_dls.py"""
import sys, re, os, glob
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/dls/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def n(s):
    if s is None: return None
    m = re.search(r"\d+(?:[.,]\d+)?", s.replace(" ", ""))
    return num(m.group(0).replace(",", ".")) if m else None


out, skipped = [], []
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    i = t.find("|Specifications|"); j = t.find("|Description|", i)
    if i < 0: skipped.append((fn, "no Specifications block")); continue
    toks = [x.strip() for x in t[i + 1:j].split("|")[1:] if x.strip()]
    sp = {}
    for a, b in zip(toks[0::2], toks[1::2]): sp.setdefault(a, b)
    head = t[:i]; segs = re.split(r"\|/\s+", head); crumbs = segs[-1] if len(segs) > 1 else head[-400:]
    parts = [x for x in crumbs.split("|") if x.strip()]
    name = parts[0].strip() if parts else fn[:-5]
    tag = parts[-1].strip() if parts else ""
    desc_end = t.find("|Specifications|", j)
    desc = t[j:desc_end if desc_end > 0 else j + 4000]
    slug = fn[:-5]; tl = (tag + " " + slug).lower()
    wsz = sp.get("Woofer") or sp.get("Size") or ""
    insz = re.search(r"([\d.]+)\s*(?:\"|″)", wsz); mmsz = re.search(r"(\d+)\s*mm", wsz)
    ov = re.search(r"(\d)\s*x\s*(\d+)", wsz)
    size = num(insz.group(1)) if insz else None
    if "coax" in tl or slug.endswith("cx") or "2-way speaker" in tl or "2-way coaxial" in tl or re.search(r"\b2-way\b", tl) and "kit" not in tl: typ = "coaxial"
    elif re.search(r"kit|component|3-way|2way system|2-way system", tl): typ = "component_set"
    elif "tweeter" in tl or (size is not None and size <= 1.25 and not sp.get("Tweeter")): typ = "tweeter"
    elif "midrange" in tl and (size or 0) < 6: typ = "midrange"
    elif re.search(r"midbass|midwoofer|mid-bass|woofer|bass", tl): typ = "midbass"
    elif sp.get("Tweeter") and wsz: typ = "coaxial"
    else: typ = "midrange" if (size or 0) and size < 5 else "midbass"
    TYPES = {"component_set": "crpp-1-6 crpp-2-6 crpp-fo1-6 crpp-mb2-6 crpp-op1-6 crpp-to1-7 crpp-ts1-4 crpp-u6-25 crpp-vo1-6 crpp-mb1-6 crpp-bmw1-4 performance-advantage-pa6-20 rc6-2q rcs5-2 rcs6-2 reference-rc6-28 rz6-2q mb6-2 rc4-2",
             "coaxial": "crpp-2-6cx crpp-bmw1-4cx crpp-fo1-6cx crpp-op1-6cx crpp-to1-7cx crpp-u6cx crpp-vo1-6cx m224 m225 m226 m369 m3710i m526i performance-advantage-pa4 performance-advantage-pa5 performance-advantage-pa6 rc3",
             "tweeter": "crpp-tot-25 crpp-ut25 crpp-vo2-14 crpp-vo2-18 rc25 rc50 reference-rcs25 scandinavia-30",
             "midrange": "crpp-mb3 crpp-vo2-44 crpp-vo2-48 rc3c scandinavia-75",
             "midbass": "crpp-tow-894 crpp-tsw-8 crpp-uw62 crpp-uw64 crpp-uw83 crpp-vo2-64 crpp-vo2-68 reference-rcs6-25 scandinavia-165 scandinavia-165wi"}
    key = slug.replace("dls-cruise-", "").replace("cruise-", "")
    typ = next((k for k, v in TYPES.items() if key in v.split()), typ)
    if re.search(r"tsw-8|uw83", slug) and "sub" in tl: skipped.append((name, "subwoofer (R2)")); continue
    if "subwoofer" in tl: skipped.append((name, "subwoofer (R2)")); continue
    lab = f"{ov.group(1)}x{ov.group(2)}" if ov else (f"{mmsz.group(1)} mm" if mmsz else None)
    if ov: size = None
    if typ == "tweeter" and not insz and mmsz: size = round(int(mmsz.group(1)) / 25.4, 2)
    if typ in ("tweeter",) and sp.get("Tweeter") and not wsz:
        tm = re.search(r"([\d.]+)\s*(?:\"|″)", sp["Tweeter"]); size = num(tm.group(1)) if tm else size; lab = sp["Tweeter"]
    fr = None
    m = re.search(r"([\d ]+)\s*[–-]\s*([\d ]+)\s*Hz", sp.get("Freq.range", ""))
    if m: fr = [num(m.group(1).replace(" ", "")), num(m.group(2).replace(" ", ""))]
    ts = {}
    for k, pat in (("fs_hz", r"\bFs\s+([\d,\.]+)\s*Hz"), ("re_ohm", r"\bRe\s+([\d,\.]+)\s*Ohm"), ("qms", r"\bQms\s+([\d,\.]+)"), ("vas_l", r"\bVas\s+([\d,\.]+)\s*liter"),
                   ("qes", r"\bQes\s+([\d,\.]+)"), ("qts", r"\bQts\s+([\d,\.]+)"), ("sd_cm2", r"\bSd\s+([\d,\.]+)\s*cm"), ("bl_tm", r"\bBL\s+([\d,\.]+\d)"),
                   ("xmax_mm", r"\bXmax\s+([\d,\.]+)\s*mm"), ("mms_g", r"\bMms\s+([\d,\.]+)\s*g")):
        mm_ = re.search(pat, desc)
        if mm_: ts[k] = n(mm_.group(1))
    xo_pt = re.search(r"Crossover point \(Hz\)\s*([\d ,.]+)\s*Hz", desc)
    xo_sl = re.search(r"Crossover[^|]{0,40}?(\d+(?:/\d+)?)\s*dB", desc + "|" + sp.get("Crossover", ""))
    passive = None; xover = None
    if typ in ("component_set", "coaxial") and (xo_pt or xo_sl):
        passive = {"crossover_hz": n(xo_pt.group(1)) if xo_pt else None, "slope_as_printed_db_oct": xo_sl.group(1) if xo_sl else None}
    if typ == "tweeter" and sp.get("Crossover"):
        mx = re.search(r"([\d.,]+)\s*kHz\s*(\d+)\s*dB", sp["Crossover"])
        if mx: passive = {"tweeter_hp_hz": n(mx.group(1)) * 1000, "slope_db_oct": int(mx.group(2)), "note": "included crossover as printed: " + sp["Crossover"]}
    mag = None
    if re.search(r"neodym", desc, re.I): mag = "neodymium (per description)"
    elif re.search(r"ferrite", desc, re.I): mag = "ferrite (per description)"
    extra = {}
    if sp.get("Magnet size"): extra["magnet_diameter_mm"] = n(sp["Magnet size"])
    if sp.get("Cone material"): extra["cone_material"] = sp["Cone material"]
    if sp.get("Tweeter") and typ in ("component_set", "coaxial"): extra["tweeter_size_as_printed"] = sp["Tweeter"]
    notes = ["Sensitivity printed without a drive reference; basis unknown."]
    if ts: notes.append("T/S from the page description text (decimal commas converted).")
    if re.search(r"crpp-(bmw|fo|mb|op|to|vo|ts)", slug): notes.append("Vehicle-specific Cruise model (fits the named vehicle brand).")
    if "legacy" in desc.lower(): notes.append("Listed in the maker's legacy range.")
    notes.append("Type assigned by R4 from the page's short description and specification fields (table TYPES in the builder).")
    sens = n(sp.get("Sensitivity"))
    r = rec(name, typ, size, lab, n(sp.get("Impedance")), "SVC", n(sp.get("Power RMS")), n(sp.get("Power MAX")), sens, "unknown" if sens else None, fr, mag,
            ts, "unknown", depth_mm=n(sp.get("Mounting depth")), cutout_mm=n(sp.get("Mounting hole")), passive=passive,
            sources=[src(url, ["*"], doc="product page, Specifications and description")], notes=" ".join(notes), extra=extra)
    r["maker_tagline_type_words"] = re.findall(r"(?i)coaxial|kit|tweeter|midrange|midbass|midwoofer|woofer|2-way|3-way|component", tag)
    out.append(r)
for a, b in skipped: print("skipped", a, b)
from collections import Counter
print(Counter(r["type"] for r in out))
save("dls", "DLS Svenska", "Sweden", "https://dls.se", "R4 2026-11-23: robots.txt 'Allow: /'; product pages read 3 s apart. Numbers only.", out)
