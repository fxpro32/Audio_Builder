#!/usr/bin/env python3
"""R4_CAR_DRIVERS: DD Audio (USA) car speakers (C/D/E/RL/VO series: coaxials, components, tweeters, horns, midranges, mid-woofers,
full-range) from ddaudio.com product pages' 'Model Specs' table (label|value|explanation), listed from the speaker category pages,
read 2026-11-23 5 s apart (A2 read the same WordPress site for subs). Metric columns used where both are printed. Vas printed with a
trailing 'm' (e.g. '11.392m') is read as millilitres (x 0.001 L) and noted. Loaded enclosures and subwoofers (R2) left out.
USD prices not stored. Raw: references/raw/car_drivers/dd-audio/. Usage: python3 -I build_dd_audio.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/dd-audio/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}
out = []
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    i = t.find("Model Specs|Model Specs|"); j = t.find("|Buy Online", i)
    if i < 0: print("no specs", fn); continue
    seg = [x.strip() for x in t[i + 24:j].split("|")]
    d = {}; k = 0
    while k < len(seg) - 1:
        lab, val = seg[k], seg[k + 1]
        if len(lab) < 45 and not lab.endswith("."):
            d.setdefault(lab, val); k += 3 if (k + 2 < len(seg) and len(seg[k + 2]) > 25) else 2
        else: k += 1
    parts = url.rstrip("/").split("/")
    code = parts[-1].upper()
    cat = parts[-2] if len(parts) >= 2 else ""
    typ = {"coaxial": "coaxial", "component-set": "component_set", "full-range": "fullrange", "horn": "tweeter", "tweeter": "tweeter",
           "midrange": "midrange", "mid-woofer": "midbass", "woofer": "midbass"}.get(cat)
    if typ is None:
        cu = code.lower()
        typ = "tweeter" if "tw" in cu else ("midbass" if "cw" in cu else ("component_set" if re.search(r"-c\d", cu) else "midrange"))
    g = lambda *ks: next((d[x] for x in ks if x in d), None)
    sz_mm = num(g("Speaker Size (MM)")); sz_in = num(g("Speaker Size (In)"))
    size = sz_in if sz_in and sz_in < 20 else None
    lab = f"{sz_mm:g} mm" if sz_mm else None
    if not size and sz_mm:
        size = {20: 0.8, 25: 1, 28: 1.1, 35: 1.4, 50: 2, 70: 2.75, 100: 4, 130: 5.25, 165: 6.5, 200: 8, 250: 10}.get(int(sz_mm))
    mo = re.search(r"(\d)x(\d+)", code.lower())
    if mo and typ != "tweeter": lab = f"{mo.group(1)}x{mo.group(2)}"; size = None
    elif re.search(r"(369|269)$", code): lab = "6x9"; size = None
    vas = g("Vas (Ltr)"); notes = []
    vas_l = None
    if vas:
        mv = re.match(r"^\s*([\d.]+)\s*(m?)\s*$", vas)
        if mv: vas_l = num(mv.group(1)) / 1000 if mv.group(2) else num(mv.group(1))
        if mv and mv.group(2): notes.append(f"Vas printed '{vas}' read as millilitres.")
    fr = None
    mf = re.search(r"([\d.]+)\s*(k?)\s*[–-]\s*([\d.]+)\s*(k?)", g("Frequency Response (Hz)") or "")
    if mf: fr = [num(mf.group(1)) * (1000 if mf.group(2) else 1), num(mf.group(3)) * (1000 if mf.group(4) else 1)]
    xo = num(g("Crossover Frequency (Hz)"))
    xover = {"hp_hz": xo, "note": "maker 'Crossover Frequency (Hz)' = recommended high-pass"} if xo else None
    params = {"fs_hz": num(g("Fs (Hz)")), "qms": num(g("Qms")), "qes": num(g("Qes")), "qts": num(g("Qts")), "vas_l": vas_l, "bl_tm": num(g("BL (TM)", "BL")),
              "re_ohm": num(g("Re (Ohms)", "Re")), "sd_cm2": num(g("Sd (cm2)", "Sd")), "mms_g": num(g("Mms (g)", "Mms")), "le_mh": num(g("Le (mH)", "Le")),
              "xmax_mm": num(g("Xmax (MM)"))}
    if g("Xmech (MM)"): notes.append(f"Maker Xmech (mechanical limit) {g('Xmech (MM)')} mm.")
    sens = num(g("Sensitivity (dB)", "Sensitivity", "SPL (1W/1M)"))
    depth = num(g("Mounting Depth (MM)")) or (round(num(g("Mounting Depth (In)")) * 25.4, 1) if g("Mounting Depth (In)") else None)
    cut = num(g("Mounting Diameter (MM)", "Cutout Diameter (MM)")) or (round(num(g("Mounting Diameter (In)")) * 25.4, 1) if g("Mounting Diameter (In)") else None)
    od = num(g("Frame OD (MM)")) or (round(num(g("Frame OD (In)")) * 25.4, 1) if g("Frame OD (In)") else None)
    r = rec(f"DD Audio {code}", typ, size, lab, num(g("Voice Coil Impedance", "Impedance")), "SVC", num(g("Watts RMS")), num(g("Peak Power")),
            sens, "unknown" if sens else None, fr, None, params, "per_coil", depth_mm=depth, cutout_mm=cut, frame_mm=od, xover=xover,
            sources=[src(url, ["*"], doc="product page, Model Specs table")], notes=" ".join(notes), extra={"vcd_mm": num(g("VCD (MM)"))})
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("dd-audio", "DD Audio (Resonance, Inc.)", "USA", "https://ddaudio.com",
     "R4 2026-11-23: WordPress site, robots.txt disallows only /wp-admin/ (A2); pages read 5 s apart. Numbers only.", out)
