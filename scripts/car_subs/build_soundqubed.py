#!/usr/bin/env python3
"""R2_SUBS_ALL: SoundQubed (Winder, GA, USA) lower-power subwoofers (HDB2, HDS2.3, HDS3.3) from the maker spec PDFs listed on
https://soundqubed.com/product-documentation/ (storage.googleapis.com/pci-os-prod-sq-literature/SUBWOOFERS/), read 2026-11-23.
Row tables ('Fs 27 Hz 31.6 Hz ...') are split per model column in printed order; HDB2 sheets are one model each ('label .... value').
Mounting table: B = cut-out, D = mounting depth (A2's reading of the HDX sheets). HDX3.2/HDX4.2 come from hp_subs_raw.
The HDS3.3-15 sheet is image-only (no text): values read from the image by R2B_SUBS_MORE. Usage: python3 -I build_soundqubed.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
R = "/workspace/references/raw/car_subs/soundqubed/"
G = "https://storage.googleapis.com/pci-os-prod-sq-literature/SUBWOOFERS/"


def n(s):
    if s is None: return None
    m = re.search(r"\d+(?:\.\d+)?", s)
    if not m: return None
    v = float(m.group(0)); return int(v) if v.is_integer() else v


drivers, no_ts = [], []
ROWS = {"RMS Power": "rms", "Peak Power": "peak", "Max Power": "peak", "Fs": "fs_hz", "Impedance": "imp", "Qms": "qms", "Qes": "qes", "Qts": "qts",
        "Vas": "vas_l", "Le": "le_mh", "Sensitivity(1W/1M)": "spl_db_1w1m", "BL": "bl_tm", "Xmax": "xmax_mm", "SD": "sd_cm2"}
UNIT = r"(?:Hz|W|Ohm|L|m[Hh]|M[Hh]|dB|N/A|mm|CM ?²|CM2|%|OZ|inch)?"
for pdf in ("HDS2.3-6.5-AND-8-SPECS.pdf", "HDS2.3-AND-3.3-12-SPECS.pdf"):
    L = [x.strip() for x in open(R + pdf[:-4] + ".txt", encoding="utf-8").read().splitlines() if x.strip()]
    mrow = next(x for x in L if x.startswith("Model "))
    models = re.findall(r"HDS ?\d\.\d-\d+D\d", mrow)
    vals = {m: {} for m in models}
    for x in L:
        for lab, key in ROWS.items():
            if x.startswith(lab + " "):
                rest = x[len(lab):].strip()
                toks = re.findall(r"(\d+(?:\.\d+)?(?:\+\d+)?)\s*" + UNIT, rest)
                for m, v in zip(models, toks): vals[m].setdefault(key, v)
    extra = re.search(r"\|(HDS 2\.3-8D4)\|8\"\|([^|]+)\|([^|]+)\|[^|]+\|[^|]+\|[^|]+\|([\d.]+) Hz\|(\d)\+\d Ohm\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+) L\|([\d.]+) Mh\|[^|]+\|[^|]+\|([\d.]+) dB\|([\d.]+) N/A\|(\d+) mm\|(\d+) CM2", "|" + "|".join(L) + "|")
    if extra:
        e = extra.groups()
        models.append(e[0]); vals[e[0]] = dict(rms=e[1].replace(" ", ""), peak=e[2], fs_hz=e[3], imp=e[4] + "+" + e[4], qms=e[5], qes=e[6], qts=e[7], vas_l=e[8],
                                               le_mh=e[9], spl_db_1w1m=e[10], bl_tm=e[11], xmax_mm=e[12], sd_cm2=e[13])
    dims = {}
    for x in L:
        md = re.match(r"(HS?D?S?\s?\d\.\d-\d+D\d)\s+(\d+)mm\s*/\s*[^ ]+\s+(\d+)mm\s*/\s*[^ ]+\s+(\d+)mm\s*/\s*[^ ]+\s+(\d+)mm", x)
        if md: dims[re.search(r"\d\.\d-\d+D\d", md.group(1)).group(0)] = (n(md.group(3)), n(md.group(5)))
    for m in models:
        v = vals[m]
        size = 6.5 if "-6D" in m else int(re.search(r"-(\d+)D", m).group(1))
        ohm = n((v.get("imp") or "").split("+")[0])
        key = re.search(r"\d\.\d-\d+D\d", m.replace(" ", "")).group(0)
        cut, dep = dims.get(key, (None, None))
        p = {k: n(v.get(k)) for k in ("fs_hz", "qms", "qes", "qts", "vas_l", "le_mh", "spl_db_1w1m", "bl_tm", "xmax_mm", "sd_cm2")}
        drivers.append(rec(m.replace("HDS ", "HDS"), size, "DVC", ohm, n(v.get("rms")), n(v.get("peak")), p, "unknown", depth_mm=dep, cut_mm=cut, status="current",
                           sources=[src(G + pdf, doc="maker spec PDF (row table, one column per model)")],
                           notes="Row table split per model column in printed order; BL printed in 'N/A' (taken as T m); ts_basis not stated. Mounting table B taken as cut-out, D as mounting depth (A2 reading)."
                                 + (" Values from the separate fourth column printed after the main table." if m == "HDS 2.3-8D4" else "")))
for pdf in sorted(os.listdir(R)):
    if not (pdf.startswith("HDB2") and pdf.endswith(".txt")): continue
    t = open(R + pdf, encoding="utf-8").read()
    g = lambda lab: (re.search(lab + r"\s*\.{3,}[^\n]*?\.{2,}\s*([^\n]+)", t) or re.search(lab + r"\.{3,}\s*([^\n]+)", t) or [None, None])[1]
    m = re.search(r"HDB2- ?1 ?(\d)-D(\d)", t)
    size, ohm = int("1" + m.group(1)), int(m.group(2))
    p = dict(vas_l=n(g(r"Vas")), xmax_mm=n(g(r"Xmax ")), fs_hz=n(g(r"Fs ")), qms=n(g(r"Qms")), qes=n(g(r"Qes ")), qts=n(g(r"Qts")), mms_g=n(g(r"Mms ")),
             bl_tm=n(g(r"BL ")), le_mh=n(g(r"Le ")), sd_cm2=n(g(r"Sd")), re_ohm=n(g(r"DC Resistance \.+ Re ")), spl_db_1w1m=n(g(r"Sensitivity \(1w/1m\) ")))
    mmv = lambda lab: n((re.search(lab + r"\s*\.+\s*[^/\n]*/\s*([\d.]+)mm", t) or [None, None])[1])
    model = f"HDB2-{size}-D{ohm}"
    drivers.append(rec(model, size, "DVC", ohm, n(g(r"RMS Power Handling")), n(g(r"MAX Power Handling")), p, "unknown",
                       depth_mm=mmv("Mounting Depth"), cut_mm=mmv("Front Mount Baffle Cutout"), status="current",
                       sources=[src(G + pdf[:-4] + ".pdf", doc="maker spec PDF (owner's manual)")],
                       notes="Sheet prints DC resistance as '2 + 2' / '4 + 4' ohms (per coil); Le printed in mH as shown; ts_basis not stated."))
# R2B_SUBS_MORE (2026-11-23): HDS3.3-15 values READ FROM IMAGE (sheet has no text layer); crops references/raw/car_subs/soundqubed/png/crop_hds33_15.png,
# crop_hds_mount.png. Double-check: printed Qts vs Qms*Qes/(Qms+Qes): 15D2 0.58 vs 0.587, 15D4 0.65 vs 0.649. No Re or Mms printed.
HDS = G + "HDS2.3-12-AND-HDS3.3-12-AND-15-SPECS.pdf"
for m, ohm, fs, qms, qes, qts, vas, le, spl, bl in (("HDS3.3-15D2", 2, 28.7, 8.64, 0.63, 0.58, 69.2, 2.34, 86.5, 19.2), ("HDS3.3-15D4", 4, 28.5, 5.84, 0.73, 0.65, 77.2, 3.35, 85.7, 23.7)):
    drivers.append(rec(m, 15, "DVC", ohm, 1500, 3000, dict(fs_hz=fs, qms=qms, qes=qes, qts=qts, vas_l=vas, le_mh=le, spl_db_1w1m=spl, bl_tm=bl, xmax_mm=13, sd_cm2=805),
                       "unknown", depth_mm=216, status="current", sources=[src(HDS, doc="maker spec PDF (image only): T/S READ FROM IMAGE")],
                       notes="T/S READ FROM IMAGE (image-only maker sheet), double-checked: printed Qts vs Qms*Qes/(Qms+Qes) " + ("0.587" if ohm == 2 else "0.649") + ". "
                             "No Re or Mms printed; BL unit printed 'N/A' (taken as T m); Cms printed " + ("0.08" if ohm == 2 else "0.09") + " (mm/N). Mounting table D 216 mm taken as mounting depth; "
                             "the table repeats the 12 in A/B figures (325 / 290 mm) on the 15 in rows (maker copy error), so the cut-out is left empty."))
save("us", "soundqubed", "SoundQubed", "USA", "https://soundqubed.com",
     "R2 2026-11-23: 7 spec PDFs from the maker's product-documentation list read 3 s apart. Numbers only.",
     drivers, no_ts, coverage="every subwoofer spec sheet on the maker's product-documentation page (HDB2, HDS2.3, HDS3.3, HDX3.2, HDX4.2)")
