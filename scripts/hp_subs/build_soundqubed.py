#!/usr/bin/env python3
"""A2: SoundQubed (Winder, GA) HDX3.2 and HDX4.2 records from maker spec PDFs listed on https://soundqubed.com/product-documentation/
(hosted on storage.googleapis.com/pci-os-prod-sq-literature/SUBWOOFERS/), text PDFs, read 2026-11-21."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box_range, src, save
G = "https://storage.googleapis.com/pci-os-prod-sq-literature/SUBWOOFERS/"
K = ["fs_hz", "qms", "qes", "qts", "vas_l", "le_mh", "spl_db_1w1m", "bl_tm", "xmax_mm", "sd_cm2"]
S = {  # series: (pdf, rms, burst, {model: values}, dims {size: (B cut mm, D depth mm)}, ported ranges)
 "HDX4.2": ("HDX4.2-SERIES-SPECS.pdf", 4000, 16000, {
    (12, 1): (34.4, 3.82, 0.47, 0.42, 30.8, 1.05, 84.9, 15.8, 23, 530), (12, 2): (35.6, 3.71, 0.5, 0.44, 29.4, 1.71, 85.1, 21.7, 23, 530),
    (15, 1): (33.7, 3.57, 0.49, 0.43, 57.2, 1.03, 88.3, 17.1, 23, 805), (15, 2): (33.9, 3.56, 0.51, 0.45, 56.6, 1.67, 88.5, 22.8, 23, 805),
    (18, 1): (31.6, 3.56, 0.52, 0.45, 114.0, 0.99, 90.3, 17.8, 23, 1200), (18, 2): (31.7, 3.3, 0.55, 0.47, 113.2, 1.65, 90.4, 23.3, 23, 1200)},
    {12: (290, 233), 15: (350, 243), 18: (425, 288)}),
 "HDX3.2": ("HDX3.2-SERIES-SPECS.pdf", 2500, 12500, {
    (12, 1): (28.8, 4.73, 0.42, 0.39, 31.1, 1.05, 84.3, 17.4, 15, 530), (12, 2): (28.4, 6.44, 0.39, 0.37, 33.4, 2.95, 84.1, 25.6, 15, 530),
    (15, 1): (29.5, 4.87, 0.47, 0.42, 71.5, 0.98, 87.8, 16.8, 15, 805), (15, 2): (29, 6.63, 0.44, 0.41, 73.5, 3.05, 87.5, 26.3, 15, 805),
    (18, 1): (31.6, 5.88, 0.61, 0.55, 112.1, 1.02, 89.6, 16.4, 15, 1200), (18, 2): (29.3, 5.52, 0.74, 0.43, 112.9, 2.92, 89.7, 28.5, 15, 1200)},
    {12: (290, 225), 15: (350, 235), 18: (425, 280)})}
RANGES = {12: (1.75, 2.75), 15: (3, 6), 18: (5, 7)}
d = []
for series, (pdf, rms, burst, rows, dims, *_) in S.items():
    for (size, ohm), v in rows.items():
        cut, depth = dims[size]
        extra = " DATA PROBLEM: Qts 0.43 contradicts Qms 5.52 / Qes 0.74 (calculated 0.652)." if (series, size, ohm) == ("HDX3.2", 18, 2) else ""
        d.append(rec(f"{series}-{size}D{ohm}", size, "DVC", ohm, rms, burst, dict(zip(K, v)), "unknown", cut_mm=cut, depth_mm=depth, status="current",
            boxes=[box_range("ported", *RANGES[size], None, "maker spec sheet " + pdf)],
            sources=[src(G + pdf, doc="maker spec sheet 'Electro acoustic specifications & Thiele Small parameters' (text PDF)", page=1)],
            notes="peak_w = maker 'Burst Rating Power'. Re not published. Cutout = drawing letter B and mounting depth = letter D (inferred from the drawing layout; letters only). Bl unit printed 'N/A'. ts_basis not stated." + extra))
save("soundqubed", "SoundQubed", "https://soundqubed.com",
     "WooCommerce site (robots.txt allows product pages); spec PDFs linked from the Product Documentation page, hosted on Google Cloud Storage; each read once, 4-5 s apart. Plain curl without a browser user agent gets HTTP 403. Terms of Service not read in full.",
     d, [{"model": "HDX3 18 (older HDX3, listed in related products)", "rms_w": None, "url": "https://soundqubed.com/18-inch-car-subwoofers/", "note": "Not checked further."}])
