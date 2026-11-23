"""R4B_DRIVERS_MORE (2026-11-23): T/S values read from maker owner's manuals / datasheets (PDF text extracted with
scripts/pdf_text.mjs into references/raw/car_drivers/<brand>/manuals/*.txt), transcribed per model, plus merge() used by the builders.
Every number is checked against the manual text by check() (the printed number must occur in the cited file), so a typo fails loudly.
Rules: manual values only fill EMPTY fields of a record (the product page value wins); a disagreement is written to notes, never
changed. Xmax printed peak-to-peak (Ground Zero 'p2p', 'gesamt', 'peak to peak - linear') is stored halved (calculated) with a note.
Printed maker typos are kept as printed and flagged (sanity.py)."""
import re, os

RAW = "/workspace/references/raw/car_drivers"
GZM = "https://www.ground-zero-audio.com/wp-content/uploads/"

# model -> (file, page, {param: printed value}, xmax_p2p_printed or None, note)
GZ = {
    "GZCM 6.5SPL": ("GZCM-SPL_OM_AWV2.0.pdf", 3, dict(fs_hz=189.4, vas_l=1.9, qms=4.98, qes=1.19, qts=0.96, bl_tm=5.1, re_ohm=2.9, le_mh=0.02, mms_g=8.9), None, ""),
    "GZCM 8.0SPL": ("GZCM-SPL_OM_AWV2.0.pdf", 3, dict(fs_hz=90.6, vas_l=17.2, qms=3.75, qes=0.68, qts=0.58, bl_tm=5.8, re_ohm=3.1, le_mh=0.02, mms_g=12.9), None, ""),
    "GZCM 10.0SPL": ("GZCM-SPL_OM_AWV2.0.pdf", 3, dict(fs_hz=76.2, vas_l=31.0, qms=4.07, qes=0.77, qts=0.65, bl_tm=6.9, re_ohm=3.2, le_mh=0.03, mms_g=23.6), None, ""),
    "GZCM 6.5NEO-DC": ("GZCM-NEO-DC_OM_AWV2.0.pdf", 3, dict(fs_hz=133.2, vas_l=4.09, qms=12.11, qes=0.34, qts=0.37, bl_tm=7.15, re_ohm=2.77, le_mh=0.03, mms_g=8.18), 10,
                       "Manual prints Qes 0.34 with Qts 0.37 (Qts cannot exceed Qes): maker typo kept as printed."),
    "GZCM 8.0NEO-DC": ("GZCM-NEO-DC_OM_AWV2.0.pdf", 3, dict(fs_hz=123.3, vas_l=7.57, qms=11.24, qes=0.45, qts=0.43, bl_tm=8.55, re_ohm=2.77, le_mh=0.03, mms_g=15.30), 12, ""),
    "GZCF 200COAX": ("GZCF-200COAX_OM_112014.pdf", 3, dict(fs_hz=155.8, vas_l=8, qms=13.25, qes=0.71, qts=0.68, bl_tm=7.4, re_ohm=3.4, le_mh=0.29, mms_g=11.9), None,
                     "T/S are the woofer's (manual table)."),
    "GZCK 165XSPL": ("GZCK-165XSPL_OM_AWV4.0.pdf", 3, dict(fs_hz=56.8, vas_l=16.2, qms=9.12, qes=0.32, qts=0.31, bl_tm=6.9, re_ohm=3.3, le_mh=0.29, mms_g=12.7), None, ""),
    "GZCK 165XSPL-II": ("GZCK-165XSPL-II_OM_AWV4.0.pdf", 3, dict(fs_hz=56.8, vas_l=16.2, qms=9.12, qes=0.32, qts=0.31, bl_tm=6.9, re_ohm=3.3, le_mh=0.29, mms_g=12.7), None, ""),
    "GZCK 200XSPL": ("GZCK-200XSPL_OM_AWV2.1.pdf", 3, dict(fs_hz=54.3, vas_l=31.2, qms=9.61, qes=0.39, qts=0.38, bl_tm=7.4, re_ohm=3.3, le_mh=0.30, mms_g=18.9), None, ""),
    "GZCK 200XSPL-II": ("GZCK-200XSPL-II_OM_AWV4.0.pdf", 3, dict(fs_hz=54.3, vas_l=31.2, qms=9.61, qes=0.39, qts=0.38, bl_tm=7.4, re_ohm=3.3, le_mh=0.30, mms_g=18.9), None,
                        "The separate technical data sheet (GZCK-200XSPL-II_TechnicalData_EN.pdf) prints Fs 54 Hz."),
    "GZCK 250XSPL": ("GZCK-250XSPL_OM_AWV2.1.pdf", 3, dict(fs_hz=44, vas_l=43.6, qms=4.14, qes=0.46, qts=0.41, bl_tm=12.66, re_ohm=5.3, le_mh=0.70, mms_g=49.6), None, ""),
    "GZCW 10SPL": ("GZCW-10SPL_OM_AWV3.0.pdf", 5, dict(fs_hz=33, re_ohm=4.05, qms=7.93, qes=0.23, qts=0.22, vas_l=50, mms_g=87, bl_tm=18), 18, ""),
    "GZHK 165": ("GZHK-165_OM_AWV2.1.pdf", 3, dict(re_ohm=3.31, qms=2.88, qes=0.58, qts=0.49, mms_g=16.3, bl_tm=5.4, le_mh=0.09, vas_l=15.9, fs_hz=49.4), 8,
                 "Manual: Xmax 16 mm peak to peak, 8 mm peak to peak linear; xmax_mm = linear / 2."),
    "GZIK 165SPL": ("GZIK-165SPL_OM_AWV2.1.pdf", 3, dict(re_ohm=2.4, qms=3.58, qes=1.09, qts=0.84, mms_g=16.3, bl_tm=3.7, le_mh=0.26, vas_l=11.12, fs_hz=61.5), 12,
                    "Manual: Xmax 14 mm peak to peak, 12 mm peak to peak linear; xmax_mm = linear / 2."),
    "GZTK 165": ("GZTK-165_OM_AWV2.1.pdf", 3, dict(re_ohm=3.07, qms=3.53, qes=1.27, qts=0.94, mms_g=13.9, bl_tm=4.1, le_mh=0.19, vas_l=7.27, fs_hz=81.6), 8,
                 "Manual: Xmax 16 mm peak to peak, 8 mm peak to peak linear; xmax_mm = linear / 2."),
    "GZHM 80": ("GZHM-80_OM_AWV3.0.pdf", 12, dict(fs_hz=106, re_ohm=3.5, qms=5.58, qes=0.32, qts=0.30, vas_l=1.50, mms_g=2.90, bl_tm=4.54, le_mh=0.11), 7, ""),
    "GZNK 165SQ-K": ("GZNK-165SQ-K_OM_AWV2.2.pdf", 12, dict(fs_hz=43, re_ohm=3.3, qms=4.57, qes=0.53, qts=0.48, vas_l=24.13, mms_g=14.3, bl_tm=4.85, le_mh=0.18), 12, ""),
    "GZNM 80SQ-K": ("GZNM-80SQ-K_OM_AWV3.1.pdf", 12, dict(fs_hz=97, re_ohm=4.2, qms=3.70, qes=0.44, qts=0.39, vas_l=1.66, mms_g=2.8, bl_tm=4.06, le_mh=0.10), 7, ""),
    "GZPM 80SQ-C": ("GZPM-80SQ-C_OM_AWV3.1.pdf", 12, dict(fs_hz=100, re_ohm=3.5, qms=5.74, qes=0.30, qts=0.29, vas_l=1.50, mms_g=3.16, bl_tm=4.76, le_mh=0.12), 7, ""),
    "GZPK 165SQ-C": ("GZPK-165SQ-C_OM_AWV2.2.pdf", 5, dict(fs_hz=38, re_ohm=3.3, qms=7.87, qes=0.43, qts=0.41, vas_l=27.9, mms_g=15.2, bl_tm=5.75, le_mh=0.21), 12, ""),
    "GZ Reference K-165": ("GZReference-K-165_OM_AWV4.0.pdf", 5, dict(fs_hz=46, re_ohm=3.4, qms=7.28, qes=0.42, qts=0.39, vas_l=17.1, mms_g=18.9, bl_tm=6.7, le_mh=0.19), None, ""),
    "GZ Reference M-80": ("GZReference-M-80_OM_AWV4.0.pdf", 5, dict(fs_hz=109, re_ohm=3.4, qms=4.25, qes=0.38, qts=0.35, vas_l=0.72, mms_g=4.8, bl_tm=5.45, le_mh=0.084), None, ""),
    "GZ ULTRA M-80": ("GZ-ULTRA-M-80_OM_AWV1.0_PDFforWeb_EN.pdf", 3, dict(fs_hz=127, re_ohm=3.5, qms=6.76, qes=0.43, qts=0.40, vas_l=0.9, mms_g=3.15, bl_tm=4.52, le_mh=0.04), 7, ""),
    "GZ ULTRA K-165": ("GZ-ULTRA-K-165_OM_AWV1.0_PDFforWeb_EN.pdf", 3, dict(fs_hz=43, re_ohm=3.4, qms=5.56, qes=0.56, qts=0.51, vas_l=20.4, mms_g=15.4, bl_tm=5.05, le_mh=0.12), 10, ""),
    "GZUK 165SQ": ("GZUK-165SQ_OM_AWV2.1.pdf", 10, dict(fs_hz=54.6, re_ohm=3.2, qms=3.87, qes=0.77, qts=0.64, vas_l=12.6, mms_g=16.3, bl_tm=4.84, le_mh=0.17), 12, ""),
    "GZUM 80SQ": ("GZUM-80SQ_OM_AWV2.2_PRINT1.pdf", 10, dict(fs_hz=134, re_ohm=2.8, qms=4.26, qes=0.37, qts=0.34, vas_l=0.71, mms_g=3.7, bl_tm=4.9, le_mh=0.033), 8, ""),
    "GZUF 60SQ-A": ("GZUF-60SQ-A_OM_AWV2.1.pdf", 10, dict(fs_hz=150, re_ohm=3.9, qms=5.12, qes=0.74, qts=0.64, vas_l=0.5, mms_g=1.9, bl_tm=3.0, le_mh=0.12), 4, ""),
    "GZUM 55SQ": ("GZUC-165.3SQ_OM_AWV2.3.pdf", 12, dict(fs_hz=353), None, "Only Fs is printed for the GZUM 55SQ (in the GZUC 165.3SQ set manual)."),
    "GZRM 80SQ": ("GZRK-RT-RM_OM_AWV2.1.pdf", 6, dict(qms=2.86, qes=0.44, qts=0.38, mms_g=2.65, bl_tm=3.58, vas_l=1.5, fs_hz=114), None, ""),
}
# component sets carry the woofer's T/S (as R4 did for sets): set -> woofer entry above
GZ_SETS = {"GZUC 165.2SQ": "GZUK 165SQ", "GZUC 165.2SQ-ACT": "GZUK 165SQ", "GZUC 165.3SQ": "GZUK 165SQ", "GZUC 165.3SQ-ACT": "GZUK 165SQ"}
GZ_SET_FILES = {"GZUC 165.2SQ": ("GZUC-165.2SQ_OM_AWV2.0.pdf", 12), "GZUC 165.2SQ-ACT": ("GZUC-165.2SQ_OM_AWV2.0.pdf", 12),
                "GZUC 165.3SQ": ("GZUC-165.3SQ_OM_AWV2.3.pdf", 12), "GZUC 165.3SQ-ACT": ("GZUC-165.3SQ-ACT_OM_EN_AWV2.0.pdf", 4)}


