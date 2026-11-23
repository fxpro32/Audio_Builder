#!/usr/bin/env python3
"""R2_SUBS_ALL: DS18 (Miami, USA) car subwoofers, all power levels, from the SPECIFICATIONS / THIELE & SMALL PARAMETERS / MEASUREMENTS
blocks in each product description of the store's public /products.json (saved by A2 on 2026-11-21 in references/raw/hp_subs/us/ds18/,
re-used 2026-11-23, no new requests). hp_subs_raw records (from owner's manuals, >= 2000 W) are kept and win over same-model page records.
Products without a T/S block are listed incomplete. Enclosures, kits, accessories, pro/mid-bass woofers and test products left out.
Usage: python3 -I build_ds18.py"""
import sys, re, glob, json, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num, L
R = "/workspace/references/raw/hp_subs/us/ds18/"
P = [p for f in sorted(glob.glob(R + "products_*.json")) for p in json.load(open(f))["products"]]
SKIP = r"(?i)enclos|\bbox|amplif|grill|loaded|powered|tube|cable|recone|kit|bundle|package|cover|ring|adapter|spacer|harness|test-product|\[test|mid-bass|receiver|equalizer|combo|tactical|bass knob"


def body(p):
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); return "|" + re.sub(r"(\s*\|\s*)+", "|", re.sub(r"\s+", " ", b))


def g(t, *labels):
    for lab in labels:
        m = re.search(r"\|" + re.escape(lab) + r"\|([^|]+)", t, re.I)
        if m: return m.group(1).strip()
    return None


def mmv(s):
    if not s: return None
    m = re.search(r"([\d.]+)\s*mm", s)
    return float(m.group(1)) if m else None


drivers, seen = [], set()
for p in P:
    t0 = p["title"]
    if not re.search(r"(?i)subwoofer", t0) or re.search(SKIP, t0 + " " + p["handle"]): continue
    sku = (p["variants"][0].get("sku") or "").strip()
    if not sku or sku in seen: continue
    seen.add(sku)
    t = body(p)
    size = num(g(t, "Nominal Diameter"))
    if not size:
        ms = re.search(r"(\d+(?:\.\d+)?)(?:\"|”| inch)", t0); size = num(ms.group(1)) if ms else None
    imp = g(t, "Nominal Impedance") or ""
    mi = re.search(r"([\d.]+)\s*\+\s*([\d.]+)", imp)
    if mi: coil, ohm = "DVC", num(mi.group(1))
    else:
        mt = re.search(r"(?i)(DVC|SVC|Dual|Single)[^|]*?([\d.]+)[- ]?Ohm", t0) or re.search(r"(?i)([\d.]+)[- ]?Ohm\s*(DVC|SVC)", t0)
        if mt:
            a, b = mt.groups()
            if a[0].isdigit(): a, b = b, a
            coil, ohm = ("DVC" if a.upper() in ("DVC", "DUAL") else "SVC"), num(b)
        else:
            coil, ohm = None, num(imp)
    rms = num((g(t, "RMS Power Handling", "RMS Power") or "").replace(",", ""))
    if rms is None:
        mr = re.search(r"([\d,]+)\s*(?:W|Watts)\s*RMS", t0, re.I); rms = num(mr.group(1).replace(",", "")) if mr else None
    peak = num((g(t, "MAX Power Handling", "Max Power") or "").replace(",", ""))
    re_s = g(t, "DC Resistance")
    params = dict(vas_l=num(g(t, "Equivalent Volume")), xmax_mm=num(g(t, "Excursion (one way)", "Xmax")), fs_hz=num(g(t, "Free Air Resonance", "Fs")),
                  qms=num(g(t, "Mechanical Factor", "Qms")), qes=num(g(t, "Electrical Factor", "Qes")), qts=num(g(t, "Total Factor", "Qts")),
                  mms_g=num(g(t, "Moving Mass", "Mms")), bl_tm=num(g(t, "BL Factor", "BL")), sd_cm2=num(g(t, "Cone Area", "Sd")),
                  re_ohm=num(re_s.split("+")[0]) if re_s else None, spl_db_1w1m=num(g(t, "Sensitivity (1w/1m)", "Sensitivity")))
    disp = g(t, "Displacement Volume")
    dl = L(num(disp)) if disp and "ft" in disp else None
    notes = ("T/S block printed in the product description. " + ("DC resistance printed per coil ('a + b'); re_ohm = one coil; ts_basis not stated. " if re_s and "+" in re_s else "")
             + ("Displacement printed in cu ft, converted. " if dl else "") + ("Vas printed without unit check: litres as printed. " if params["vas_l"] else ""))
    r = rec(f"{sku}", size, coil, ohm, rms, peak, params, "per_coil" if coil == "SVC" else "unknown",
            depth_mm=mmv(g(t, "Mounting Depth")), cut_mm=mmv(g(t, "Front Mount Baffle Cutout", "Cutout Diameter", "Mounting Cutout")), disp_l=dl,
            status="current", sources=[src("https://ds18.com/products/" + p["handle"], doc="product page description (via public products.json)")], notes=notes)
    if coil is None: r["final_loads_ohm"] = []
    x = r["params"]["xmax_mm"]
    if x is not None and x < 2:
        r["params"]["xmax_mm"] = None; r["notes"] += f" Excursion printed as '{x}' with unit mm, implausible (inches?); not entered."
    c = r["cutout_mm"]
    if c and size and not (0.7 * size * 25.4 <= c <= 1.0 * size * 25.4):
        r["notes"] += f" DATA PROBLEM: cut-out {c} mm implausible for a {size} in driver (likely copied from another size); check."
    drivers.append(r)
save("us", "ds18", "DS18", "USA", "https://ds18.com",
     "R2 2026-11-23: re-used the store's public /products.json saved by A2 on 2026-11-21 (no new requests). Numbers only.",
     drivers, [], coverage="every car subwoofer product in the store listing; those without a T/S block are listed incomplete")
