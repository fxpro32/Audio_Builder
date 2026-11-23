#!/usr/bin/env python3
"""R2_SUBS_ALL: Focal (France) car subwoofer drivers. T/S and power from the maker Technical Sheet PDFs (dam.focal-naim.com
FT_*.pdf, linked from each product page), mounting depth and cut-out from the product page specification list.
Raw: references/raw/car_subs/focal/ (<slug>.html, FT_<slug>.pdf/.txt), read 2026-11-23. Box tables in the sheets are not
transcribed (layout too loose to tie volumes to columns safely). Usage: python3 -I build_focal.py"""
import sys, re, glob, os, html, json
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
R = "/workspace/references/raw/car_subs/focal/"
U = "https://www.focal.com/products/"
pdfurl = dict((l.split()[1][3:-4], l.split()[0]) for l in open(R + "list_pdf.txt") if l.strip())


def val(t, key):
    m = re.search(r"^" + key + r"\s*([^\n]+)", t, re.M)
    return m.group(1).strip() if m else None


def ptext(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


drivers, no_ts = [], []
for slug in [l.split()[1][:-5] for l in open(R + "list.txt") if l.strip()]:
    page = R + slug + ".html"
    if not os.path.exists(page): continue
    pt = ptext(page)
    title = re.search(r"^\|([^|]+?) - ", pt)
    name = title.group(1).strip() if title else slug.upper()
    cut = re.search(r"Cut-Out diameter :\|([\d.]+) mm", pt); dep = re.search(r"\(Mounting depth\) :\|([\d.]+) mm", pt)
    size_m = re.search(r"Subwoofer(?: 2x)?:? ?([\d.]+)\"", pt) or re.search(r"(\d+) cm", name)
    f = R + f"FT_{slug}.txt"
    if not os.path.exists(f):
        no_ts.append({"model": name, "rms_w": None, "url": U + slug, "note": "Product page has no Technical Sheet link (older model); not read further."})
        continue
    t = open(f, encoding="utf-8", errors="replace").read().replace(" \n", "\n")
    imp = val(t, r"Nom\. impedance") or ""
    dual = "+" in imp
    ohm = num(re.sub(r"^.*?([\d.]+)\s*(?:Ω|Ohm).*$", r"\1", imp)) if imp else None
    if dual: ohm = num(re.search(r"([\d.]+)", imp).group(1))
    rdc = val(t, "Rdc") or val(t, "Re") or val(t, r"D ?C resistance")
    p = dict(fs_hz=num(val(t, "Fs")), vas_l=num(val(t, "Vas")), qts=num(val(t, "Qts")), qes=num(val(t, "Qes")), qms=num(val(t, "Qms")),
             re_ohm=num(rdc.split("+")[0]) if rdc else None, sd_cm2=num(val(t, "Sd")), mms_g=num(val(t, "Mms")),
             bl_tm=num(val(t, r"B ?[xL]?l") or val(t, "BL") or val(t, "Bxl")), xmax_mm=num(val(t, "Xmax")), le_mh=num(val(t, "Inductance") or val(t, "Le")))
    sens = val(t, r"Sensitivity(?: \(2\.83V/1m\))?")
    m283 = re.search(r"Sensitivity\s*\n?\(2\.83V/1m\)\s*\n?\s*([\d.]+)\s*dB", t)
    if m283: p["spl_db_2v83"] = num(m283.group(1))
    elif sens and num(sens): p["spl_db_1w1m"] = None; notes_s = f" Sensitivity {sens} printed without a reference (not stored)."
    rms = num((val(t, "Nominal power") or "").replace(",", "")); peak = num((val(t, "Maximum power") or "").replace(",", ""))
    nm = re.search(r"(\d+)", name.replace("BMW", "").replace("MBZ", ""))
    size = None
    if nm: n_ = int(nm.group(1)); size = {20: 8, 25: 10, 30: 12}.get(n_, n_ if n_ in (8, 10, 12, 15) else None)
    if slug.startswith("isub"): size = 8  # 20 cm class (sheet drawing ~213 cm2 Sd); size from maker naming 'iSUB' 20 cm range
    notes = ("T/S from the maker Technical Sheet. " + ("Dual voice coil: Rdc printed per coil ('a+b'); re_ohm = one coil as printed; ts_basis not stated. " if dual else "")
             + ("Marine model (listed as car/marine by the maker). " if "wm" in slug else "")
             + ("OEM-fit replacement driver for the named car maker's under-seat location. " if slug.startswith("isub") else "")
             + "Recommended sealed/ported volumes are printed on the sheet but not transcribed.")
    r = rec(f"{name} ({slug})", size, "DVC" if dual else "SVC", ohm, rms, peak, p, "per_coil" if not dual else "unknown",
            depth_mm=num(dep.group(1)) if dep else None, cut_mm=num(cut.group(1)) if cut else None, status="current",
            sources=[src(pdfurl.get(slug, U + slug), ["params", "rms_w", "peak_w", "coil"], doc="Technical Sheet PDF"),
                     src(U + slug, ["mounting_depth_mm", "cutout_mm", "size_in"], doc="product page, specifications")], notes=notes)
    drivers.append(r)
save("world", "focal", "Focal (Focal-JMlab)", "France", "https://www.focal.com",
     "R2 2026-11-23: focal.com robots.txt only disallows query URLs. 23 product pages and 21 technical sheets read 3 s apart. EU maker: per-model facts only (no substantial extraction of a database). Numbers only.",
     drivers, no_ts, coverage="all car subwoofer drivers listed in the maker's English sitemap (Access/Auditor SUB, Flax Evo P, K2 Power SUB KX, Integration iSUB, SF, marine SUB 10 WM)")
