#!/usr/bin/env python3
"""R4_CAR_DRIVERS: DS18 (USA) car speakers from the maker's Shopify catalogue (ds18.com/products.json, 9 pages, read 2026-11-23
3 s apart). Records come from the 'SPECIFICATIONS' / 'THIELE & SMALL PARAMETERS' / 'MEASUREMENTS' lists in each product's
description (label|value pairs). Products whose description has no specification list (spec sheets on the site are images or PDF
manuals, not read) are listed in no_specs_published. Marine, subwoofers (R2), horns' drivers are typed by product_type and title.
Prices on the US store (USD) are not AU prices and are not stored. Raw: references/raw/car_drivers/ds18/. Usage: python3 -I build_ds18.py"""
import sys, re, json, glob, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
R = "/workspace/references/raw/car_drivers/ds18/"
ps = []
import ds18_manuals as DM
MANLIST = {l.split()[0].replace("?dl=1", ""): l.split()[1] for l in open(R + "manuals/list.txt") if l.strip()}
for f in sorted(glob.glob(R + "products_*.json")): ps += json.load(open(f))["products"]


def body(p):
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or ""))
    return re.sub(r"\s*\|[\s|]*", "|", b)


def kv(seg):
    toks = [x.strip() for x in seg.split("|") if x.strip()]
    d = {}; cur = "main"
    for i, x in enumerate(toks):
        if x.isupper() and len(x) > 6 and ("SPECIFICATION" in x or "MEASURE" in x or "PARAMETER" in x):
            cur = "tweeter" if re.search(r"TWEETER|DRIVER SPEC|COMPRESSION", x) else ("woofer" if re.search(r"WOOFER|MID", x) else "main"); continue
        if i + 1 < len(toks): d.setdefault(cur, {}).setdefault(x, toks[i + 1])
    return d


def g(d, *keys):
    for sec in ("main", "woofer"):
        for k, v in d.get(sec, {}).items():
            for kk in keys:
                if k.lower().startswith(kk.lower()): return v
    return None


def ts(d, key, pat=r"(-?\d+(?:\.\d+)?)"):
    v = g(d, key)
    if not v: return None
    m = re.search(pat, v.replace(",", "."))
    return num(m.group(1)) if m else None


def mm(v):
    if not v: return None
    m = re.search(r"([\d.]+)\s*mm", v)
    if m: return num(m.group(1))
    m = re.search(r"([\d.]+)\s*(?:\"|”|″|in)", v)
    return round(num(m.group(1)) * 25.4, 1) if m else None


