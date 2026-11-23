#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): MTX Audio (MiTek, Phoenix AZ, USA) lower-power car subwoofers (35, 55, 75, S65, Terminator) from the
maker's per-model 'tech data sheet' PDFs (text layer; links found on the product pages, which were read in the headless browser:
scripts/car_subs/mtx_pages.sh -> references/raw/car_subs/mtx/). The TS9924-22 Jackhammer stays from hp_subs_raw.
Values as printed: metric figures in brackets are used where both units are printed. Usage: python3 -I build_mtx.py"""
import sys, os, re, glob
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
D = "/workspace/references/raw/car_subs/mtx/"
drivers = []
for f in sorted(glob.glob(D + "*_tech_data_sheet.txt")):
    t = open(f, encoding="utf-8").read()
    p1 = t.split("=== page 2 ===")[0]
    if "Fs " not in p1: continue  # image-only (35 series) or other layout (Terminator owner's manual): listed from the product page below
    J = re.sub(r"\s+", " ", p1)
    g = lambda pat: (re.search(pat, J) or [None, None])[1]
    model = os.path.basename(f).replace("_tech_data_sheet.txt", "").upper()
    title = g(r"=== page 1 === \S+ (.+?) mtx\.com")
    size = num(g(r"(\d+(?:\.\d+)?)\" ")) if title else None
    mc = re.search(r"(?i)(dual|single)\s*(\d+)\s*ohm", title or "")
    coil = {"dual": "DVC", "single": "SVC"}[mc.group(1).lower()] if mc else None
    ohm = num(mc.group(2)) if mc else None
    p = dict(fs_hz=num(g(r"Fs ([\d.]+) Hz")), qms=num(g(r"Qms ([\d.]+)")), mms_g=num(g(r"Mms ([\d.]+) g")),
             vas_l=num(g(r"Vas [\d.]+ ft ?3? ?\(([\d.]+) liters\)")), xmax_mm=num(g(r"Xmax [\d.]+ in \(([\d.]+) mm\)")),
             sd_cm2=num(g(r"Sd [\d.]+ in ?2? ?\(([\d.]+) cm")), qes=num(g(r"Qes ([\d.]+)")), re_ohm=num(g(r"Re ([\d.]+) ?Ω")),
             bl_tm=num(g(r"Bl ([\d.]+) Tm")), qts=num(g(r"Qts ([\d.]+)")), spl_db_1w1m=num(g(r"SPLo ([\d.]+) dB")), spl_db_2v83=num(g(r"SPL 2\.83 V/1m ([\d.]+) dB")),
             le_mh=num(g(r"Le ([\d.]+) mH")))
    rms = num(g(r"Prms ([\d.]+) Watts"))
    basis = "per_coil" if coil == "SVC" else ("parallel" if coil == "DVC" and p["re_ohm"] and ohm and p["re_ohm"] < ohm * 0.75 else "unknown")
    drivers.append(rec(model, size, coil, ohm, rms, None, p, basis,
                       depth_mm=num(g(r"Mounting Depth [^(]*\(([\d.]+) mm\)")), cut_mm=num(g(r"Cutout Diameter [^(]*\(([\d.]+) mm\)")),
                       disp_l=num(g(r"Disp [\d.]+ ft ?3? ?\(([\d.]+) liters\)")), status="current",
                       sources=[src("https://www.mtx.com/" + os.path.basename(f).replace(".txt", ".pdf"), doc="MTX tech data sheet PDF (text layer); exact URL path /f/<id>/ in the product page links")],
                       notes=f"Sheet title '{title}'. Recommended power printed '{g(r'RECOMMENDED POWER RATING (.+?) PARAMETERS')}'. "
                             + ("Re below the coil rating: T/S measured with the coils in parallel (inference). " if basis == "parallel" else "")
                             + "Metric values used where the sheet prints both units."))
# 35 series: tech sheets are image-only; parameter blocks READ FROM IMAGE (crops references/raw/car_subs/mtx/png/<model>_params.png,
# 3510-02_p1.png). Double-check: printed Qts vs Qms*Qes/(Qms+Qes) 3510-02 0.690, 3510-04 0.825, 3512-02 0.645, 3512-04 0.697 (all match).
IMG35 = [("3510-02", 10, 2, dict(fs_hz=35, qms=2.723, mms_g=158.1, vas_l=28.3, xmax_mm=8.128, sd_cm2=390.5, qes=0.924, re_ohm=1.7, bl_tm=8, qts=0.69, spl_db_1w1m=83.2, spl_db_2v83=89.9), "0.131 mm/N", "8.84 in (224.536 mm)"),
         ("3510-04", 10, 4, dict(fs_hz=33, qms=3.751, mms_g=127.4, vas_l=39.4, xmax_mm=8.128, sd_cm2=369, qes=1.058, re_ohm=3.47, bl_tm=9.31, qts=0.825, spl_db_1w1m=83.3, spl_db_2v83=86.9), "0.183 mm/N", "8.84 in (224.536 mm)"),
         ("3512-02", 12, 2, dict(fs_hz=30.4, qms=3.668, mms_g=173.8, vas_l=73.1, xmax_mm=8.128, sd_cm2=573.6, qes=0.783, re_ohm=1.85, bl_tm=8.85, qts=0.645, spl_db_1w1m=86.23, spl_db_2v83=92.6), "0.157 mm/N", "10.64 in (270.256 mm)"),
         ("3512-04", 12, 4, dict(fs_hz=31.4, qms=3.173, mms_g=163.35, vas_l=73.1, xmax_mm=8.128, sd_cm2=573.6, qes=0.893, re_ohm=3.5, bl_tm=11.27, qts=0.697, spl_db_1w1m=86.06, spl_db_2v83=89.7), "0.157 mm/N", "10.64 in (270.256 mm)")]
for m, size, ohm, prm, cms, dia in IMG35:
    qc = prm["qms"] * prm["qes"] / (prm["qms"] + prm["qes"])
    drivers.append(rec(m, size, "SVC", ohm, 250, 500, prm, "per_coil", status="current",
                       sources=[src((re.search(r"https://www\.mtx\.com/f/\d+/\S*tech\S*\.pdf", open(D + m + "-car-audio-subwoofer.txt", encoding="utf-8").read(), re.I) or [f"https://www.mtx.com/{m}-car-audio-subwoofer"])[0], doc="MTX tech data sheet PDF (image only): T/S READ FROM IMAGE")],
                       notes=f"T/S READ FROM IMAGE (image-only maker sheet), double-checked: printed Qts {prm['qts']} vs Qms*Qes/(Qms+Qes) {qc:.3f}. Cms printed {cms}; D {dia}; Prms 250 W; '500W Peak Power'. "
                             "Drawing dimensions not mapped to cut-out/depth with certainty, left empty. Metric values used."))
no_ts, have = [], {d["model"] for d in drivers}
for f in sorted(glob.glob(D + "*-subwoofer.txt")):
    t = open(f, encoding="utf-8").read()
    sku = (re.search(r"SKU: (\S+)", t) or [None, None])[1]
    if not sku or sku.upper() in have: continue
    ttl = (re.search(r"\n(\d+(?:\.\d+)?\" [^\n]*Subwoofer)\n", t) or [None, ""])[1]
    m = re.search(r"(?i)([\d,]+)-Watt RMS (?:(Dual|Single) )?(\d+)", ttl)
    slug = os.path.basename(f)[:-4]
    no_ts.append({"model": sku.upper(), "rms_w": num(m.group(1).replace(",", "")) if m else None, "url": "https://www.mtx.com/" + slug,
                  "size_in": num(ttl.split('"')[0]) if ttl else None, "coil": (("DVC" if (m.group(2) or "").lower() == "dual" else "SVC") if m else None),
                  "ohms_per_coil": num(m.group(3)) if m else None,
                  "note": f"Product page title '{ttl}'. No T/S in a text tech sheet: the 35 series sheets are image-only, the Terminator 'tech data' PDFs are owner's manuals without a parameter table, S65 and 5510-44 pages link no sheet (2026-11-23).",
                  "sources": [src("https://www.mtx.com/" + slug, doc="product page (headless browser)")]})
save("us", "mtx", "MTX Audio", "USA", "https://mtx.com",
     "R2B 2026-11-23: mtx.com product pages read in the headless browser (one page per launch, 6 s apart); tech data sheet PDFs fetched with curl 3 s apart. Numbers only.",
     drivers, no_ts, coverage="all car subwoofer drivers on https://www.mtx.com/subwoofers (35, 55, 75, S65, Terminator, Jackhammer from hp_subs_raw); enclosures, packages, marine left out")
