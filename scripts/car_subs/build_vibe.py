#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): VIBE Audio (UK) lower-power subwoofers, added to the hp_subs_raw copy (A6, via a non-VPN connection).
vibeaudio.co.uk refuses curl from the container (403) but renders in the headless browser: 25 product pages read one launch at a time,
6 s apart (scripts/car_subs/vibe_pages.sh -> references/raw/car_subs/vibe/<slug>.txt); the linked owner's manuals (wp-content uploads)
answer curl and were saved to references/raw/car_subs/vibe/pdf/ (text layer). T/S below are transcribed from the manuals' 'TS Parameters'
tables (text layer, values as printed; dual-coil tables give Series and Parallel columns: Series kept). Power, depth and cut-out from the
manual model table or the product page. Usage: python3 -I build_vibe.py"""
import sys
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, mm
U = "https://vibeaudio.co.uk/wp-content/uploads/"
P = "https://vibeaudio.co.uk/product/"
SL3 = U + "2025/02/Slick-V3-subwoofer-manual-010425.pdf"; SL0 = U + "2021/09/Slick-subwoofer-manual-151121.pdf"
PU = U + "2025/11/Pulse-D2-subwoofer-manual-261023.pdf"; BA5 = U + "2025/11/BlackAir-D2-subwoofer-manual-231025.pdf"
BAS = U + "2023/10/BlackAir-10-12D2S-subwoofer-manual-250923.pdf"; BA7 = U + "2019/05/Blackair-subwoofer-manual-050718.pdf"
BD4 = U + "2024/07/BD-121-5D2-subwoofer-manual-300425.pdf"
# model, size, ohm/coil, rms, peak, manual, page slug, T/S dict, depth mm, cut mm, note
R = [
 ("SLICK8D2-V3", 8, 2, 450, 1350, SL3, "slick8d2-v3-vibe-slick-8-inch-1350-watts-max-subwoofer", dict(fs_hz=41.524, vas_l=8.197, re_ohm=3.4, qms=2.892, qes=0.554, qts=0.465, bl_tm=12.833, sd_cm2=200, mms_g=102.875, xmax_mm=9), 120, 181, "Sd printed 0,020 m2; Cms 142.799 uM/N; SPL 82.1 dB (condition not stated)."),
 ("SLICK10D2-V3", 10, 2, 500, 1500, SL3, "slick10d2-v3", dict(fs_hz=36.120, vas_l=18.993, re_ohm=3.8, qms=4.339, qes=0.573, qts=0.506, bl_tm=15.425, sd_cm2=330, mms_g=158.133, xmax_mm=11), 138, 230, "Sd printed 0,033 m2; Cms 122.781 uM/N; SPL 83.8 dB."),
 ("SLICK12D2-V3", 12, 2, 500, 1500, SL3, "slick12d2-v3-vibe-slick-12-inch-1350-watts-max-subwoofer", dict(fs_hz=29.112, vas_l=59.116, re_ohm=3.8, qms=5.252, qes=0.636, qts=0.568, bl_tm=14.3, sd_cm2=500, mms_g=187.248, xmax_mm=11), 147, 277, "Sd printed 0,050 m2; Cms 159.612 uM/N; SPL 85.5 dB."),
 ("SLICK8D2-V0", 8, 2, 450, 1350, SL0, "slick8d2-v0-8inch-subwoofer", dict(fs_hz=44.076, vas_l=8.884, re_ohm=4, qms=7.105, qes=0.568, qts=0.526, bl_tm=12.5, sd_cm2=190, mms_g=80.121, xmax_mm=9), None, 181, "Sd printed 0,019 m2; SPL 85.1 dB. Manual prints mounting depth '6.3\" (120mm)' (inch and mm disagree), left empty."),
 ("SLICK10D2-V0", 10, 2, 500, 1500, SL0, "slick10d2-v0-10-inch-subwoofer", dict(fs_hz=34.304, vas_l=26.072, re_ohm=4, qms=5.923, qes=0.605, qts=0.549, bl_tm=13.487, sd_cm2=330, mms_g=127.721, xmax_mm=11), 138, 230, "Sd printed 0,033 m2; SPL 85.8 dB."),
 ("SLICK12D2-V0", 12, 2, 500, 1500, SL0, "slick12d2-v0-12-inch-subwoofer", dict(fs_hz=31.950, vas_l=65.327, re_ohm=4, qms=6.784, qes=0.635, qts=0.581, bl_tm=13.025, sd_cm2=500, mms_g=134.180, xmax_mm=11), 147, 277, "Sd printed 0,050 m2; SPL 87.1 dB."),
 ("PULSE10D2-V3", 10, 2, 350, 1050, PU, "pulse10-v0-10-inch-subwoofer", dict(fs_hz=37, vas_l=25.565, re_ohm=3.2, qms=6.001, qes=0.597, qts=0.528, bl_tm=11.982, sd_cm2=330, mms_g=111.383), None, None, "Sd printed 0,033 m2; Cms 165.261 uM/N; SPL 85.4 dB. Page slug says V0, page title and manual V3."),
 ("PULSE12D2-V3", 12, 2, 350, 1050, PU, "pulse12-v0-12-inch-subwoofer", dict(fs_hz=38.5, vas_l=42.568, re_ohm=3.2, qms=6.756, qes=0.711, qts=0.643, bl_tm=12.226, sd_cm2=490, mms_g=137.171), None, None, "Sd printed 0,049 m2; Cms 124.4127 uM/N; SPL 87.2 dB."),
 ("BA10D2-V5", 10, 2, 750, 2250, BA5, "ba10-12-v5-blackair-subwoofers", dict(fs_hz=38.045, vas_l=13.596, re_ohm=3.4, qms=2.585, qes=0.614, qts=0.496, bl_tm=14.687, sd_cm2=298.65, mms_g=163.014, xmax_mm=15), None, None, "Series column (parallel: Fs 38.464, Re 0.8, Qes 0.529, Qts 0.428, Bl 7.803). Sd printed '29.865' without unit (dm2 assumed: 298.65 cm2). Vas printed without unit (litres)."),
 ("BA12D2-V5", 12, 2, 800, 2400, BA5, "ba12-v5-subwoofer", dict(fs_hz=32.052, vas_l=33.605, re_ohm=3.4, qms=3.437, qes=0.525, qts=0.455, bl_tm=17.807, sd_cm2=483.05, mms_g=243.113, xmax_mm=15), None, None, "Series column (parallel: Fs 32.953, Re 0.8, Qes 0.490, Qts 0.429, Bl 9.344). Sd printed '48.305' without unit (dm2 assumed)."),
 ("BLACKAIR10D2S-V3", 10, 2, 300, 900, BAS, "blackair10d2s-v3-subwoofer", dict(fs_hz=36.14, vas_l=14.433, re_ohm=3.6, qms=5.10, qes=1.051, qts=0.869, bl_tm=13.342, sd_cm2=340, mms_g=228.9, xmax_mm=8), None, None, "Series column (parallel: Re 0.9, Qes 0.935, Qts 0.750, Bl 7.122). Sd printed 0,034 m2. Shallow."),
 ("BLACKAIR12D2S-V3", 12, 2, 300, 900, BAS, "blackair12d2s-v3", dict(fs_hz=31.63, vas_l=32.205, re_ohm=3.6, qms=5.488, qes=0.965, qts=0.821, bl_tm=13.897, sd_cm2=480, mms_g=260.439, xmax_mm=8), None, None, "Series column (parallel: Re 0.9, Qes 0.865, Qts 0.724, Bl 7.887). Sd printed 0,048 m2. Shallow."),
 ("BLACKAIR10D2-V7", 10, 2, 1000, 1800, BA7, "black-air-10-inch-dual-2ohms-subwoofer", dict(fs_hz=30.6, vas_l=23.8, re_ohm=4, qms=5.44, qes=0.48, qts=0.44, bl_tm=16, sd_cm2=330, mms_g=174.2, le_mh=3.03), None, None, "Bl printed '16.Tm'. Sd printed 0,033 m2. RMS 1000 W from the product page."),
 ("BLACKAIR12D2-V7", 12, 2, 1000, 2250, BA7, "black-air-12-inch-dual-2ohms-subwoofer", dict(fs_hz=31, vas_l=29, re_ohm=4, qms=6.04, qes=0.62, qts=0.56, bl_tm=18.9, sd_cm2=470, mms_g=283.2, le_mh=3.18), None, None, "Sd printed 0,047 m2."),
 ("BLACKAIR15D2-V7", 15, 2, 1000, 3000, BA7, "blackair15d2-v7", dict(fs_hz=28, vas_l=69.8, re_ohm=4, qms=4.39, qes=0.51, qts=0.46, bl_tm=22.5, sd_cm2=750, mms_g=367.9, le_mh=3.31), None, None, "Sd printed 0,075 m2."),
 ("BD12D2-V4", 12, 2, 1500, None, BD4, "bd12d2-v4-streetbass-subwoofer", dict(re_ohm=3.6, le_mh=3.028, fs_hz=32.11, sd_cm2=452.39, bl_tm=21.48, qms=4.608, qes=0.688, qts=0.599, vas_l=16.331, mms_g=490.086, xmax_mm=16), None, None, "Sd printed '45.239' without unit (dm2 assumed). Re row printed with 'Hz' units on some columns (misprint). Manual also prints the same table for the BD..SPL-V3 models (A6 copy)."),
 ("BD12D4-V4", 12, 4, 1500, None, BD4, "bd12d4-v4-streetbass-subwoofer", dict(re_ohm=6.4, le_mh=4.66, fs_hz=33.89, sd_cm2=452.39, bl_tm=25.885, qms=4.385, qes=0.763, qts=0.650, vas_l=17.080, mms_g=375.257, xmax_mm=16), None, None, "Sd printed '45.239' (dm2 assumed)."),
 ("BD15D2-V4", 15, 2, 1600, None, BD4, "bd15d2-v4-vibe-blackdeath-15-inch-1600-watts-street-bass-subwoofer", dict(re_ohm=3.6, le_mh=3.039, fs_hz=30.17, sd_cm2=754.77, bl_tm=20.302, qms=5.114, qes=0.839, qts=0.721, vas_l=44.422, mms_g=506.641, xmax_mm=16), None, None, "Sd printed '75.477' (dm2 assumed)."),
 ("BD15D4-V4", 15, 4, 1600, None, BD4, "bd15d4spl-v3-vibe-blackdeath-15-inch-1600-watts-subwoofer", dict(re_ohm=6.4, le_mh=4.60, fs_hz=30.14, sd_cm2=754.77, bl_tm=25.436, qms=4.610, qes=0.954, qts=0.790, vas_l=44.286, mms_g=509.184, xmax_mm=16), None, None, "Sd printed '75.477' (dm2 assumed). Page slug says BD15D4SPL-V3, page title BD15D4-V4."),
]
drivers = []
for model, size, ohm, rms, peak, man, slug, p, dep, cut, note in R:
    qc = p["qms"] * p["qes"] / (p["qms"] + p["qes"])
    drivers.append(rec(model, size, "DVC", ohm, rms, peak, p, "series", depth_mm=dep, cut_mm=cut, status="current",
                       sources=[src(man, doc="maker owner's manual PDF, TS Parameters table (text layer)"), src(P + slug + "/", fields=("rms_w", "peak_w"), doc="product page (headless browser)")],
                       notes=f"T/S from the maker manual (printed Qts {p['qts']} vs Qms*Qes/(Qms+Qes) {qc:.3f}). Re is the series value of the two coils (inference from 2x the coil rating). " + note))
LIST = [("SLICK12D4-V3", "slick12d4-v3-vibe-slick-12-inch-1350-watts-max-subwoofer", 500, "Slick V3 manual table covers only the D2 models."),
        ("BLACKAIR8D2S-V3", "blackair8d2s-v3-shallow-subwoofer", 200, "Linked data sheet BLACKAIR8D2S-V3-1.pdf has no T/S text (image layout, not read)."),
        ("BD8D2-V4", "bd8d2-v3-blackdeath-8-inch-subwoofer", None, "Page prints 'Peak/RMS: 800W/2400W' (labels swapped or misprint, not entered); data sheet BD8D2-V4-DATASHEET-2-2-1.pdf has no T/S text."),
        ("CVEN10SW-V7", "cven10sw-v7", 400, "Sound-quality subwoofer; no T/S table found in the linked CVEN manual text."),
        ("CVEN10D2S-V5", "cven10d2s-v5", 750, "Slimline subwoofer; page text mentions only Vas (no table)."),
        ("BLACKAIR10D2S-V2 / BLACKAIR12D2S-V2", "blackair10d2s-v2-slimline-subwoofer", 300, "Older V2 manual (2022) prints exactly the V3 table; not added twice.")]
no_ts = [{"model": m, "rms_w": r, "url": P + s + "/", "note": n + " Read 2026-11-23 (headless browser).", "sources": [src(P + s + "/", doc="product page (headless browser)")]} for m, s, r, n in LIST]
save("world", "vibe", "VIBE Audio", "UK", "https://vibeaudio.co.uk/",
     "R2B 2026-11-23: product pages read in the headless browser (curl gets 403), one page per launch, 6 s apart; manuals fetched with curl 3 s apart. Numbers only.",
     drivers, no_ts, coverage="BlackDeath (hp_subs_raw), BlackDeath street V4, BlackAir V5/V7/slim, Slick V0/V3, Pulse, CVEN subwoofer pages in the maker product sitemap")
