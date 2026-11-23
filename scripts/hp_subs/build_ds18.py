#!/usr/bin/env python3
"""A2: DS18 (Miami, FL) records parsed from maker owner's manuals (ds18.com/cdn/shop/files/<SKU>_*.pdf, text PDFs, URLs in manual_urls.txt), read 2026-11-21.
Power/coil from the manual; SKUs whose manual was not found go to no_ts_published."""
import sys, re, glob, os, subprocess; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
R = "/workspace/references/raw/hp_subs/us/ds18/"
urls = dict(l.split() for l in open(R + "manual_urls.txt"))
skus = [l.split("'")[1] for l in open(R + "ds18_qual.txt")]
handles = {l.split("'")[1]: l.split(" |")[0].strip() for l in open(R + "ds18_qual.txt")}
def val(t, key):
    m = re.search(r"(?:\.{2,}\s*|^\s*)" + key + r"\s*\.{2,}\s*([^\n]+)", t, re.M)
    return m.group(1).strip() if m else None
def line(t, label):
    m = re.search(re.escape(label) + r"[^\n]*?\.{3,}\s*([^\n]+)", t)
    return m.group(1).strip() if m else None
num = lambda s: float(re.search(r"[\d.]+", s).group(0)) if s and re.search(r"[\d.]+", s) else None
def mmval(s):
    if not s: return None
    m = re.search(r"([\d.]+)\s*mm", s); return float(m.group(1)) if m else None
d, no = [], []
for sku in skus:
    f = R + f"man_{sku}.pdf"; url = "https://ds18.com/products/" + handles[sku]
    m = re.search(r"(\d+)\.(\d)D", sku); size, ohm = int(re.search(r"(\d{2})\.", sku).group(1)), int(m.group(2))
    if not os.path.exists(f):
        no.append({"model": sku, "rms_w": None, "url": url, "note": "Owner's manual not found at the maker CDN under the usual file names; product page has no T/S."}); continue
    txt = f[:-4] + ".txt"
    if not os.path.exists(txt): subprocess.run(["node", "/workspace/scripts/pdf_text.mjs", f, txt], capture_output=True)
    t = re.sub(r"(?:\. ){3,}\.?", " ..... ", open(txt).read())
    rms, peak = num(line(t, "RMS Power Handling")), num(line(t, "MAX Power Handling"))
    imp = line(t, "Nominal Impedance") or ""
    vas = val(t, "Vas"); p = dict(vas_l=num(vas.split("L")[0]) if vas else None, xmax_mm=num(val(t, "Xmax")), fs_hz=num(val(t, "Fs")), qms=num(val(t, "Qms")),
        qes=num(val(t, "Qes")), qts=num(val(t, "Qts")), mms_g=num(val(t, "Mms")), bl_tm=num(val(t, "BL")), le_mh=num(val(t, "Le")), sd_cm2=num(val(t, "Sd")),
        spl_db_1w1m=num(line(t, "Sensitivity (1w/1m)")))
    re_s = val(t, "Re") or ""
    mre = re.fullmatch(r"([\d.]+)\s*\+\s*([\d.]+)\s*(?i:ohms?)", re_s)
    renote = ""
    if mre and float(mre.group(1)) != ohm:  # a measured per-coil DC resistance (not just the nominal impedance repeated)
        p["re_ohm"] = float(mre.group(1)); renote = f" re_ohm = one coil's DC resistance from the printed '{re_s}'; the other T/S are not labelled per coil or wired, so ts_basis stays unknown."
    boxes = []
    sv, pv, fb = line(t, "Sealed Internal Volume"), line(t, "Ported Internal Volume"), val(t, "Fb")
    if sv and num(sv): boxes.append(box("sealed", None, None, "maker manual", litres=num(sv), note=f"published '{sv}' (internal volume)"))
    if pv and num(pv): boxes.append(box("ported", None, num(fb), "maker manual", litres=num(pv), note=f"published '{pv}'; port {line(t, 'Port Size') or 'n/a'}"))
    xmax_note = ""
    if rms is None or rms < 2000:
        no.append({"model": sku, "rms_w": rms, "url": url, "note": f"Manual RMS {rms} W (title says >= 2000 W); check."}); continue
    r = rec(f"{sku}", size, "DVC", ohm, int(rms), int(peak) if peak else None, p, "unknown", depth_mm=mmval(line(t, "Mounting Depth")), cut_mm=mmval(line(t, "Front Mount Baffle Cutout")),
            boxes=boxes, status="current", sources=[src(urls[sku], doc="maker owner's manual PDF (text)", page=1), src(url, ["status"], doc="product page")],
            notes=f"Manual nominal impedance '{imp}'; Re printed '{re_s}'." + (renote or " Re equals the nominal impedance (not a measured value), not entered.") + (" Xmax labelled one way." if re.search(r"(?i)one way", t) else " Xmax: one-way or peak-to-peak not stated.") + " ts_basis not stated. Mounting depth and cutout from the mm values printed.")
    d.append(r)
by = {r["model"]: r for r in d}
for m, r in by.items():
    o = by.get("DIA-" + m)
    if o and o["params"] == r["params"]:
        for x, y in ((r, o["model"]), (o, m)): x["notes"] += f" T/S identical to {y} (the two manuals print the same values; possibly a shared sheet)."
save("ds18", "DS18", "https://ds18.com", "Shopify store (robots.txt: public product pages crawlable); /products.json read once; owner's manual PDFs on the maker CDN fetched 3 s apart (file names tried in a fixed pattern list). Numbers only.", d, no)