def _txt(brand_dir, pdf): return open(os.path.join(RAW, brand_dir, "manuals", pdf[:-4] + ".txt"), encoding="utf-8").read()


def _printed(v):
    s = f"{v}"
    return [s, s.replace(".", ","), f"{v:.2f}" if isinstance(v, float) else s, f"{v:.1f}" if isinstance(v, float) else s]


def check(table, brand_dir):
    """Every transcribed value must be printed in its manual text; raises on a miss."""
    bad = []
    for model, (pdf, page, ps, xm, _) in table.items():
        t = _txt(brand_dir, pdf)
        for k, v in list(ps.items()) + ([("xmax_p2p", xm)] if xm else []):
            if not any(re.search(r"(?<![\d.])" + re.escape(c) + r"(?![\d])", t) for c in _printed(v)):
                bad.append(f"{model} {k}={v} not found in {pdf}")
    if bad: raise SystemExit("manual_ts check failed:\n" + "\n".join(bad))
    return len(table)


def page_of(brand_dir, pdf, v):
    """Page number (=== page N === markers) of the last line printing value v in the manual text."""
    t = _txt(brand_dir, pdf); page = None; cur = None
    for line in t.split("\n"):
        m = re.match(r"=== page (\d+) ===", line)
        if m: cur = int(m.group(1)); continue
        if any(re.search(r"(?<![\d.])" + re.escape(c) + r"(?![\d])", line) for c in _printed(v)): page = cur
    return page


