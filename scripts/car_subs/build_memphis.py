#!/usr/bin/env python3
"""R2_SUBS_ALL: Memphis Car Audio (USA). MJ1212 (MOJO 12, 1500 W) T/S from the maker spec sheet A2 saved on 2026-11-21
(references/raw/hp_subs/us/memphis/mj1212-spec.pdf; the sheet gives a 1 ohm and a 2 ohm column, the MJ1212 being sold in both
impedances); the other car subwoofer product URLs from A2's saved subwoofer listing page are listed without values: the site answered
HTTP 202 with a bot challenge on 2026-11-23, so no product page could be read. MOJO >= 2000 W models come from hp_subs_raw.
Usage: python3 -I build_memphis.py"""
import sys, re
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save, L
H = "/workspace/references/raw/hp_subs/us/memphis/"
SHEET = "https://www.memphiscaraudio.com/wp-content/uploads/2025/05/mj1212-spec-sheet-lr-1.pdf"
d = []
for ohm, p, vas_cf, bl, mms, spl in ((1, dict(fs_hz=33, qms=2.319, qes=0.548, qts=0.44), 0.739, 11.81, 363.5, 83.5),
                                     (2, dict(fs_hz=33, qms=2.488, qes=0.514, qts=0.426), 0.79, 16.9, 358, 83.7)):
    p.update(vas_l=L(vas_cf), bl_tm=bl, mms_g=mms, sd_cm2=490.32, xmax_mm=25.4, spl_db_1w1m=spl, re_ohm=ohm)
    d.append(rec(f"MOJO MJ1212 ({ohm} ohm)", 12, "SVC", ohm, 1500, 3000, p, "per_coil", disp_cuft=0.12,
                 boxes=[box("ported", 2.5, 33, "maker spec sheet 'BALANCED BASS', single sub, net"), box("ported", 3.3, 29, "maker spec sheet 'DEEP BASS', single sub, net")],
                 status="current", sources=[src(SHEET, doc="maker spec sheet PDF (saved by A2)", page=1, date="2026-11-21")],
                 notes="Vas printed 0.739/0.79 cu ft and Xmax 1 in, converted. 'VOICE COIL AND MAGNET DCR' printed equal to the nominal impedance (1 / 2), entered as re_ohm as printed. "
                       "RMS 1500 / peak 3000 W from the sheet's trailing row '15003000' (read as 1500 and 3000). Sheet linked from the maker MOJO product pages."))
urls = sorted(set(re.findall(r'href="(https://www\.memphiscaraudio\.com/product/[^"]+/)"', open(H + "subs.html", encoding="utf-8", errors="replace").read())))
no_ts = [{"model": u.rstrip("/").split("/")[-1].upper(), "rms_w": None, "url": u,
          "note": "Listed on the maker's subwoofer page (saved by A2 2026-11-21); product page not readable on 2026-11-23 (HTTP 202 bot challenge), so no values."}
         for u in urls if not re.search(r"mj1212v|mj1512|mj1812lvs|vive14s1", u)]
save("us", "memphis", "Memphis Car Audio", "USA", "https://www.memphiscaraudio.com",
     "R2 2026-11-23: site served a bot challenge (HTTP 202) to this container; only A2's saved copies were used. Numbers only.",
     d, no_ts, coverage="MJ1212 with T/S; other listed models by name only (site blocked)")
