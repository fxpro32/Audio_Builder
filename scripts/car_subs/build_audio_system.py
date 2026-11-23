#!/usr/bin/env python3
"""R2_SUBS_ALL: Audio System (Germany) subwoofer drivers, all series, from the data-sheet page ('Technische Daten / Data sheet') of each
owner's manual PDF linked from the maker's subwoofer category pages (audio-system.de/produkte/subwoofer/<series>/, read 2026-11-23).
Power follows A3's convention: 'RMS 2x N Watt' / 'Music 2x M Watt' on dual-coil models are summed (both coils driven). Re as printed per coil.
Magazine test reprints, band-pass/box manuals and active subs are skipped. H33/H15/H12/H10 EVO come from hp_subs_raw.
Usage: python3 -I build_audio_system.py"""
import sys, re, glob, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save
R = "/workspace/references/raw/car_subs/audio-system/"
sys.path.insert(0, "/workspace/scripts/car_subs/image_reads"); import audio_system as ASI
IMG = {r[1]: r for r in ASI.ROWS}
urls = {}
for l in open(R + "list_pdf.txt"):
    if l.strip(): u, n = l.split(); urls.setdefault(n, u)


def n(s):
    if s is None: return None
    v = float(s.replace(",", "."))
    return int(v) if v.is_integer() else v


def ptxt(pdf):
    t = R + pdf[:-4] + ".txt"
    if not os.path.exists(t) or os.path.getsize(t) < 200:
        os.system(f"node /workspace/scripts/pdf_text.mjs '{R + pdf}' > '{t}' 2>/dev/null")
    return open(t, encoding="utf-8", errors="replace").read()


