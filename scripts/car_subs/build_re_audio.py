#!/usr/bin/env python3
"""R2_SUBS_ALL: RE Audio (Santa Fe Springs, CA, USA) subwoofers below the XXX v2 line. T/S from the maker 'INFO' sheets
(reaudio.com/THIELESPDF/<model>_info.pdf, linked from http://reaudio.com/info/ThieleSmall.php), RMS from each series page
(products/woofers_<series>.php: one 'Power Handling' figure per series). Read 2026-11-23 (A2's saved series pages re-used where present).
The sheets are titled e.g. 'SEX12D2/4 v2': one T/S set for both coil options; which option (and wiring) it was measured on is not stated,
so ohms_per_coil is left null except where the sheet name fixes it (REX ...S4 = single 4 ohm, SCX ...D4 = dual 4 ohm).
XXX v2 comes from hp_subs_raw. Usage: python3 -I build_re_audio.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
R = "/workspace/references/raw/car_subs/re-audio/"
B = "http://reaudio.com/"
SERIES = {"rex": ("REX", 200, "woofers_rex.php"), "scx": ("SCX v2", 450, "woofers_scxv2.php"), "sex": ("SEX v2", 750, "woofers_sex_v2.php"),
          "sxx": ("SXX v2", 1200, "woofers_sxx_v2.php"), "xx": ("XX v2", 1500, "woofers_xx.php"), "sx": ("SX", None, None)}
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def n(s):
    if s is None: return None
    v = float(s); return int(v) if v.is_integer() else round(v, 4)


drivers = []
for pdf, url in sorted(urls.items()):
    t = open(R + pdf[:-4] + ".txt", encoding="utf-8", errors="replace").read()
    g = lambda lab: (re.search(r"\b" + lab + r"\s*=\s*([\d.]+)", t) or [None, None])[1]
    sdmm = g("Sd")
    p = dict(re_ohm=n(g("Re")), fs_hz=n(g("Fs")), qes=n(g("Qes")), qms=n(g("Qms")), qts=n(g("Qts")), le_mh=n(g("Le")),
             sd_cm2=round(float(sdmm) / 100, 2) if sdmm else None, vas_l=n(g("Vas")), bl_tm=n(g("BL")), mms_g=n(g("Mms")))
    title = (re.search(r"=== page 1 ===\s*\n([^\n]+)", t) or [None, pdf[:-9].upper()])[1].strip()
    key = re.match(r"[a-z]+", pdf).group(0)
    name, rms, page = SERIES.get(key, (key.upper(), None, None))
    size = int(re.search(r"(\d+)", pdf).group(1))
    coil, ohm = None, None
    if re.search(r"s4", pdf): coil, ohm = "SVC", 4
    elif re.search(r"d4", pdf): coil, ohm = "DVC", 4
    elif "D2/4" in title: coil = "DVC"
    srcs = [src(url, ["params"], doc="maker INFO sheet (T/S)")]
    if page: srcs.append(src(B + "products/" + page, ["rms_w"], doc="series page (one Power Handling figure for the series)",
                             date="2026-11-21" if os.path.exists("/workspace/references/raw/hp_subs/us/re-audio/" + page.replace(".php", ".html")) else "2026-11-23"))
    r = rec(f"{name} {size} ({title})", size, coil, ohm, rms, None, p, "per_coil" if coil == "SVC" else "unknown", status="current", sources=srcs,
            notes=f"Sheet title '{title}'. Sd converted from mm2 as printed. Series page gives one RMS figure for all sizes." +
                  (" Sheet covers both coil options (D2 and D4); ohms_per_coil left null because the measured option and wiring are not stated." if ohm is None else ""))
    if ohm is None: r["final_loads_ohm"] = []
    drivers.append(r)
save("us", "re-audio", "RE Audio", "USA", "http://reaudio.com",
     "R2 2026-11-23: 15 INFO sheets and 2 series pages read 4 s apart (A2's saved series pages re-used). Copyright notice only. Numbers only.",
     drivers, [], coverage="every T/S INFO sheet linked from the maker's Thiele-Small page (REX, SCX v2, SEX v2, SX, SXX v2, XX v2, XXX v2)")
