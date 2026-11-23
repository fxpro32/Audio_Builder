#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Sundown Audio (USA) car speakers (pro-audio midranges/midbass, coaxials, components, super tweeters, horn drivers)
from the maker's Shopify catalogue (sundownaudio.com/products.json, 2 requests 5 s apart, 2026-11-23; R2 saw HTTP 429 at faster
page reading, this feed answered 200). Values from 'Label: value' lines in the product description (power, impedance, X-Max,
mounting depth, sensitivity, frequency response where printed). 'Used' (B-stock) listings, subwoofers (R2) and amps left out.
USD prices not stored. Raw: references/raw/car_drivers/sundown/. Usage: python3 -I build_sundown.py"""
import sys, re, json, glob, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
R = "/workspace/references/raw/car_drivers/sundown/"
ps = []
for f in sorted(glob.glob(R + "products_*.json")): ps += json.load(open(f))["products"]
out, nospec = [], []
for p in ps:
    pt = p.get("product_type") or ""; title = p["title"].strip()
    if not re.search(r"Speakers|Tweeters", pt) or title.startswith("Used") or "Subwoofer" in pt: continue
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); b = re.sub(r"\s*\|[\s|]*", "|", b)
    d = {}
    for tok in b.split("|"):
        m = re.match(r"^\s*([A-Za-z][A-Za-z \-/()]{1,40}?)\s*:\s*(.+)$", tok)
        if m: d.setdefault(m.group(1).strip().lower(), m.group(2).strip())
    tl = title.lower()
    if re.search(r"\bcs\b|component", tl) or re.search(r"-\d(\.\d+)?cs", tl): typ = "component_set"
    elif re.search(r"co-?axial|cx\b|cx ", tl) or re.search(r"cx", title.split()[0].lower()): typ = "coaxial"
    elif re.search(r"tweeter|horn driver|hf-r|sdeh", tl): typ = "tweeter"
    elif re.search(r"3m|3\"", tl): typ = "midrange"
    else: typ = "midbass"
    code = title.split()[0] if not title.startswith("Sundown") else title.split()[2]
    if title.startswith("SA-Series"): code = title.split()[1]
    mo = re.search(r"(\d)\s*\"?\s*x\s*(\d+)\"?", title)
    ms = re.search(r"(\d+(?:\.\d+)?)\s*\"", title) or re.search(r"-(\d+(?:\.\d+)?)", code)
    size = None; lab = None
    if mo: lab = f"{mo.group(1)}x{mo.group(2)}"
    elif ms and typ != "tweeter": size = num(ms.group(1))
    pw = d.get("power handling") or d.get("rms power") or d.get("power") or ""
    mr = re.search(r"(\d+)\s*Watts?\s*RMS", pw, re.I) or re.search(r"(\d+)\s*W", pw)
    rms = num(mr.group(1)) if mr else None
    if rms is None:
        mt = re.search(r"(\d+)\s*Watt", title); rms = num(mt.group(1)) if mt else None
    imp = d.get("impedance", "")
    zs = [num(x) for x in re.findall(r"(\d+(?:\.\d+)?)", imp)]
    xm = d.get("x-max") or d.get("xmax")
    md = d.get("mounting depth")
    depth = None
    if md:
        mmm = re.search(r"([\d.]+)\s*mm", md); mi = re.search(r"([\d.]+)\s*(?:\"|in)", md)
        depth = num(mmm.group(1)) if mmm else (round(num(mi.group(1)) * 25.4, 1) if mi else None)
    sens = None
    msn = re.search(r"(\d{2,3}(?:\.\d)?)\s*dB\s*sensitivity", b, re.I) or re.search(r"sensitivity[^|]{0,20}?(\d{2,3}(?:\.\d)?)\s*dB", b, re.I)
    if msn: sens = num(msn.group(1))
    if d.get("sensitivity"): sens = num(d["sensitivity"])
    fr = None
    mf = re.search(r"([\d.]+)\s*(k?)Hz\s*[-–~]\s*([\d.]+)\s*(k?)Hz", d.get("frequency response", ""), re.I)
    if mf: fr = [num(mf.group(1)) * (1000 if mf.group(2) else 1), num(mf.group(3)) * (1000 if mf.group(4) else 1)]
    params = {"xmax_mm": num(xm) if xm and "mm" in xm else None, "fs_hz": num(d.get("fs")) if d.get("fs") else None, "qts": num(d.get("qts")) if d.get("qts") else None,
              "vas_l": None, "re_ohm": num(d.get("re")) if d.get("re") else None}
    notes = []
    if len(zs) > 1: notes.append(f"Impedance printed as '{imp}' (variants); impedance_ohm = first value.")
    if md and depth and "mm" not in md: notes.append(f"Mounting depth converted from '{md}'.")
    if xm: notes.append(f"X-Max as printed: '{xm}'.")
    if sens: notes.append("Sensitivity from the description text; drive reference not stated.")
    r = rec(f"Sundown Audio {code}", typ, size, lab, zs[0] if zs else None, "SVC", rms, None, sens, "unknown" if sens else None, fr, None, params, "unknown",
            depth_mm=depth, sources=[src("https://sundownaudio.com/products/" + p["handle"], ["*"], doc="maker product description (Shopify products.json)")],
            notes=" ".join(notes), extra={"title": title})
    if not rms and not sens and not depth and not params["xmax_mm"] and not fr:
        nospec.append({"model": r["model"], "type": typ, "url": r["sources"][0]["url"], "note": "No numbers in the product description text."}); continue
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("sundown-audio", "Sundown Audio", "USA", "https://sundownaudio.com", "R4 2026-11-23: Shopify products.json, 2 requests 5 s apart. Numbers only.", out, nospec)