drivers, no_ts = [], []
for pdf in sorted(urls):
    if re.match(r"\d{3}-\d{3}_|\d{3}_AS|.*CarHifi|.*BP|M-400", pdf) or not os.path.exists(R + pdf): continue
    t = ptxt(pdf)
    if len(t) < 300 and pdf in IMG:  # R2B_SUBS_MORE: image-only manual, T/S read from the image (scripts/car_subs/image_reads/audio_system.py)
        r = IMG[pdf]
        model, fn, size, rmsc, musc, spl, re_, z, fs, xmax, qms, qes, qts, mms, vas, bl, sd, cut, dep = r[:19]
        coil = r[19] if len(r) > 19 else "DVC"; extra = r[20] if len(r) > 20 else ""
        k = {"SVC": 1, "DVC": 2, "QVC": 4}[coil]; mult = 1 if coil == "SVC" else 2
        qc = qms * qes / (qms + qes)
        print(f"AS {model}: Qts {qts} vs Qms*Qes/(Qms+Qes) {qc:.3f}")
        drivers.append(rec(model, size, coil, z, rmsc * mult, musc * mult,
                           dict(fs_hz=fs, re_ohm=re_, qms=qms, qes=qes, qts=qts, mms_g=mms, vas_l=vas, bl_tm=bl, sd_cm2=sd, xmax_mm=xmax, spl_db_2v83=spl),
                           "per_coil" if coil == "SVC" else "unknown", depth_mm=dep, cut_mm=cut, status="current",
                           sources=[src(urls[pdf], doc="owner's manual PDF (image only), English Specifications table: READ FROM IMAGE", page="2")],
                           notes=(f"T/S READ FROM IMAGE (image-only maker manual), double-checked: printed Qts {qts} vs Qms*Qes/(Qms+Qes) {qc:.3f}. "
                                  + ("" if coil == "SVC" else f"Power printed per coil ({rmsc} W RMS, {musc} W Musik); rms_w/peak_w = 2 x printed. Re printed per coil ('2x {re_}'); ts_basis not stated. ")
                                  + "Xmax printed '+/-' (one-way). 'Mounting diameter' (b) taken as cut-out. " + extra).strip()))
        continue
    if len(t) < 300:
        nm = re.sub(r"(?i)^(manual-|bda-)|(-manual)?(-\d{8})?$", "", pdf[:-4]).upper().replace("-", " ")
        no_ts.append({"model": nm, "rms_w": None, "url": urls[pdf], "note": "Owner's manual PDF has no text layer (image only); T/S not transcribed. Model name from the file name."})
        continue
    for page in re.split(r"=== page \d+ ===", t):
        if "Resonanzfrequenz Fs" not in page: continue
        m = re.search(r"([A-Z0-9][A-Za-z0-9 .\-]+?)\s+Technische Daten\s*/\s*Data [Ss]heet", page) or \
            re.search(r"([A-Z0-9][A-Za-z0-9 .\-]+?)\s*-?\s*ANLEITUNG\s*/\s*USER MANUAL", t)
        if not m: print("no model", pdf); continue
        model = re.sub(r"\s+", " ", m.group(1)).strip().rstrip("-").strip()
        L = page.replace("\n", " | ")
        g = lambda pat: (re.search(pat, L) or [None, None])[1]
        rms2 = re.search(r"RMS\s*(2x|4x)?\s*([\d.,]+)\s*Watt", L); mus = re.search(r"Musi[ck]\s*(2x|4x)?\s*([\d.,]+)\s*Watt", L)
        mult = lambda mm: (int(mm.group(1)[0]) if mm and mm.group(1) else 1)
        rms = n(rms2.group(2).replace(".", "")) * mult(rms2) if rms2 else None
        peak = n(mus.group(2).replace(".", "")) * mult(mus) if mus else None
        z = re.search(r"Impedanz Zn\s*(?:(\d)\s*x\s*)?([\d.,]+)", L)
        coils = int(z.group(1)) if z and z.group(1) else 1
        coil = {1: "SVC", 2: "DVC", 4: "QVC"}.get(coils)
        p = dict(spl_db_2v83=n(g(r"SPL \(2,83V, 1m\) dB\s*([\d.,]+)")), re_ohm=n(g(r"Gleichstromwiderstand Re\s*(?:\dx\s*)?([\d.,]+)")),
                 fs_hz=n(g(r"Resonanzfrequenz Fs\s*([\d.,]+)")), xmax_mm=n(g(r"Hub\s*\+/-\s*([\d.,]+)\s*mm")), qms=n(g(r"Qms\s*([\d.,]+)")),
                 qes=n(g(r"Qes\s*([\d.,]+)")), qts=n(g(r"Qts\s*([\d.,]+)")), mms_g=n(g(r"Mms\s*([\d.,]+)\s*Gramm")), vas_l=n(g(r"Vas\s*([\d.,]+)\s*Liter")),
                 bl_tm=n(g(r"Bl\s*([\d.,]+)\s*Tm")), sd_cm2=n(g(r"Sd\s*([\d.,]+)\s*cm")))
        size = None
        ms = re.search(r"(?:^|[A-Z ])(\d{2})\b", model.replace("EVO", ""))
        if ms: size = int(ms.group(1))
        if size and size > 21: size = {33: 33}.get(size)
        if size == 6: size = 6.5  # '06' models are 16.5 cm
        if re.match(r"H ?\d", model): continue  # H series: hp_subs_raw records (A3)
        boxes = []
        vbr, ft, vg = n(g(r"VBR\s*([\d.,]+)\s*Liter")), n(g(r"Ft\s*([\d.,]+)\s*Hz")), n(g(r"VG\s*([\d.,]+)\s*Liter"))
        if vbr: boxes.append(box("ported", None, ft, "maker data sheet " + pdf, litres=vbr, note="maker: all calculations include woofer and port"))
        if vg: boxes.append(box("sealed", None, None, "maker data sheet " + pdf, litres=vg, note="maker: volume includes woofer"))
        dep = n(g(r"Einbautiefe \( e \)\s*([\d.,]+)\s*mm")) or n(g(r"Einbautiefe gesamt \( d \)\s*([\d.,]+)\s*mm"))
        cut = n(g(r"Einbauöffnung \( b \)\s*([\d.,]+)\s*mm"))
        notes = []
        if rms2 and rms2.group(1): notes.append(f"Sheet power: RMS {rms2.group(1)} {rms2.group(2)} W" + (f", Music {mus.group(1) or ''} {mus.group(2)} W" if mus else "") + " (summed here, A3 convention).")
        if coil == "DVC": notes.append("Re printed per coil ('2x'); ts_basis not stated.")
        if p["xmax_mm"]: notes.append("Xmax printed '+/-' (one-way).")
        if not p["fs_hz"]: notes.append("Data sheet page has no Fs.")
        drivers.append(rec(model, size, coil, n(z.group(2)) if z else None, rms, peak, p, "per_coil" if coil == "SVC" else "unknown",
                           depth_mm=dep, cut_mm=cut, boxes=boxes, status="current", sources=[src(urls[pdf], doc="owner's manual PDF, data sheet page")], notes=" ".join(notes)))
seen, out = set(), []
for d in drivers:
    if d["model"] in seen: continue
    seen.add(d["model"]); out.append(d)
save("world", "audio-system", "Audio System", "Germany", "https://www.audio-system.de",
     "R2 2026-11-23: owner's manual PDFs linked from the maker's subwoofer category pages, read 3 s apart. EU maker: per-model facts only. Numbers only.",
     out, no_ts, coverage="all subwoofer series pages (Carbon, CO, H, HX, M, Radion, Subframe, SW, US, X-ion); data sheets with a 'Technische Daten / Data sheet' page")
