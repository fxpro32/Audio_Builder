#!/usr/bin/env python3
"""A2: Ascendant Audio (USA) Mayhem and Havoc records, parsed from the 'Specs' blocks of ascendantaudio.com series pages (saved copies), read 2026-11-21."""
import sys, re; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, src, save
sys.path.insert(0, "/workspace/scripts/hp_subs"); import subprocess
R = "/workspace/references/raw/hp_subs/us/ascendant/"
MAP = {"Re": "re_ohm", "Fs": "fs_hz", "Qms": "qms", "Qes": "qes", "Qts": "qts", "Mms": "mms_g", "Sd": "sd_cm2", "Vas": "vas_l", "BL": "bl_tm", "Spl": "spl_db_1w1m", "Xmax": "xmax_mm", "LE": "le_mh", "Le": "le_mh"}
def specs(name):
    t = subprocess.run([sys.executable, "-I", "/workspace/scripts/hp_subs/fetch_text.py", "x", R + name + ".html", "--nofetch"], capture_output=True, text=True).stdout
    seg = t[t.find("|Specs|") + 7: t.find("© Copyright", t.find("|Specs|"))].split("|")
    out, cur, i = {}, None, 0
    while i < len(seg):
        m = re.fullmatch(r"(\d+)″ D1/D2", seg[i])
        if m: cur = int(m[1]); out[cur] = {1: {}, 2: {}}; i += 4; continue
        if cur and seg[i] in MAP and i + 2 < len(seg):
            for ohm, v in ((1, seg[i + 1]), (2, seg[i + 2])):
                out[cur][ohm][MAP[seg[i]]] = float(v)
            i += 3; continue
        i += 1
    return out
d = []
for series, name, watts in (("Mayhem", "mayhem", 4500), ("Havoc", "havoc", 2750)):
    for size, coils in specs(name).items():
        for ohm, p in coils.items():
            note = (f"Maker states '{watts}W power handling' (not labelled RMS or peak; entered as rms_w). Peak not published. Dimensions and boxes not on the page. "
                    "ts_basis not stated; Re about twice the nominal coil impedance suggests series (inference). SPL reference not stated (entered as 1 W/1 m).")
            d.append(rec(f"{series} {size} D{ohm}", size, "DVC", ohm, watts, None, p, "unknown", status="current",
                         sources=[src(f"https://ascendantaudio.com/{name}/", doc="series page, Specs table")], notes=note))
save("ascendant-audio", "Ascendant Audio", "https://ascendantaudio.com",
     "WordPress site; series pages read 5 s apart (a browser-like user agent is needed; plain curl gets HTTP 406). Terms page exists (https://ascendantaudio.com/terms/), not read in full. Chaos (1750 W) and Arsenal (1250 W) excluded.",
     d, [])
