#!/usr/bin/env python3
"""R2_SUBS_ALL: Massive Audio (Los Angeles, USA) car subwoofers, all power levels, from the SPECIFICATIONS table in each product
description of the store's public /products.json (saved by A2 on 2026-11-21 in references/raw/hp_subs/us/massive-audio/, re-used
2026-11-23, no new requests). The maker notes '*T/S Parameters on website supersede user manual specifications'.
hp_subs_raw records (from the user guides, >= 2000 W, per-coil/parallel/series) are kept and win over same-model page records.
Usage: python3 -I build_massive.py"""
import sys, re, glob, json, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num, L, mm
R = "/workspace/references/raw/hp_subs/us/massive-audio/"
P = [p for f in sorted(glob.glob(R + "products_*.json")) for p in json.load(open(f))["products"]]
SKIP = r"(?i)enclos|\bbox|amplif|grill|loaded|powered|tube|cable|recone|kit|bundle|package|cover|\bring|adapter|spacer|harness|combo|marine|speaker\b|tweeter|horn|mid|dsp"


def g(t, label):
    m = re.search(r"\|" + label + r"\|([^|]+)", t, re.I)
    return m.group(1).strip() if m else None


drivers = []
for p in P:
    t0 = p["title"]
    if not re.search(r"(?i)subwoofer", t0) or re.search(SKIP, t0): continue
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); t = "|" + re.sub(r"(\s*\|\s*)+", "|", re.sub(r"\s+", " ", b))
    model = re.split(r"\s*-\s+", t0)[0].strip()
    size = num(g(t, "Size")) or num((re.search(r"(\d+(?:\.\d+)?)\"", t0) or [None, None])[1])
    vc = g(t, "Voice Coil") or t0
    mc = re.search(r"(?i)(dual|single|quad)\s*([\d.]+)[- ]ohm", vc) or re.search(r"(?i)(dual|single|quad)\s*([\d.]+)[- ]ohm", t0)
    coil = {"dual": "DVC", "single": "SVC", "quad": "QVC"}.get(mc.group(1).lower()) if mc else None
    ohm = num(mc.group(2)) if mc else None
    rms = num((g(t, "RMS Power") or "").replace(",", "")) or num((re.search(r"([\d,]+) Watts RMS", t0) or [None, "x"])[1].replace(",", ""))
    peak = num((g(t, "Peak Power") or "").replace(",", ""))
    inch = lambda s: num(s) if s and ("″" in s or '"' in s) else None
    disp = g(t, "Driver Displacement")
    params = dict(fs_hz=num(g(t, r"Fs, Resonant Frequency")), re_ohm=num(g(t, r"Re, DC Resistance")), le_mh=num(g(t, r"Le, Voice Coil Inductance")),
                  bl_tm=num(g(t, r"BL, Force Factor")), qms=num(g(t, r"Qms, Mechanical Q")), qes=num(g(t, r"Qes, Electrical Q")), qts=num(g(t, r"Qts, Total Q")),
                  vas_l=num(g(t, r"Vas, Equivalent Compliance Volume")), mms_g=num(g(t, r"Mms, Moving Mass")), sd_cm2=num(g(t, r"Sd, Effective Cone Area")),
                  xmax_mm=num(g(t, "Xmax")))
    s283 = g(t, "Sensitivity"); s1w = g(t, r"Sensitivity, 1 W/1 m")
    if s283 and "2.8" in s283: params["spl_db_2v83"] = num(s283)
    if s1w: params["spl_db_1w1m"] = num(s1w)
    par = (s283 and "parallel" in s283) or (s1w and "parallel" in s1w)
    notes = "Specifications table in the product description (maker: website T/S supersede the user manual)."
    if par: notes += " Sensitivity rows say 'parallel wiring'; the T/S basis is not stated (Re suggests parallel where Re is about half the coil impedance; inference)."
    if params["xmax_mm"] is None and g(t, "Xmax"): notes += f" Xmax printed '{g(t, 'Xmax')}'."
    for lab in ("Sealed Enclosure Volume", "Ported Enclosure Volume", "Ported Tuning"):
        v = g(t, lab)
        if v: notes += f" {lab}: {v} (as printed, not converted)."
    r = rec(model, size, coil, ohm, rms, peak, params, "unknown", depth_in=inch(g(t, "Mounting Depth")), cut_in=inch(g(t, "Mounting Cutout Diameter")),
            disp_cuft=num(disp) if disp and "ft" in disp else None, status="current",
            sources=[src("https://www.massiveaudio.com/products/" + p["handle"], doc="product page description, SPECIFICATIONS (via public products.json)")], notes=notes)
    if coil is None: r["final_loads_ohm"] = []
    drivers.append(r)
# R2B_SUBS_MORE (2026-11-23): T/S from maker manuals (scripts/car_subs/image_reads/massive.py) for models whose description has none.
sys.path.insert(0, "/workspace/scripts/car_subs/image_reads"); import massive as MA
MCDN = {}
for f in sorted(glob.glob(R + "products_*.json")):
    for p in json.load(open(f))["products"]:
        for u in re.findall(r'https?://[^"\s]+\.pdf', p.get("body_html") or ""): MCDN.setdefault(u.rsplit("/", 1)[1], u)
by = {d["model"]: d for d in drivers}
for model, fn, pg, how, prm, note in MA.ROWS:
    d = by.get(model)
    if d is None: print("Massive manual row without listing record:", model); continue
    if any(d["params"].get(k) is not None for k in ("fs_hz", "qts", "vas_l")): print("Massive: description already has T/S, manual row skipped:", model); continue
    qc = prm["qms"] * prm["qes"] / (prm["qms"] + prm["qes"])
    print(f"Massive {model}: Qts {prm['qts']} vs Qms*Qes/(Qms+Qes) {qc:.3f}")
    d["params"].update(prm); d["ts_basis"] = "series"
    d["sources"].append(src(MCDN.get(fn, fn), doc=f"maker manual PDF p.{pg}" + (" (image only): T/S READ FROM IMAGE" if how == "image" else " (text layer)"), page=str(pg)))
    d["notes"] += (" T/S READ FROM IMAGE" if how == "image" else " T/S from the maker manual text") + f" ({fn} p.{pg}), double-checked: printed Qts {prm['qts']} vs Qms*Qes/(Qms+Qes) {qc:.3f}. " + note
save("us", "massive-audio", "Massive Audio", "USA", "https://www.massiveaudio.com",
     "R2 2026-11-23: re-used the store's public /products.json saved by A2 on 2026-11-21 (no new requests). Numbers only.",
     drivers, [], coverage="every car subwoofer product in the store listing; products whose description has no T/S table are listed incomplete")
