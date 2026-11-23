#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Dynaudio (Denmark) car speakers (Esotar2, Esotan MkII, Esotec aftermarket drivers) from the maker's automotive
brochure PDF (dynaudio.com/hubfs/Car Audio/Downloads/dyn_automotive_brochure_int_dp.pdf, linked from the car-audio series pages,
read 2026-11-23). One 'Thiele Small Parameters' table per driver page; model = the page heading line that names the driver.
Excursion is printed peak to peak: xmax_mm = linear p-p / 2 (calculated, noted). Subwoofers on the same brochure are R2's.
Raw: references/raw/car_drivers/dynaudio/. Usage: python3 -I build_dynaudio.py"""
import sys, re
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
R = "/workspace/references/raw/car_drivers/dynaudio/"
URL = "https://dynaudio.com/hubfs/Car%20Audio/Downloads/dyn_automotive_brochure_int_dp.pdf"
t = open(R + "brochure.txt", encoding="utf-8", errors="replace").read()
pages = re.split(r"=== page (\d+) ===", t)
out = []
P = {"z": r"Nominal impedance Znom ([\d.]+)", "re_ohm": r"DC resistance Re ([\d.]+)", "le_mh": r"Voice coil inductance Le ([\d.]+)",
     "fs_hz": r"Resonance frequency fs ([\d.]+)", "qms": r"Mechanical Q factor Qms ([\d.]+)", "qes": r"Electrical Q factor Qes ([\d.]+)",
     "qts": r"Total Q factor Qts ([\d.]+)", "mms_g": r"Moving mass \(incl\. air load\) Mms ([\d.]+)", "sd_cm2": r"Effective piston area Sd ([\d.]+)",
     "vas_l": r"Equivalent volume Vas ([\d.]+)", "bl_tm": r"Force factor BL ([\d.]+)", "fr": r"Recommended frequency range ([\d.]+)\s*[–-]\s*([\d.]+)",
     "vcd": r"Voice coil diameter dc ([\d.]+)", "xlin": r"Linear excursion, peak to peak ([\d.]+)", "xmax": r"Max\. excursion, peak to peak ([\d.]+)",
     "pnom": r"Nominal long term IEC ([\d.]+)", "ptr": r"Transient \(10 ms\) ([\d.]+)", "dim": r"Overall dimension ø ?([\d.]+) x ([\d.]+)"}
for k in range(1, len(pages), 2):
    pg, body = pages[k], pages[k + 1]
    if "Thiele Small Parameters" not in body: continue
    L = [l.strip() for l in body.splitlines() if l.strip()]
    flat = " ".join(L)
    d = {key: re.search(p, flat) for key, p in P.items()}
    head = next((l for l in L if re.match(r"^(Soft Dome Tweeter|Soft Dome Midrange|Midrange|Woofer|Midwoofer|Mid/Woofer|Subwoofer|Tweeter|Mid-?range|Coaxial|Wide range|Full range) (Esot|[A-Z0-9])", l)), None)
    mn = re.search(r"(Esotar² ?\d+|Esotan ?\w* ?\d+|Esotec M[DTW] ?\d+(?: GT)?)", flat)
    name = mn.group(1) if mn else re.sub(r"^(Soft Dome Tweeter|Midrange|Woofer|Midwoofer|Mid/Woofer|Subwoofer|Tweeter)\s*", "", head or "").strip()
    hl = (head or "").lower()
    fs = num(d["fs_hz"].group(1)) if d["fs_hz"] else None
    if "subwoofer" in hl or "Esotar² 1200" in name: continue  # R2
    typ = "tweeter" if "tweeter" in hl or (fs and fs >= 900) else ("midrange" if "midrange" in hl or "mid-range" in hl or (fs and fs >= 300) else "midbass")
    g = lambda key: num(d[key].group(1)) if d[key] else None
    p = {k2: g(k2) for k2 in ("re_ohm", "le_mh", "fs_hz", "qms", "qes", "qts", "mms_g", "sd_cm2", "vas_l", "bl_tm")}
    xl = g("xlin")
    if xl: p["xmax_mm"] = round(xl / 2, 2)
    fr = [num(d["fr"].group(1)), num(d["fr"].group(2))] if d["fr"] else None
    notes = [f"Brochure page {pg}."]
    if xl: notes.append(f"Linear excursion printed peak to peak {xl} mm; xmax_mm = half (calculated).")
    if g("xmax"): notes.append(f"Max. excursion peak to peak {g('xmax')} mm.")
    notes.append("Power: nominal long-term IEC rating stored as rms_w, 10 ms transient as peak_w.")
    ms = re.search(r"(\d+(?:\.\d+)?) ?cm \(([\d.]+) ?inch\)", flat) or re.search(r"(\d+) ?mm \(([\d.]+) ?inch\)", flat)
    size = num(ms.group(2)) if ms else None
    lab = (ms.group(1) + (" cm" if "cm" in ms.group(0) else " mm")) if ms else None
    dim = d["dim"]
    r = rec(f"Dynaudio {name}", typ, size, lab, g("z"), "SVC", g("pnom"), g("ptr"), None, None, fr, None, p, "per_coil",
            frame_mm=num(dim.group(1)) if dim else None, sources=[src(URL, ["*"], doc="maker automotive brochure (PDF), Thiele Small Parameters table", page=str(pg))],
            notes=" ".join(notes), extra={"overall_height_mm": num(dim.group(2)) if dim else None, "voice_coil_mm": g("vcd")})
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out)); [print(r["model"], r["type"], r["params"]["fs_hz"], r["params"]["qts"]) for r in out]
save("dynaudio", "Dynaudio", "Denmark", "https://dynaudio.com/car-audio", "R4 2026-11-23: 3 series pages + 2 PDFs read 3 s apart. Numbers only.", out)
