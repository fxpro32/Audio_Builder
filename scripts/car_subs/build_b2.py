#!/usr/bin/env python3
"""R2_SUBS_ALL (copied from A2 scripts/hp_subs/build_b2.py, 2000 W filter removed, Riot/DVPE212/Rage12 PWR added; A2 saved pages re-used, no new requests): B2 Audio (Denmark) records parsed with b2_parse.py from b2audio.com product pages (saved copies), read 2026-11-21."""
import sys, re, json, subprocess, glob, os; sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
R = "/workspace/references/raw/hp_subs/us/b2-audio/"
NAMES = {"rage12": ("Rage 12", 12), "rage15": ("Rage 15", 15), "ragexl12": ("Rage XL 12", 12), "ragexl15": ("Rage XL 15", 15),
         "rampage10": ("Rampage 10", 10), "rampage12": ("Rampage 12", 12), "rampage15": ("Rampage 15", 15), "rampage18-elite": ("Rampage 18 Elite", 18),
         "riot10": ("Riot 10", 10), "riot12": ("Riot 12", 12), "riot15": ("Riot 15", 15), "dvpe212": ("DVPE212", 12), "rage12pwr": ("Rage 12 PWR", 12)}
data = json.loads(subprocess.run([sys.executable, "-I", "/workspace/scripts/hp_subs/b2_parse.py", *[R + k + ".html" for k in NAMES]], capture_output=True, text=True).stdout)
num = lambda s: float(re.match(r"\s*([\d.]+)", s).group(1)) if s and re.match(r"\s*([\d.]+)", s) else None
d = []
for key, (name, size) in NAMES.items():
    for b in data[R + key + ".html"]["blocks"]:
        ohm = num(b.get("Nominal Impedance")); ohm = int(ohm) if ohm and ohm.is_integer() else ohm
        pw = [num(x) for x in (b.get("Power Handling") or "").split("/")]
        peak, rms = (pw + [None, None])[:2] if len(pw) >= 2 else (None, pw[0] if pw else None)
        ss = [num(x) for x in (b.get("Sensitivity") or "").split("/")]
        s1, s2 = (ss + [None, None])[:2] if len(ss) >= 2 else (None, None)
        p = dict(fs_hz=num(b.get("Resonance Frequency")), qms=num(b.get("QMS")), qes=num(b.get("QES")), qts=num(b.get("QTS")), vas_l=num(b.get("VAS")),
                 mms_g=num(b.get("MMS")), sd_cm2=num(b.get("SD")), le_mh=num(b.get("LE")), xmax_mm=num(b.get("Xmax")), spl_db_1w1m=s1, spl_db_2v83=s2)
        hdr = b.get("_header") or ""
        d.append(rec(f"{name} D{ohm}", size, "DVC", ohm, int(rms) if rms else None, int(peak) if peak else None, p, "unknown", disp_l=num(b.get("Displacement")), status="current",
            sources=[src(f"https://www.b2audio.com/produkt/{key}/", doc="product page spec sheet block", date="2026-11-21")],
            notes=(f"Block heading '{hdr}'; " if hdr else "First block has no 'DUAL x' heading; its 'Nominal Impedance 1 Ω' is taken as the dual 1 ohm version (the second block is headed 'DUAL 2 Ω'). ")
                  + f"Power published as '{b['Power Handling']}' (peak / RMS). Sensitivity published as '{b['Sensitivity']}' (taken as 1 W / 2.83 V). "
                  + f"Re and Bl not published; maker gives BL^2/RE {b.get('BL^2/RE')}, Cms {b.get('CMS um/N')} um/N, Xmech {b.get('Xmech')}. Mounting depth and cutout not in the block. ts_basis not stated."))
save("us", "b2-audio", "B2 Audio", "Denmark", "https://www.b2audio.com",
     "R2 2026-11-23: re-used the product pages A2 saved on 2026-11-21 (WooCommerce site; robots.txt allows product pages). Numbers only.",
     d, [], coverage="all subwoofer product pages in the maker's 10/12/15/18 in categories")