out, nospec = [], []
for p in ps:
    pt = p.get("product_type") or ""; title = p["title"]; tl = title.lower()
    if "Marine" in pt or "Motorcycle : Subwoofers" in pt or re.search(r"subwoofer|enclosure|grill|recone|tower|package|kit for|amplifier|led|wire", pt + " " + tl, re.I) and not re.search(r"mid|tweeter|coax|component", tl):
        continue
    if not re.search(r"Loudspeakers|Tweeters|Drivers|Speaker|Components|Horns", pt): continue
    if re.search(r"recone|replacement|voice coil|diaphragm", tl): continue
    if re.search(r"\bhorn$|plastic horn|aluminum horn", tl) and not re.search(r"driver|tweeter", tl): continue  # R4B: bare horn bodies are not drivers
    if re.search(r"mid-?range|midrange", tl) and re.search(r"loudspeaker|speaker", tl) and not re.search(r"coax", tl): typ = "midrange"  # R4B: 'Mid-Range Loudspeaker with Bullet' is a midrange
    elif re.search(r"tweeter|super tweeter|compression driver|bullet", tl) or "Tweeters" in pt or "Horns" in pt: typ = "tweeter"
    elif re.search(r"coaxial|2-way|3-way|4-way|hybrid", tl): typ = "coaxial"
    elif re.search(r"component", tl) or "Components" in pt: typ = "component_set"
    elif re.search(r"mid-?bass|midbass|woofer", tl): typ = "midbass"
    elif re.search(r"mid-?range|midrange|mid-high|mid high|loudspeaker", tl): typ = "midrange"
    else: typ = "midrange"
    url = "https://www.ds18.com/products/" + p["handle"]
    b = body(p)
    i = b.find("SPECIFICATIONS")
    sku = (p.get("variants") or [{}])[0].get("sku") or ""
    model = f"DS18 {sku}".strip() if sku else "DS18 " + title[:60]
    man = None
    if i < 0:
        # R4B_DRIVERS_MORE: try the owner's manual PDFs linked in the description (scripts/car_drivers/ds18_manuals.py)
        why = "no manual linked"
        for mu in re.findall(r"https?://[^\"\s]+\.pdf", p.get("body_html") or ""):
            mf = MANLIST.get(mu)
            if not mf: continue
            md, why = DM.manual_kv(mf, sku)
            if md: man = (mu, mf, md); break
        if not man:
            nospec.append({"model": model, "title": title, "type": typ, "url": url, "note": "No specification list in the maker's product description; manual: " + why + "."})
            continue
    d = kv(b[i:]) if not man else man[2]
    dia = g(d, "Nominal Diameter") or ""
    size = None; lab = None
    ov = re.search(r"(?<![\d.])(\d(?:\.\d)?)\s*[\"”″]?\s*[xX×]\s*(\d{1,2})(?![\d.])", dia)
    if ov: lab = f"{ov.group(1)}x{ov.group(2)}"
    else:
        m = re.search(r"([\d.]+)", dia); size = num(m.group(1)) if m else None
        if size and size > 20: size = None  # printed in mm
    fr = None
    m = re.search(r"([\d.,]+)\s*(k?)Hz\s*[-–~]\s*([\d.,]+)\s*(k?)Hz", (g(d, "Frequency Response") or "").replace(" ", ""), re.I)
    if m: fr = [num(m.group(1)) * (1000 if m.group(2).lower() == "k" else 1), num(m.group(3)) * (1000 if m.group(4).lower() == "k" else 1)]
    sens = ts(d, "Sensitivity"); basis = "1W/1m" if "Sensitivity (1w/1m)" in str(d) or "1w/1m" in str(d).lower() else ("unknown" if sens else None)
    hp = g(d, "Recommended Hi", "Recommended HI")
    xover = {"hp_hz": num(re.search(r"([\d.]+)", hp.replace(",", "")).group(1)) * (1000 if "k" in hp.lower() else 1), "note": "maker 'Recommended Hi Pass Crossover' " + hp} if hp and re.search(r"\d", hp) else None
    params = {"fs_hz": ts(d, "Free Air Resonance", r"(\d+(?:\.\d+)?)\s*Hz"), "qms": ts(d, "Mechanical Factor"), "qes": ts(d, "Electrical Factor"), "qts": ts(d, "Total Factor"),
              "vas_l": ts(d, "Equivalent Volume", r"(\d+(?:\.\d+)?)\s*L"), "xmax_mm": ts(d, "Excursion (one way)", r"(\d+(?:\.\d+)?)\s*mm"), "mms_g": ts(d, "Mechanical Mass|", ),
              "bl_tm": ts(d, "BL Factor"), "le_mh": ts(d, "Voice Coil Inductance", r"(\d+(?:\.\d+)?)\s*mH"), "sd_cm2": ts(d, "Cone Area", r"(\d+(?:\.\d+)?)\s*[Cc]m"),
              "re_ohm": ts(d, "DC Resistance"), "spl_db_1w1m": sens if basis == "1W/1m" else None}
    mmv = g(d, "Mechanical Mass")
    if mmv:
        m = re.search(r"Mms\s*([\d.]+)", mmv); params["mms_g"] = num(m.group(1)) if m else None
    mag = (g(d, "Magnet Material") or "").lower() or None
    rms = ts(d, "RMS Power Handling", r"(\d+)") or ts(d, "AES Power Handling", r"(\d+)")
    peak = ts(d, "MAX Power Handling", r"(\d+)") or ts(d, "Peak Power Handling", r"(\d+)") or ts(d, "Program Power Handling", r"(\d+)")
    notes = []
    if not g(d, "RMS Power Handling") and g(d, "AES Power Handling"): notes.append("Power: maker gives AES rating (stored as rms_w) and program/peak.")
    if params["xmax_mm"]: notes.append("Xmax printed as one way.")
    extra = {"title": title}
    md = g(d, "Motor Diameter")
    if md: extra["motor_diameter_mm"] = mm(md)
    od = mm(g(d, "Overall Diameter"))
    r = rec(model, typ, size, lab, ts(d, "Nominal Impedance"), "SVC", rms, peak, sens, basis, fr, mag, params, "unknown",
            depth_mm=mm(g(d, "Mounting Depth")), cutout_mm=mm(g(d, "Front Mount Baffle Cutout", "Baffle Cutout", "Cutout")), frame_mm=od, xover=xover,
            sources=[src(url, ["*"], doc="maker product description (Shopify products.json)")], notes=" ".join(notes), extra=extra)
    if man:
        r["sources"] = [src(man[0], ["*"], doc="maker owner's manual PDF (text layer, layout A)"), src(url, ["model", "type", "title"], doc="maker product description (Shopify products.json)")]
        r["notes"] = ((r["notes"] + " ") if r["notes"] else "") + f"Specifications read from the owner's manual {man[1]} (R4B 2026-11-23); the product description has no spec list."
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out), "no specs:", len(nospec), Counter(x["type"] for x in nospec))
save("ds18", "DS18", "USA", "https://www.ds18.com", "R4 2026-11-23: Shopify products.json (public catalogue feed) read 3 s apart, 9 requests. Numbers only.", out, nospec)
