#!/usr/bin/env python3
"""R4_CAR_DRIVERS: AUDIO SYSTEM Germany car speakers from the 13 speaker-series pages on audio-system.de (German), read 2026-11-23
3 s apart. Each product block: model, 'Beschreibung' (type words), 'bestehend aus' (set parts), 'Leistungsdaten' (Impedanz, Leistung
2x RMS/max), 'Maße' (Einbautiefe, Einbaudurchmesser). No T/S are published on these pages or in the manuals checked (HX SQ EVO3).
UVP prices are EUR (Germany), not AU: not stored. Raw: references/raw/car_drivers/audio-system/. Usage: python3 -I build_audio_system.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/audio-system/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}
out, seen = [], set()
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    toks = t.split("|")
    idx = [i for i, x in enumerate(toks) if x == "Beschreibung"]
    for n_, i in enumerate(idx):
        model = toks[i - 1].strip()
        end = idx[n_ + 1] - 1 if n_ + 1 < len(idx) else min(len(toks), i + 60)
        blk = toks[i + 1:end]; b = "|".join(blk)
        if model in seen or not re.search(r"\d", model): continue
        seen.add(model)
        bl = b.lower()
        if re.search(r"koax|coax", bl): typ = "coaxial"
        elif re.search(r"2-wege|3-wege|compo|kompo", bl): typ = "component_set"
        elif re.search(r"hochtöner|tweeter", bl): typ = "tweeter"
        elif re.search(r"mitteltöner|midrange", bl) and not re.search(r"tief/?mittel", bl): typ = "midrange"
        elif "gitter" in bl: continue
        elif re.search(r"tiefmittel|tief/mittel|tieftöner|woofer|kickbass|bass", bl): typ = "midbass"
        else: typ = None
        if typ is None: print("no type", fn, model, b[:120]); continue
        imp = re.search(r"Impedanz:\s*([\d,]+)\s*Ohm", b)
        pw = re.search(r"Leistung:\s*(?:\d\s*x\s*)?([\d.]+)\s*/\s*([\d.]+)", b)
        dep = re.search(r"Einbautiefe:\s*([\d,]+)\s*mm", b); cut = re.search(r"Einbaudurchmesser:\s*([\d,]+)(?:\s*/\s*([\d,]+))?\s*mm", b)
        parts = re.findall(r"\|(\d)x\|([A-Z][A-Z0-9 \-]+?(?:EVO\s?\d?|EVO)?)\|", "|" + b + "|")
        mm = re.search(r"(\d{2,3})\s*mm\s*(?:2-Wege|3-Wege|Koax|Compo|HIGH|EFFICIENT|Hochtöner|Tief|Mittel)", b)
        ov = re.search(r"(\d)\s*[×x]\s*(\d+)\s*(?:2-Wege|Koax|Compo|HIGH)", b)
        size = None; lab = None
        if ov: lab = f"{ov.group(1)}x{ov.group(2)}"
        elif mm:
            c = int(mm.group(1)); size = {165: 6.5, 130: 5.25, 100: 4, 200: 8, 80: 3.15, 120: 4.75, 70: 2.75, 25: 1, 20: 0.8, 19: 0.75, 24: 0.94}.get(c); lab = f"{c} mm"
        notes = ["Leistung printed as 'max/RMS' Watt (larger = max, smaller = RMS; matches the maker catalogue WRMS values)."]
        if typ == "component_set": notes.append("Set-level ratings per side as printed on the series page.")
        if cut and cut.group(2): notes.append(f"Einbaudurchmesser printed as {cut.group(1)}/{cut.group(2)} mm (oval).")
        sp = [{"role": "part", "model": f"AUDIO SYSTEM {m_.strip()}", "count": int(c_)} for c_, m_ in parts if not re.search(r"FWK|FW[A-Z]", m_)]
        r = rec(f"AUDIO SYSTEM {model}", typ, size, lab, num(imp.group(1).replace(",", ".")) if imp else None, "SVC",
                min(num(pw.group(1)), num(pw.group(2))) if pw else None, max(num(pw.group(1)), num(pw.group(2))) if pw else None, None, None, None, None, {}, "unknown",
                depth_mm=num(dep.group(1).replace(",", ".")) if dep else None, cutout_mm=num(cut.group(1).replace(",", ".")) if cut else None,
                set_parts=sp or None, passive={"as_printed_parts": [m_.strip() for c_, m_ in parts if re.search(r"FWK|FW[A-Z]", m_)]} if any(re.search(r"FWK|FW[A-Z]", m_) for c_, m_ in parts) else None,
                sources=[src(url, ["*"], doc="series page (German), Leistungsdaten / Maße")], notes=" ".join(notes))
        out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("audio-system", "AUDIO SYSTEM Germany", "Germany", "https://www.audio-system.de",
     "R4 2026-11-23: robots.txt empty Disallow (all allowed); 13 series pages read 3 s apart. Numbers only.", out)
