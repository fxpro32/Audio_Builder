#!/usr/bin/env python3
"""R2_SUBS_ALL: Musway (brand of Audio Design GmbH, Germany) subwoofer drivers. T/S from the data-sheet PDFs (musway.de/assets/<model>_ds.pdf;
label column then value column, paired in printed order), else the product page 'Technische Daten' block (Fs, Qts, Vas, Xmax, power,
depth, cut-out). Pages and sheets read 2026-11-23. Usage: python3 -I build_musway.py"""
import sys, re, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save
R = "/workspace/references/raw/car_subs/musway/"
B = "https://www.musway.de/"


def n(s):
    if s is None: return None
    m = re.search(r"\d+(?:[.,]\d+)?", s.replace("+/- ", ""))
    if not m: return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


drivers = []
for l in open(R + "list.txt"):
    if not l.strip(): continue
    url, name = l.split(); slug = name[:-5]
    page = html.unescape(re.sub(r"<[^>]+>", "|", open(R + name, encoding="utf-8", errors="replace").read()))
    page = re.sub(r"(\s*\|\s*)+", "|", re.sub(r"\s+", " ", page))
    ds = R + slug + "_ds.pdf"
    p, depth, cut, rms, peak, coil, ohm, boxes, srcs, notes = {}, None, None, None, None, None, None, [], [], []
    size = None
    if os.path.exists(ds):
        t = os.popen(f"node /workspace/scripts/pdf_text.mjs '{ds}' 2>/dev/null").read()
        L = [x.strip() for x in t.splitlines() if x.strip()]
        J = "|".join(L)
        if "Zn" in L and "Technical Specifications" in L:
            i = L.index("Zn"); j = i
            while j < len(L) and not re.match(r"^[\d+]", L[j]): j += 1
            labs = L[L.index("Technical Specifications") + 1:i]; vals = L[j:j + len(labs)]
            d = dict(zip(labs, vals))
            z = d.get("Impedance", "")
            mz = re.search(r"(\d)\s*x\s*([\d,]+)", z)
            coil, ohm = (("DVC" if mz.group(1) == "2" else "QVC"), n(mz.group(2))) if mz else ("SVC", n(z))
            p = dict(xmax_mm=n(d.get("Max. Linear Excursion")), sd_cm2=n(d.get("Cone Area")), mms_g=n(d.get("Moving Mass")), re_ohm=n((d.get("DC Resistance") or "").split("x")[-1]),
                     fs_hz=n(d.get("Resonance Frequency")), qms=n(d.get("Mechanical Q-Factor")), qes=n(d.get("Electrical Q-Factor")), qts=n(d.get("Total Q-Factor")),
                     vas_l=n(d.get("Equivalent Air Volume")), le_mh=n(d.get("VC Inductance")), bl_tm=n(d.get("Flux Density")), spl_db_1w1m=n(d.get("Efficiency 1W/1m")))
            if len(labs) != len(vals) or not str(d.get("Flux Density", "")).endswith("N/A"):
                notes.append("CHECK: label/value columns did not pair cleanly; values may be shifted.")
            else: notes.append("Sheet row 'Flux Density' carries the B/L value in N/A (Tm); entered as bl_tm.")
            d["Xmax (Peak)"] = d.get("Max. Mechanical Excursion")
            if d.get("Xmax (Peak)"): notes.append(f"Sheet also prints 'Xmax (Peak)' {d['Xmax (Peak)']} (mechanical); one-way linear Xmax entered.")
        dm = re.search(r"External Diameter:\|Mounting Diameter:\|Mounting Depth:\|[^|]*\|([\d,]+) mm\|([\d,]+) mm\|([\d,]+) mm", J)
        if dm: cut, depth = n(dm.group(2)), n(dm.group(3))
        pw = re.search(r"([\d.,]+) Watts RMS / ([\d.,]+) Watts Max", J)
        if pw: rms, peak = n(pw.group(1).replace(".", "")), n(pw.group(2).replace(".", ""))
        sz = re.search(r"Subwoofer (\d+(?:[.,]\d+)?) cm", J)
        if sz: size = {16.5: 6.5, 20: 8, 25: 10, 30: 12}.get(n(sz.group(1)))
        vb = re.search(r"Vented Volume:.*?\|(\d+) L\|[^|]*\|[^|]*\|[^|]*\|(\d+) Hz", J)
        if vb: boxes.append(box("ported", None, n(vb.group(2)), "maker data sheet", litres=n(vb.group(1)), note="'Deep Tuning' or first printed alignment"))
        srcs.append(src(B + "assets/" + slug + "_ds.pdf", doc="data sheet PDF"))
        notes.append("Data sheet prints labels and values in separate columns; paired in printed order.")
    blk = page[page.find("Technische Daten"):][:600]
    if not p.get("fs_hz"):
        p = dict(fs_hz=n((re.search(r"Fs ([\d,]+) Hz", blk) or [None, None])[1]), qts=n((re.search(r"Qts ([\d,]+)", blk) or [None, None])[1]),
                 vas_l=n((re.search(r"VAS ([\d,]+) L", blk) or [None, None])[1]), xmax_mm=n((re.search(r"Xmax \+/- ([\d,]+) mm", blk) or [None, None])[1]))
        notes.append("T/S from the product page block (Fs, Qts, Vas, Xmax only).")
    if rms is None:
        pw = re.search(r"([\d.]+) Watt RMS, ([\d.]+) Watt max", blk) or re.search(r"([\d.]+)/([\d.]+) Watt", page)
        if pw: a, b = n(pw.group(1)), n(pw.group(2)); rms, peak = min(a, b), max(a, b)
    if coil is None:
        mi = re.search(r"Impedanz (\d) \+ (\d) Ohm", blk) or re.search(r"(\d) \+ \d Ohm", page)
        if mi: coil, ohm = "DVC", int(mi.group(1))
        elif re.search(r"· (\d) Ohm", page): coil, ohm = "SVC", int(re.search(r"· (\d) Ohm", page).group(1))
    depth = depth or n((re.search(r"Einbautiefe ([\d,]+) mm", blk) or [None, None])[1])
    cut = cut or n((re.search(r"Einbauöffnung ([\d,]+) mm", blk) or [None, None])[1])
    if size is None:
        sz = re.search(r"([\d.]+) ?cm \(([\d.]+)“\)", page, re.I); size = n(sz.group(2)) if sz else None
    srcs.append(src(url, doc="product page, Technische Daten"))
    drivers.append(rec(slug.upper(), size, coil, ohm, rms, peak, p, "per_coil" if coil == "SVC" else "unknown", depth_mm=depth, cut_mm=cut,
                       boxes=boxes, status="current", sources=srcs, notes=" ".join(notes)))
save("world", "musway", "Musway (Audio Design GmbH)", "Germany", "https://www.musway.de",
     "R2 2026-11-23: subwoofer page, 9 product pages and 7 data sheets read 3 s apart. EU maker: per-model facts only. Numbers only.",
     drivers, [], coverage="all passive subwoofer drivers on the maker's Subwoofer page (MG, MWS, MW, MWF)")
