# a non-VPN connection (local copies in references/raw/hp_subs/direct/vibe/). Values typed from those copies.
import json
FT3 = 28.3168  # litres per cubic foot
RD = "2026-11-22"
B = "https://vibeaudio.co.uk/"
U = B + "wp-content/uploads/"
P = B + "product/"
def P_(fs=None, re=None, qms=None, qes=None, qts=None, vas=None, sd=None, xmax=None, mms=None, bl=None, le=None, spl=None):
    return {"fs_hz": fs, "re_ohm": re, "qms": qms, "qes": qes, "qts": qts, "vas_l": vas, "sd_cm2": sd, "xmax_mm": xmax,
            "mms_g": mms, "bl_tm": bl, "le_mh": le, "spl_db_1w1m": spl, "spl_db_2v83": None}
def src(fields, url, doc, page=None):
    return {"fields": fields, "url": url, "doc": doc, "page": page, "read_date": RD, "tier": 1}
def box(lo, hi, note, tuning=None, vol=None):
    return {"type": "ported", "volume_l": round(vol * FT3, 2) if vol else None, "volume_range_l": [round(lo * FT3, 2), round(hi * FT3, 2)],
            "tuning_hz": tuning, "source": "maker", "note": note}
HEXC = U + "2019/05/Blackdeath-comp-subwoofer-manual-050718.pdf"
HEX = U + "2019/08/Blackdeath-subwoofer-manual-050718.pdf"
V4C = U + "2024/07/BDC15_18SPL-V4-subwoofer-user-manual.pdf"
TS15 = U + "2024/07/TS-Parameter-Sheet-BDC15D1SPL-V4.pdf"
HEXNOTE = ("Page text also says '2 way linear movement of 70mm' (total travel, not a one-way Xmax; Xmax left null). "
           "Manual prints Sd in 'm/2' (read as m2) and Rms/Res/Rp/Nref values not used. ts_basis not stated; Re about 1.7 to 1.8 ohm on a dual 1 ohm driver suggests the coils in series (inference only). "
           "Converted from imperial as published: enclosure volume in cu ft x 28.3168.")
