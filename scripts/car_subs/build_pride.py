# R2_SUBS_ALL copy of A3's scripts/hp_world_build/pride.py with the 2000 W filter removed (writes data/car_subs_raw/world/pride.json). Original: Builds data/hp_subs_raw/world/pride.json from pride.audio English product pages (spec tables), read 2026-11-21.
import glob, os, re, sys
sys.path.insert(0, '/workspace/scripts/hp_world_build'); from hp_common import num, driver, loads
sys.path.insert(0, '/workspace/scripts/car_subs'); import common as C
D = "/workspace/references/raw/hp_subs/world/pride/pages/"
HEAD = {"General feature", "Parameters", "Physical Specifications", "Technical feature", "Physical feature", "Drawing"}
out, no_ts, low = [], [], []
for path in sorted(glob.glob(D + "*.txt")):
    slug = os.path.basename(path)[:-4]
    L = [l.strip() for l in open(path, encoding="utf-8")]
    disc = any("The product has been discontinued" in l for l in L)
    crumbs = next((l for l in L if l.startswith("Home ")), "")
    name = re.sub(r"^Home (discontinued Discontinued subwoofers |Subwoofers Pride M\.\d+ series \d+W )?", "", crumbs).strip()
    name = re.sub(r"^(Subwoofer )?(Pride )?", "Pride ", name)
    name = re.sub(r"\s*(Subwoofer)?\s*RMS.*$", "", name).replace("Pride Subwoofer ", "Pride ").replace("″", "").strip()
    cells = [l[:-2].strip() for l in L if l.endswith(" |")]
    t = {}; k = 0
    while k < len(cells):
        if cells[k] in HEAD: k += 1; continue
        if k + 1 < len(cells): t.setdefault(cells[k], cells[k+1])
        k += 2
    rms_line = next((l for l in L if re.match(r"RMS\s*[–-]\s*\d", l)), "")
    rms = num(t.get("Power Handling (RMS)") or t.get("RMS")) or num(rms_line)
    part = next((l.replace("Part number:", "").strip() for l in L if l.startswith("Part number:")), "")
    url = f"https://pride.audio/product/{slug}/"
    if slug == "m45-18":
        no_ts.append({"model": "Pride M.45 18", "rms_w": 4500, "url": url, "note": "DATA PROBLEM: the 18 inch page prints Fs, Qts, Vas, mounting depth and other values identical to the M.45 15 page, so they are treated as copied, not measured, and not used. Read 2026-11-21."})
        continue
    if not rms:
        low.append((slug, rms)); continue
    g = lambda *keys: next((t[x] for x in keys if x in t), None)
    imp = g("Impedance"); re_txt = g("DC Resistance (Re)", "Re Ω")
    src = imp or re_txt or ""
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)", src)
    coil, oh, nc = ("DVC", num(m.group(1)), 2) if m else (None, None, None)
    notes = [f"Breadcrumb name '{name}'" + (f", part number {part}" if part else "") + ".",
             "Status from the page: discontinued." if disc else "Listed as a current product on pride.audio (English US store)."]
    if imp: notes.append(f"Impedance printed '{imp}'.")
    if re_txt: notes.append(f"Re printed '{re_txt}'.")
    if "for Re" in (t.get("BL") or ""):
        notes.append(f"DATA PROBLEM: Bl is printed '{t.get('BL')}', i.e. the T/S on this page belong to a {re_txt} coil option, not to the stated impedance {imp}; use with care.")
    if "-" in rms_line or "5000-7500" in (t.get("RMS") or ""):
        notes.append(f"Power printed as a range ('{rms_line or t.get('RMS')}'); rms_w is the table value.")
    re_val = None
    if re_txt:
        mm = re.match(r"(\d+(?:[.,]\d+)?)\s*\+", re_txt); re_val = num(mm.group(1)) if mm else num(re_txt)
    if coil is None:
        dm = re.search(r"D(\d)(\d)?$", part.replace(",", ""))
        notes.append("Impedance per coil not printed on the page" + (f"; part-number suffix '{part[-3:]}' suggests a dual coil (product title on the page reads 'D1,6' style), meaning UNVERIFIED" if dm else "") + "; final loads left empty.")
        coil = "DVC" if dm else None
    fl = None
    if oh:
        fl = loads(coil, oh, nc)
        if not any(abs(x - y) < 0.01 for x in fl for y in (2, 1, 0.5)):
            notes.append(f"Possible final loads {fl} ohm (calculated, both coils driven); none is exactly 2, 1 or 0.5 ohm, included for PM decision.")
    sens1 = g("Sensitivity (1 W / 1 m) dB", "Sens (1W/1m)"); sens2 = g("Sensitivity (2,83 V / 1 m) dB", "Sens (2.83Vrms/1m)")
    md = g("Mounting Depth"); co = g("Mounting Hole Diameter"); disp = g("Driver Displacement")
    sz = [int(x) for x in re.findall(r"\d+", slug.replace("-d0-75", "").replace("ufo5", "ufo").replace("s5", "s").replace("tv-3", "tv").replace("m45", "m").replace("m35", "m").replace("m25", "m").replace("m20", "m").replace("d07", "")) if int(x) in (8, 10, 12, 15, 18, 21)]
    rec = driver(model=name or slug, size_in=sz[-1] if sz else None, coil=coil, ohms_per_coil=oh, coils=nc if coil == "DVC" else None,
        rms_w=rms, peak_w=None, fs_hz=num(g("Free Air Resonance (Fs) Hz", "Fs")), re_ohm=re_val, qms=num(g("Mechanical Q (Qms)")), qes=num(g("Electrical Q (Qes)")),
        qts=num(g("Total Speaker “Q” (Qts)", "Qts")), vas_l=num(g("Equivalent Compliance (Vas) L", "Vas")), sd_cm2=num(g("Effective Piston Area (Sd) cm²", "Sd")),
        xmax_mm=num(g("One-Way Linear Excursion (Xmax) (BL 50%) mm", "X Max (BL 50%)")), mms_g=num(g("Moving Mass (Mms) g")), bl_tm=num(g("BL Tm", "BL")),
        spl_db_1w1m=num(sens1), spl_db_2v83=num(sens2), mounting_depth_mm=num(md), cutout_mm=num(co), displacement_l=num(disp),
        final_loads_ohm=fl if fl is not None else [], status="discontinued" if disc else "current",
        sources=[{"fields": ["*"], "url": url, "doc": "Pride product page (English), specification table", "page": None, "read_date": "2026-11-21", "tier": 1}],
        notes=" ".join(notes) + " Xmax is the maker's one-way linear excursion at BL 50%.")
    if rec["final_loads_ohm"] is None: rec["final_loads_ohm"] = []
    out.append(rec)
for r in out:  # R2 fix: A3's size parse picks the '8' of 'd1.8' on some pages; use the size in the model name when they disagree
    ms = list(re.finditer(r"(?<![.\d])(6\.5|8|10|12|15|18|21)\b", re.sub(r"d\d\.\d+|M\.\d+|BB\.\d+|S5|UFO5|Tv\.3", "", r["model"])))
    m = ms[-1] if ms else None
    if m and r["size_in"] != float(m.group(1)):
        r["notes"] += f" R2: size_in corrected from {r['size_in']} to {m.group(1)} (model name; page size field mis-read)."; r["size_in"] = float(m.group(1)) if "." in m.group(1) else int(m.group(1))
C.save("world", "pride", "Pride Car Audio", "Russia (Kazan; also runs a US store, Hallandale Beach FL)", "https://pride.audio/",
     "R2 2026-11-23: re-used the English product pages A3 saved on 2026-11-21 (no new requests); same parser, power filter removed. pride.audio robots.txt disallows only WooCommerce upload/log paths. Numbers only.",
     out, no_ts, coverage="every Pride page A3 saved (all power levels)", extra={"pages_without_power": low})
