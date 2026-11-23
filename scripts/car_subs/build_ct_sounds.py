#!/usr/bin/env python3
"""R2_SUBS_ALL: CT Sounds (USA) car subwoofers, all power levels, parsed from the product descriptions in the maker's public
Shopify /products.json (saved 2026-11-21 by A2 in references/raw/hp_subs/us/ct-sounds/products_*.json, re-used here, read 2026-11-23).
One T/S block per product page: it belongs to the coil option named in 'Voice Coil Configuration' (other coil options sold on the
same page are listed with that note). EXO-12 D1/D2 come from hp_subs_raw. Usage: python3 -I build_ct_sounds.py"""
import sys, re, glob, json, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save, num, L, mm
R = "/workspace/references/raw/hp_subs/us/ct-sounds/"
U = "https://www.ctsounds.com/products/"
P = [p for f in sorted(glob.glob(R + "products_*.json")) for p in json.load(open(f))["products"]]
LINES = ("thermo", "bio", "hydro", "ozone", "tropo", "meso", "strato", "exo")


def body(p):
    t = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


def g(t, label):
    m = re.search(r"\|" + re.escape(label) + r"\|([^|]+)", t)
    return m.group(1).strip() if m else None


drivers, no_ts = [], []
for p in P:
    h = p["handle"]
    if not re.match(r"(%s)(-xl)?-(\d+|6-5)$" % "|".join(LINES), h) or h == "exo-12": continue
    t = body(p)
    size = num(g(t, "Subwoofer Size:"))
    if h.endswith("6-5"): size = 6.5
    vc = g(t, "Voice Coil Configuration:") or ""
    m = re.search(r"(Single|Dual)\s+([\d.]+)\s*Ohm", vc)
    coil = {"Single": "SVC", "Dual": "DVC"}.get(m.group(1)) if m else None
    ohm = num(m.group(2)) if m else None
    rms, peak = num(g(t, "RMS Power:")), num(g(t, "MAX Power:"))
    def unit(lbl):
        v = g(t, lbl)
        return None if not v or v.strip() in ("/", "-") else num(v)
    params = dict(qes=unit("Qes:"), qms=unit("Qms:"), qts=unit("Qts:"), fs_hz=unit("Fs:"), vas_l=unit("Vas:"), mms_g=unit("Mms:"), re_ohm=unit("Re:"),
                  bl_tm=unit("Bl:"), le_mh=unit("Le:"), sd_cm2=unit("Sd:"), xmax_mm=unit("Xmax - Single Way (mm):"), spl_db_1w1m=unit("SPL:"))
    def inch(lbl):
        v = g(t, lbl)
        return num(v) if v and '"' in v else None
    depth, cut = inch("Mounting depth"), inch("Cutout diameter")
    disp = re.search(r"\|Displacement\|([\d.]+) ft\|3", t)
    boxes = []
    for curve, lbl in (("SQ", r"Flat Response Curve \(SQ\):"), ("SPL", r"Boomer Response Curve \(SPL\):")):
        mm_ = re.search(lbl + r"\|Sealed\|([^|]+)\|(?:3\|)?Ported\|([^|]+)\|(?:3\|)?Tuning Frequency\|([\d.]+) Hz", t)
        if mm_:
            s, pv, tu = mm_.group(1), mm_.group(2), mm_.group(3)
            if re.match(r"[\d.]+ ft", s): boxes.append(box("sealed (%s curve)" % curve, num(s), None, "maker page " + h))
            if re.match(r"[\d.]+ ft", pv): boxes.append(box("ported (%s curve)" % curve, num(pv), num(tu), "maker page " + h))
    opts = [o["values"] for o in p.get("options", []) if o["values"] != ["Default Title"]]
    notes = ("T/S block printed once per product page; it is for the coil option named under 'Voice Coil Configuration'"
             + (f"; other options on the same page: {opts}." if opts else ".")
             + " Cms printed with unit 'm/N' (evidently mm/N), not stored. SPL reference (1 W or 2.83 V) not stated; entered as 1 W/1 m. ts_basis not stated.")
    re_ = params["re_ohm"]
    if coil == "DVC" and re_ and ohm:
        if re_ < 0.75 * ohm: notes += f" Re {re_} ohm on dual {ohm} ohm coils suggests the T/S were measured with the coils in parallel (inference)."
        elif re_ > 1.5 * ohm: notes += f" Re {re_} ohm on dual {ohm} ohm coils suggests coils in series (inference)."
    name = p["title"].split("//")[0].strip()
    model = f"{name} D{ohm}" if coil == "DVC" else (f"{name} S{ohm}" if coil else name)
    r = rec(model, size, coil, ohm, rms, peak, params, "unknown", depth_in=depth, cut_in=cut, disp_cuft=float(disp.group(1)) if disp else None,
            boxes=boxes, status="current", sources=[src(U + h, doc="product page description (Specs / Box Specs), via the store's public products.json")], notes=notes)
    if not coil: r["final_loads_ohm"] = []
    drivers.append(r)
save("us", "ct-sounds", "CT Sounds", "USA", "https://www.ctsounds.com",
     "R2 2026-11-23: re-used the store's public /products.json saved by A2 on 2026-11-21 (no new requests). Numbers only.",
     drivers, [], coverage="all current component subwoofers in the store listing (Bio, Hydro, Meso, Ozone, Strato, Thermo, Tropo, Tropo XL, EXO); one coil option per page has T/S")