drivers = [
 {"model": "BLACKDEATH12HEX-V7", "size_in": 12, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 2500, "peak_w": 7500,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(fs=32.6, re=1.7, qms=4.31, qes=0.35, qts=0.32, vas=22.8, sd=470, mms=325, bl=18.1, spl=85.4),
  "mounting_depth_mm": 285, "cutout_mm": 301, "displacement_l": None,
  "recommended_boxes": [box(3, 4.5, "product page 'Enclosure volume: 3 - 4.5 cubic feet'; manual p.6 says 2.5 - 4.5 ft3 vented")],
  "status": "current",
  "sources": [src(["fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "mms_g", "bl_tm", "spl_db_1w1m"], HEX, "Blackdeath subwoofer manual 050718, TS Parameters table", 5),
              src(["rms_w", "peak_w", "ohms_per_coil", "coils"], HEX, "Blackdeath subwoofer manual 050718, Specification", 6),
              src(["rms_w", "peak_w", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], P + "blackdeath12hex-v7", "product page, Specifications")],
  "notes": "Product page 'Mounting depth: 11.2in (285mm), mounting diameter: 11.6in (301mm)'; manual p.6 gives mounting diameter 11.1in (283mm) (conflict, page value used for cutout_mm). Page sensitivity 88 dB, manual SPL 85.4 dB (manual value used). " + HEXNOTE},
 {"model": "BLACKDEATH15HEX-V7", "size_in": 15, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 2500, "peak_w": 7500,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(fs=28.1, re=1.7, qms=4.06, qes=0.36, qts=0.33, vas=66.3, sd=750, mms=384, bl=17.9, spl=88),
  "mounting_depth_mm": 300, "cutout_mm": 375, "displacement_l": None,
  "recommended_boxes": [box(3, 4.5, "product page 'Enclosure volume: 3 - 4.5 cubic feet'; manual p.6 says 3 - 5 ft3 vented")],
  "status": "current",
  "sources": [src(["fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "mms_g", "bl_tm", "spl_db_1w1m"], HEX, "Blackdeath subwoofer manual 050718, TS Parameters table", 5),
              src(["rms_w", "peak_w", "ohms_per_coil", "coils"], HEX, "Blackdeath subwoofer manual 050718, Specification", 6),
              src(["rms_w", "peak_w", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], P + "blackdeath15hex-v7", "product page, Specifications")],
  "notes": "Product page 'Mounting depth: 11.8in (300mm), mounting diameter: 14.7in (375mm)'; manual p.6 gives mounting diameter 14.1in (359mm) (conflict, page value used). Page sensitivity 89 dB, manual SPL 88 dB (manual value used). " + HEXNOTE},
 {"model": "BLACKDEATHC12HEX-V7", "size_in": 12, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 5000, "peak_w": 15000,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(fs=32.2, re=None, qms=6.04, qes=0.34, qts=0.323, vas=22.09, sd=470, mms=342.8, bl=20.14, spl=85.36),
  "mounting_depth_mm": 285, "cutout_mm": 301, "displacement_l": None,
  "recommended_boxes": [box(3, 3, "product page 'Enclosure volume: 3 - infinite cubic feet' (vented, minimum 3 cu ft); manual p.6 '3 - inf ft3 Vented'")],
  "status": "current",
  "sources": [src(["fs_hz", "qms", "qes", "qts", "vas_l", "sd_cm2", "mms_g", "bl_tm", "spl_db_1w1m"], HEXC, "Blackdeath competition subwoofer manual 050718, TS Parameters table", 5),
              src(["rms_w", "peak_w", "ohms_per_coil", "coils"], HEXC, "Blackdeath competition subwoofer manual 050718, Specification", 6),
              src(["rms_w", "peak_w", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], P + "blackdeathc12hex-v7", "product page, Specifications")],
  "notes": "DATA PROBLEM: manual prints Re as '1.Ω' (digit missing), so re_ohm left null. Product page mounting diameter 11.6in (301mm), manual 11.1in (283mm) (page value used). Page sensitivity 88 dB, manual SPL 85.36 dB (manual value used). Recommended box is open-ended ('3 - infinite'), recorded as a 3 cu ft minimum range [3, 3]. " + HEXNOTE},
 {"model": "BLACKDEATHC15HEX-V7", "size_in": 15, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 5000, "peak_w": 15000,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(fs=28.35, re=1.8, qms=5.43, qes=0.26, qts=0.256, vas=43.33, sd=750, mms=578.3, bl=27.67, spl=87.67),
  "mounting_depth_mm": 300, "cutout_mm": 375, "displacement_l": None,
  "recommended_boxes": [box(3, 3, "product page 'Enclosure volume: 3 - infinite cubic feet' (vented, minimum 3 cu ft)")],
  "status": "current",
  "sources": [src(["fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "mms_g", "bl_tm", "spl_db_1w1m"], HEXC, "Blackdeath competition subwoofer manual 050718, TS Parameters table", 5),
              src(["rms_w", "peak_w", "ohms_per_coil", "coils"], HEXC, "Blackdeath competition subwoofer manual 050718, Specification", 6),
              src(["rms_w", "peak_w", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], P + "blackdeathc15hex-v7", "product page, Specifications")],
  "notes": "Product page mounting diameter 14.7in (375mm), manual 14.1in (359mm) (page value used). Page sensitivity 89 dB, manual SPL 87.67 dB (manual value used). Recommended box open-ended, recorded as [3, 3] cu ft minimum. " + HEXNOTE},
 {"model": "BLACKDEATHC18HEX-V7", "size_in": 18, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 5000, "peak_w": 15000,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(fs=25.71, re=1.8, qms=5.09, qes=0.34, qts=0.32, vas=122.7, sd=1160, mms=590.8, bl=23.65, spl=89.88),
  "mounting_depth_mm": 315, "cutout_mm": 459, "displacement_l": None,
  "recommended_boxes": [box(3, 3, "product page 'Enclosure volume: 3 - infinite cubic feet' (vented, minimum 3 cu ft)")],
  "status": "current",
  "sources": [src(["fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "mms_g", "bl_tm", "spl_db_1w1m"], HEXC, "Blackdeath competition subwoofer manual 050718, TS Parameters table", 5),
              src(["rms_w", "peak_w", "ohms_per_coil", "coils"], HEXC, "Blackdeath competition subwoofer manual 050718, Specification", 6),
              src(["rms_w", "peak_w", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], P + "blackdeathc18hex-v7", "product page, Specifications")],
  "notes": "DATA PROBLEM: manual prints Cms 0.64 mm/N, which with Mms 590.8 g gives fs about 8 Hz, not the printed 25.71 Hz (Cms 0.064 would fit; not used). Product page prints 'Mounting depth: 11.8in (315mm), mounting diameter: 18in (459 mm)': inch and mm values disagree (mm used); manual mounting diameter 16.8in (425mm). Page sensitivity 90 dB, manual SPL 89.88 dB. The product page links the non-competition manual; the T/S come from the competition manual, which lists this model. Recommended box open-ended, recorded as [3, 3] cu ft minimum. " + HEXNOTE},
 {"model": "BDC15D1SPL-V4", "size_in": 15, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 5000, "peak_w": 15000,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(fs=33.616, re=2, qms=2.571, qes=0.355, qts=0.312, vas=None, sd=None, xmax=26, mms=566.346, bl=27.829, le=2.191, spl=83.5),
  "mounting_depth_mm": 262, "cutout_mm": 357, "displacement_l": None,
  "recommended_boxes": [box(3, 5.5, "TS sheet: ported, example 3.5 cu ft, tuning 25 - 38 Hz, port area example 4 (unit not printed); range 3 - 5.5 cu ft from page and TS sheet", tuning=None, vol=3.5)],
  "status": "current",
  "sources": [src(["fs_hz", "re_ohm", "qms", "qes", "qts", "xmax_mm", "mms_g", "bl_tm", "le_mh", "spl_db_1w1m", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], TS15, "TS Parameter Sheet BDC15D1SPL-V4", 1),
              src(["rms_w", "peak_w"], TS15, "TS Parameter Sheet BDC15D1SPL-V4, 'Power Handling (Peak/RMS) 15,000W/5000W'", 1),
              src(["re_ohm", "qms", "qes", "qts", "mms_g", "bl_tm", "rms_w", "peak_w"], V4C, "BDC15/18SPL-V4 user manual, TS Parameters + Specification"),
              src(["rms_w", "peak_w", "ohms_per_coil", "coils"], P + "bdc15d1spl-v4-vibe-15-black-death-5000-watts-competition-subwoofer", "product page: title '5000W RMS', text '5000W RMS Power ... peak power of 15000W'")],
  "notes": "RMS: the product page spec list prints 'Peak/RMS: 5000W/15000W' (swapped), but its title, body text and the TS sheet agree on 5000 W RMS / 15000 W peak. DATA PROBLEM: the TS sheet and manual print Sd 75.477 and Vas 9.011 with NO unit; neither fits cm2/L, in2 or cu ft for a 15 in cone with the printed Cms 29.994 um/N and Mms (the 12 in and 15 in V3 manual prints Sd 45.239/75.477 the same way), so sd_cm2 and vas_l are null. Printed Cms 29.994 um/N with Mms 566.346 g gives fs about 38.6 Hz vs printed 33.616 Hz. Printed efficiency 0.141 % fits the printed SPL 83.5 dB 1W/1m; the product page says 89 dB and the TS sheet spec block says 84 dB. Xmech 40 mm. Size printed 15in (392mm) on the TS sheet and 15in (381mm) on the page. Manual gives mounting depth 11.8in (300mm) and diameter 14.8in (375mm) vs 262/357 mm on the page and TS sheet (TS sheet values used). Re 2 ohm on a dual 1 ohm driver suggests the coils in series (inference only). Converted from imperial as published (cu ft x 28.3168)."},
 {"model": "BDC18D1SPL-V4", "size_in": 18, "coil": "DVC", "ohms_per_coil": 1, "coils": 2, "rms_w": 5000, "peak_w": 15000,
  "final_loads_ohm": [0.5, 2], "ts_basis": "unknown",
  "params": P_(re=2, qms=2.528, qes=0.416, qts=0.357, mms=861.14, bl=30.289),
  "mounting_depth_mm": 290, "cutout_mm": 427, "displacement_l": None,
  "recommended_boxes": [box(6, 8, "product page 'Enclosure Volume: 6-8 cuft'; manual says 3.5 - 6 ft3")],
  "status": "current",
  "sources": [src(["re_ohm", "qms", "qes", "qts", "mms_g", "bl_tm"], V4C, "BDC15/18SPL-V4 user manual, TS Parameters table"),
              src(["rms_w", "peak_w"], V4C, "BDC15/18SPL-V4 user manual, Specification 'Peak/RMS Power 15,000W/5000W'"),
              src(["rms_w", "ohms_per_coil", "coils", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], P + "bdc18d1spl-v4-vibe-18-black-death-5000-watts-competition-subwoofer", "product page: title '5000W RMS', Technical Specifications")],
  "notes": "No Fs published (no TS sheet on the product page; the manual table has no Fs). DATA PROBLEM: manual prints Sd 116.416 and Vas 45.460 with NO unit (same unit problem as the BDC15D1SPL-V4), so sd_cm2 and vas_l are null. RMS: page spec list prints 'Peak/RMS: 5000W/15000W' (swapped) but the title and the manual agree on 5000 W RMS. Page prints '18in (381mm)' (mm wrong), mounting depth 11.4in (290mm), diameter 16in (427mm); manual gives 12.4in (315mm) and 16.8in (427mm) (page depth used). Sensitivity 89 dB on the page. Converted from imperial as published (cu ft x 28.3168)."},
]
no_ts = [
 {"model": "BD15D1SPL-V4 (15 in, Dual 1 ohm)", "rms_w": 3000, "url": P + "bd15d1spl-v4-vibe-15-black-death-3000-watts-subwoofer",
  "note": "Title '3000W RMS' and heading '9000 Watts Max'; spec list prints 'Peak/RMS: 3000W/9000W' (labels swapped). 88 dB, mounting depth 10.1in (258mm), diameter 14.7in (357mm), box 3-5 cu ft. No T/S on the page; the linked manual is the BDC15/18 V4 manual (different model). Read through a non-VPN connection 2026-11-22."},
 {"model": "BD15D2SPL-V4 (15 in, Dual 2 ohm)", "rms_w": 3000, "url": P + "bd15d2spl-v4-vibe-15-black-death-3000-watts-subwoofer",
  "note": "Title '3000W RMS'; spec list prints 'Peak/RMS: 3000W/9000W' (labels swapped) and wrongly names the model 'BD15D1SPL-V4' with '15in (305mm)'. 88 dB, depth 10.1in (258mm). The linked manual covers the V3 1500-1600 W models only (T/S not used). Read 2026-11-22."},
 {"model": "BD12D1SPL-V4 (12 in, Dual 1 ohm)", "rms_w": 3000, "url": P + "bd12d1spl-v4",
  "note": "Title '3000W RMS', heading '9000 Watts Max'; spec 'Peak/RMS: 3000W/9000W' (labels swapped). 84 dB, depth 9in (229mm), diameter 11in (281mm), box 2.5-4.5 cu ft. The linked manual covers the V3 1500 W models only (T/S not used). Read 2026-11-22."},
 {"model": "BD12D2SPL-V4 (12 in, Dual 2 ohm)", "rms_w": 3000, "url": P + "bd12d2spl-v4",
  "note": "Title '3000W RMS'; spec 'Peak/RMS: 3000W/9000W' (labels swapped). 88 dB, depth 9in (229mm), diameter 11in (281mm), box 2.5-4.5 cu ft. No T/S. Read 2026-11-22."},
 {"model": "BDC15SPL-V2 (15 in, Dual 1 ohm, older model, out of stock)", "rms_w": 3000, "url": P + "bdc15splv2-blackdeath-15-competition-street-bass-subwoofer",
  "note": "Page and manual (" + U + "2019/09/BD-subwoofer-manual-300413.pdf p.4) agree: RMS 3000 W, peak 9000 W, 'Minimum input 1500 W RMS', 89 dB, mounting depth 210 mm, diameter 350 mm. No T/S published. Read 2026-11-22."},
]
out = {
 "brand": "VIBE Audio", "country": "United Kingdom", "brand_url": B,
 "terms_note": "vibeaudio.co.uk blocks the container's VPN exit (403). Read on 2026-11-22 through a non-VPN connection, which has a direct route: plain curl.exe output to stdout only, nothing written on a non-VPN connection after the PM override, at least 6 s between requests (product sitemap + 21 product pages + 7 PDFs). Numbers only; the manuals claim copyright on their content, so no text or images are reproduced. Local copies (audit only, gitignored): references/raw/hp_subs/direct/vibe/.",
 "drivers": drivers, "no_ts_published": no_ts,
 "excluded_notes": "Below 2000 W RMS (maker pages read 2026-11-22): BD15SPL-V2 1500 W RMS (" + P + "bd15spl-v2-blackdeath-15-inch-street-bass-subwoofer), BD15D2-V4 and BD15D4 'SPL-V3' page 1600 W RMS (" + P + "bd15d2-v4-vibe-blackdeath-15-inch-1600-watts-street-bass-subwoofer), BD12D2-V4 / BD12D4-V4 1500 W RMS (" + P + "bd12d2-v4-streetbass-subwoofer), and the smaller Slick, BlackAir, Pulse, CVEN lines (sitemap " + B + "product-sitemap.xml). Recone kits (BLACKDEATH12/15HEXRK-V7, C12/C15/C18HEXRK-V7) are spare parts, not complete subs, and are not listed. The old BD15D4SPL-V3 URL now shows the BD15D4-V4 (1600 W RMS). Earlier search-snippet leads ?p=9523 and ?p=1990 are the BD15D1SPL-V4 and BDC15SPL-V2 recorded here."}
import os; os.makedirs("/workspace/data/private/hp_subs_raw/world", exist_ok=True)  # P1_PUBLIC_DATA: VIBE records are private
json.dump(out, open("/workspace/data/private/hp_subs_raw/world/vibe.json", "w"), indent=1, ensure_ascii=False)
print("vibe.json:", len(drivers), "drivers,", len(no_ts), "no_ts")
