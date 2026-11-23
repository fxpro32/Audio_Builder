#!/usr/bin/env python3
"""R4_CAR_DRIVERS: ETON (Germany) car speakers from eton-audio.com product pages (German 'Technische Daten' block with T/S),
listed from 'lautsprecher/alle-produkte.html', read 2026-11-23 3 s apart. ETON prints 'Xmax mechanisch' (mechanical), so
xmax_mm stays empty and the printed value is kept in notes. Store prices are EUR (DE shop), not AU: not stored.
Raw: references/raw/car_drivers/eton/. Usage: python3 -I build_eton.py"""
import sys, re, os, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/eton/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}
LAB = [("z", r"^Nennimpedanz$"), ("mms_g", r"^Gesamt bewegte Masse"), ("re_ohm", r"^Gleichstromwiderstand$"), ("sd_cm2", r"^Effektive Abstrahlfl"),
       ("le_mh", r"^Induktivit"), ("fs_hz", r"^Resonanzfrequenz"), ("bl_tm", r"^Kraftfaktor"), ("qms", r"^Mechanische Guete"), ("qes", r"^Elektrische Guete"),
       ("vas_l", r"^Aequivalentvolumen"), ("qts", r"^Gesamt Guete"), ("spl", r"^Mittlerer Kennschalldruck"), ("power", r"^Belastbarkeit"),
       ("xmech", r"^Xmax mechanisch"), ("od", r"^Gesamtdurchmesser"), ("cut", r"^Einbaudurchmesser"), ("depth", r"^(Gesamttiefe|Einbautiefe)"),
       ("magnet", r"^Magnetmaterial"), ("fr", r"^Frequenzbereich|^Übertragungsbereich")]


def table(t):
    i = t.find("Technische Daten|")
    if i < 0: return {}, ""
    j = t.find("|Thiele-Small Parameter", i); j = j if j > 0 else t.find("|Produktvergleich", i)
    toks = [x.strip() for x in t[i + 17:j].split("|") if x.strip()]
    d = {}
    for k, x in enumerate(toks):
        for key, pat in LAB:
            if re.search(pat, x) and key not in d:
                rest = toks[k + 1:k + 5] if key in ("magnet", "power", "fr") else [r for r in toks[k + 1:k + 3]]
                if key == "magnet": d[key] = next((r for r in rest if r not in ("-",)), None); break
                if key == "power": d[key] = next((r for r in rest if re.search(r"\d", r)), None); break
                if key == "fr": d[key] = " ".join(rest[:3]); break
                v = next((r for r in rest if re.fullmatch(r"[\d.,]+", r)), None)
                d[key] = v; break
    return d, " | ".join(toks)


out = []
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    d, flat = table(t)
    raw = open(p, encoding="utf-8", errors="replace").read()
    ti = re.search(r"<title>\s*(.*?)\s*</title>", raw, re.S)
    title = html.unescape(ti.group(1)).strip() if ti else fn
    slug = fn[2:]
    name0 = re.split(r"\s+(?:High-End|Hochtöner|Tiefmitteltöner|Mitteltöner|Koax|2-Wege|3-Wege|Komponenten|Lautsprecher|Einbau|kaufen)", title)[0].strip()
    name = slug.replace(".html", "").upper().replace("-", " ").replace("PLUS", "+")
    tl = title.lower()
    if "hochtöner" in tl or re.search(r"-tw$|-28$|-25|cxs28", slug) and "koax" not in tl: typ = "tweeter"
    elif "koax" in tl: typ = "coaxial"
    elif re.search(r"2-wege|3-wege|komponenten|system", tl) or re.search(r"-x2$", slug): typ = "component_set"
    elif "mitteltöner" in tl and "tiefmittel" not in tl or re.search(r"-80$|-50$", slug): typ = "midrange"
    elif "tiefmittel" in tl or re.search(r"-16|-20|-13|-10|-165|-200|-100", slug): typ = "midbass"
    else: typ = None
    if typ is None: print("no type", slug, title); continue
    if not d: print("no table", slug); continue
    p_ = {k: num(d.get(k)) for k in ("mms_g", "re_ohm", "sd_cm2", "le_mh", "fs_hz", "bl_tm", "qms", "qes", "vas_l", "qts")}
    sens = num(d.get("spl"))
    if sens: p_["spl_db_1w1m"] = sens
    pw = d.get("power") or ""
    mp = re.search(r"(\d+)\s*/\s*(\d+)", pw)
    rms, peak = (num(mp.group(1)), num(mp.group(2))) if mp else (num(pw), None)
    m = re.search(r"(\d{2,3})", slug)
    code = int(m.group(1)) if m else None
    size = {165: 6.5, 16: 6.5, 200: 8, 20: 8, 13: 5.25, 130: 5.25, 10: 4, 100: 4, 80: 3.15, 28: 1.1, 25: 1, 50: 2}.get(code)
    lab = f"{code} {'mm' if code and (code > 30 or typ == 'tweeter') else 'cm'}" if code else None
    if typ == "tweeter": size = {28: 1.1, 25: 1}.get(code)
    notes = []
    if d.get("xmech"): notes.append(f"Maker prints 'Xmax mechanisch' +/- {d['xmech']} mm (mechanical limit, not linear Xmax); xmax_mm left empty.")
    if d.get("depth"): notes.append("mounting_depth_mm = maker 'Gesamttiefe' (overall depth).")
    if typ in ("component_set", "coaxial") and p_.get("fs_hz"): notes.append("T/S are those printed for the set (woofer).")
    r = rec(f"ETON {name}", typ, size, lab, num(d.get("z")), "SVC", rms, peak, sens, "1W/1m" if sens else None, None,
            (d.get("magnet") or "").lower() or None, p_, "per_coil", depth_mm=num(d.get("depth")), cutout_mm=num(d.get("cut")), frame_mm=num(d.get("od")),
            sources=[src(url, ["*"], doc="product page, Technische Daten (German)")], notes=" ".join(notes), extra={"title": title})
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("eton", "ETON (ETON Soundsysteme GmbH)", "Germany", "https://eton-audio.com",
     "R4 2026-11-23: robots.txt allows product pages (disallows checkout, customer, search, etc.); pages read 3 s apart. Numbers only.", out)