def merge(rec, entry, url_base, brand_dir, date="2026-11-23", via_set=None):
    """Fill empty params of rec from a manual entry; add the source; note disagreements. Returns number of fields filled."""
    pdf, page, ps, xm, note = entry
    key = ps.get("qts", ps.get("fs_hz"))
    page = page_of(brand_dir, pdf, key) or page
    url = url_base + pdf
    filled, differ = [], []
    vals = dict(ps)
    if xm: vals["xmax_mm"] = round(xm / 2, 2)
    for k, v in vals.items():
        cur = rec["params"].get(k)
        if cur is None: rec["params"][k] = v; filled.append(k)
        elif abs(float(cur) - float(v)) > 0.02 * max(abs(float(v)), 1e-9): differ.append(f"{k} page {cur} vs manual {v}")
    if filled:
        rec["sources"].append({"fields": [f"params.{k}" for k in filled], "url": url, "doc": "maker owner's manual / data sheet (PDF text)",
                               "page": page, "read_date": date, "tier": 1})
        n = f"T/S from the maker manual ({pdf} p.{page}" + (f", woofer of the set: {via_set}" if via_set else "") + ")."
        if xm: n += f" Manual Xmax {xm} mm is peak to peak; xmax_mm = {xm}/2 (calculated)."
        if note: n += " " + note
        rec["notes"] = (rec["notes"] + " " if rec["notes"] else "") + n
    if differ:
        rec["notes"] = (rec["notes"] + " " if rec["notes"] else "") + "Manual differs from product page (page value kept): " + "; ".join(differ) + "."
    return len(filled)
