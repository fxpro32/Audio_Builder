#!/usr/bin/env python3
"""R4_CAR_DRIVERS: GLADEN (Germany) car speakers. Full T/S from the maker's German 'Produktdatenblatt' PDFs
(gladen-audio.de/download/manuals/<SERIES>/GLADEN_<MODEL>_Datasheet_DE.pdf, linked from gladen.com series pages), read 2026-11-23
3 s apart. Models without a datasheet are taken from their gladen.com product page where it carries numbers (parsed separately below).
German labels are mapped to the record fields; decimal commas converted. Raw: references/raw/car_drivers/gladen/.
Usage: python3 -I build_gladen.py"""
import sys, re, os, glob
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/gladen/"
pdf_url = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip() and l.split()[1].startswith("pdf/")}
page_url = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip() and l.split()[1].startswith("p_")}


def n(s):
    return num(s.replace(".", "").replace(",", ".")) if s and re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", s) else (num(s.replace(",", ".")) if s else None)


def g(t, pat):
    m = re.search(pat, t)
    return m.group(1) if m else None


P = {"re_ohm": r"(?:Gleichstromwiderstand|Gleichstrom-widerstand) R ?(?:dc|e) ([\d,]+)", "z": r"Nennimpedanz Z ?N ([\d,]+)",
     "fs": r"Resonanzfrequenz f ?s ([\d.,]+) ?(k?Hz)", "qms_": r"Mechanische Güte Q ?ms ([\d,]+)", "qes_": r"Elektrische Güte Q ?es ([\d,]+)",
     "qts_": r"Gesamtgüte Q ?ts ([\d,]+)", "mms": r"[Bb]ewegte Masse M ?ms ([\d,]+) ?g", "sd": r"Membranfläche S ?d ([\d,]+) ?cm",
     "bl": r"Antriebsfaktor B ?L ([\d,]+)", "vas": r"Äquivalentvolumen V ?as ([\d,]+) ?l", "le": r"Induktivität(?: [\d,]+ ?k?Hz)? L ?e ([\d,]+) ?mH",
     "spl1": r"Kennschalldruck 1 W / 1 m SPL ([\d,]+)", "spl2": r"Kennschalldruck 2,83 V / 1 m SPL ([\d,]+)", "rms": r"Belastbarkeit RMS ([\d.]+) ?W",
     "peak": r"Belastbarkeit max\. ([\d.]+) ?W", "xmax": r"Linearer Hub X ?max ± ?([\d,]+) ?mm", "od": r"(?<!Antrieb, )Außendurchmesser (?:A )?([\d,]+) ?mm",
     "cut": r"(?:Einbaudurchmesser|Ausschnitt(?: C)?|Ausschnitt Einbauring) ([\d,]+) ?mm", "depth": r"Einbautiefe (?:T )?([\d,]+) ?mm",
     "drive": r"(?:Antrieb|Magnet) (Neodym|Ferrit)", "cone": r"Membran ([A-Za-zÄÖÜäöü\- ]+?) (?:Sicke|Korb|Antrieb|F R E|Hochtöner|E i n)",
     "tw_od": r"Hochtöner Ø ([\d,]+) ?mm", "fr": r"Frequenzbereich ([\d.,]+) ?(k?Hz)? ?[–-] ?([\d.,]+) ?(k?Hz)"}
TITLE = [("KOAXIAL", "coaxial"), ("KOMPONENTEN", "component_set"), ("2-WEGE", "component_set"), ("TIEFMITTELTÖNER", "midbass"), ("TIEFTÖNER", "midbass"),
         ("BREITBAND", "fullrange"), ("MITTELTÖNER", "midrange"), ("HOCHTÖNER", "tweeter")]
out = []
for fn, url in sorted(pdf_url.items()):
    tp = R + fn[:-4] + ".txt"
    if not os.path.exists(tp): continue
    raw = open(tp, encoding="utf-8", errors="replace").read()
    if "PRODUKTDATENBLATT" not in raw.replace(" ", ""): print("not a datasheet", fn); continue
    t = re.sub(r"\s+", " ", raw)
    head = re.search(r"P R O D U K T D AT E N B L AT T .*? (?:· R E V \w )?([A-Z][A-Z0-9 .\-]+?) ((?:[A-ZÄÖÜ0-9\-]+ ?)+?) (\d+ mm|\d+ ?× ?\d+)", t)
    mdl = re.search(r"\b((?:ZETA|SIGMA|GAMMA|BETA|ENA|G-FIT|SOUNDUP|PRO|AEROSPACE|ALPHA|ONE)[ A-Z0-9.\-]*?\d[0-9A-Z.\-]*(?: [A-Z]{1,4}\b)?)\s+(KOAXIAL|KOMPONENTEN|2-WEGE|TIEFMITTELTÖNER|TIEFTÖNER|BREITBAND|MITTELTÖNER|HOCHTÖNER|[A-ZÄÖÜ\-]+)", t)
    model = "GLADEN " + os.path.basename(fn)[7:-17].replace("-", " ")  # from the maker's file name (GLADEN_<MODEL>_Datasheet_DE.pdf)
    word = mdl.group(2) if mdl else ""
    typ = next((v for k, v in TITLE if k in word), None) or next((v for k, v in TITLE if k in t[:600]), None)
    if typ is None: print("no type", fn, word); continue
    d = {k: g(t, p) for k, p in P.items()}
    fs = n(d["fs"]) if d["fs"] else None
    if fs and re.search(P["fs"], t).group(2) == "kHz": fs = fs * 1000
    p = {"re_ohm": n(d["re_ohm"]), "fs_hz": fs, "qms": n(d["qms_"]), "qes": n(d["qes_"]), "qts": n(d["qts_"]), "mms_g": n(d["mms"]), "sd_cm2": n(d["sd"]),
         "bl_tm": n(d["bl"]), "vas_l": n(d["vas"]), "le_mh": n(d["le"]), "spl_db_1w1m": n(d["spl1"]), "spl_db_2v83": n(d["spl2"]), "xmax_mm": n(d["xmax"])}
    sens, basis = (p["spl_db_2v83"], "2.83V/1m") if p["spl_db_2v83"] else ((p["spl_db_1w1m"], "1W/1m") if p["spl_db_1w1m"] else (None, None))
    xover = None
    rx = re.search(r"Empfohlene (?:aktive )?Trennung: ([^▪]+)", t)
    if rx:
        txt = rx.group(1).strip()
        hp = re.search(r"Hochpass (?:ab )?([\d.,]+) ?(k?Hz)", txt); sl = re.search(r"(\d+) ?dB/Okt", txt); lp = re.search(r"Tiefpass ([\d.,]+) ?(k?Hz)", txt)
        xover = {"hp_hz": n(hp.group(1)) * (1000 if hp.group(2) == "kHz" else 1) if hp else None,
                 "lp_hz": n(lp.group(1)) * (1000 if lp.group(2) == "kHz" else 1) if lp else None,
                 "slope_db_oct": int(sl.group(1)) if sl else None, "note": "maker recommendation (German, as printed): " + txt[:300]}
    passive = None
    if typ == "coaxial" and re.search(r"ohne externe Weiche|eingebaute Weiche", t): passive = {"note": "built-in crossover (maker: operated directly on the amplifier output, no external crossover)"}
    size_mm = re.search(r"(\d+) mm", (mdl.group(0) if mdl else "") + " " + t[t.find(word):t.find(word) + 40] if word else "")
    szm = int(size_mm.group(1)) if size_mm else None
    nom = {165: 6.5, 200: 8, 130: 5.25, 100: 4, 80: 3.15, 70: 2.75, 25: 1, 30: 1.2, 22: 0.87, 28: 1.1, 20: 0.8}
    size = nom.get(szm); lab = f"{szm} mm" if szm else None
    extra = {}
    if d["cone"]: extra["cone_material"] = d["cone"].strip()
    if d["tw_od"]: extra["tweeter_outer_mm"] = n(d["tw_od"])
    hoch = re.search(r"Hochtöner ([A-Za-zä\- ]+, \d+ mm)", t)
    if hoch and typ == "coaxial": extra["tweeter_as_printed"] = hoch.group(1)
    mag = {"Neodym": "neodymium", "Ferrit": "ferrite"}.get(d["drive"]) if d["drive"] else None
    rev = re.search(r"Rev \w · (\d\d\.\d\d\.\d{4})", t)
    notes = ["Values from the maker's German product data sheet (decimal commas converted)."]
    if "frei in Luft" in t: notes.append("Maker: T/S free air, small signal, run in.")
    if rev: notes.append(f"Sheet revision date {rev.group(1)}.")
    if "SOUNDUP" in model.upper(): notes.append("SoundUp = vehicle-specific Gladen line.")
    r = rec(model, typ, size, lab, n(d["z"]), "SVC", n(d["rms"]), n(d["peak"]), sens, basis, None, mag, p, "per_coil",
            depth_mm=n(d["depth"]), cutout_mm=n(d["cut"]), frame_mm=n(d["od"]), xover=xover, passive=passive,
            sources=[src(url, ["*"], doc="maker product data sheet (PDF, German)")], notes=" ".join(notes), extra=extra)
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
done = {re.sub(r"\W", "", r["model"].upper()) for r in out}
# product pages: models not covered by a datasheet, numbers where the page has them ('Technische Daten' block)
SECT = {"Tieftöner": "woofer", "Tiefmitteltöner": "woofer", "Mitteltöner": "mid", "Hochtöner": "tweeter", "Frequenzweiche": "xo", "Material:": "material",
        "Koaxial": "woofer", "Breitbandlautsprecher": "woofer"}
PAGE_TYPE = [(r"aerospace-(20|28|60-amt)$|g-fit-22$", "tweeter"), (r"aerospace-80$", "midrange"), (r"aerospace-165|g-fit-200(-mb0\d)?$|g-fit-mb03$", "midbass"),
             (r"g-fit-100$", "midrange"), (r"-x$|-c$|alpha-609-c", "coaxial"), (r"-2(-slim|-ac)?$|-g2$|-2-x$|appearance|one-t6", "component_set")]
def page_parse(t):
    i = t.find("Technische Daten")
    if i < 0: return None, {}
    j = min([x for x in (t.find("|Passende Produkte", i), t.find("|Downloads", i), t.find("|Ähnliche Artikel", i)) if x > 0] or [i + 3000])
    toks = [x.strip() for x in t[i:j].split("|") if x.strip()]
    title = toks[0].replace("Technische Daten", "").strip()
    secs = {"main": {}}; cur = "main"; key = None
    for x in toks[1:]:
        if x in SECT: cur = SECT[x]; secs.setdefault(cur, {}); key = None; continue
        if x.endswith(":"):
            key = x[:-1].strip()
            if cur == "material" and canon(key): cur = "main"
            secs[cur].setdefault(key, []); continue
        if key: secs[cur][key].append(x)
    return title, secs
CANON = [("fs", r"^(Fs\b|Resonanzfrequenz)"), ("re", r"^(Re\b|DC resistance|Gleichstrom)"), ("qms", r"^Qms"), ("qes", r"^Qes"), ("qts", r"^Qts"),
         ("vas", r"^(Vas\b|Equivalent air volume|Äquivalent)"), ("sd", r"^(Sq\b|Sd\b|Effective piston area|Effektive Membranfläche|Membranfläche)"),
         ("mms", r"^(Mms\b|Bewegte)"), ("bl", r"^(Force factor|BL\b|Antriebsfaktor)"), ("z", r"^(Impedanz|Nominal impedance|Nennimpedanz)"),
         ("power", r"^(Leistung|Belastbarkeit)"), ("spl", r"^(SPL|Kennschalldruck|Wirkungsgrad|Schalldruck|Efficiency)"), ("fr", r"^Frequenzgang"),
         ("xo", r"^Trennfrequenz"), ("dia", r"^Durchmesser"), ("lvl", r"^Pegelanpassung")]
def canon(k):
    return next((c for c, pat in CANON if re.search(pat, k, re.I)), None)
def pv(sec, *keys):
    for k in sec:
        if canon(k) in keys: return " ".join(sec[k])
    return None
for fn, url in sorted(page_url.items()):
    pth = R + fn
    if not os.path.exists(pth): continue
    slug = fn[2:-5]
    if "adapter" in slug: continue
    t = text_of(pth)
    title, secs = page_parse(t)
    if not title: continue
    rawp = open(pth, encoding="utf-8", errors="replace").read()
    mt = re.search(r"<title>\s*([^<:|]+?)\s*:\s*([^<|]*)", rawp)
    if mt: title = mt.group(1).strip()
    key = re.sub(r"\W", "", ("GLADEN " + re.sub(r"(?i)gladen", "", title)).upper())
    if key in done: continue
    tword = mt.group(2) if mt else ""
    typ = next((v for k_, v in (("Zweiwege", "component_set"), ("Dreiwege", "component_set"), ("Koax", "coaxial"), ("Tiefmittel", "midbass"),
                                  ("Tieftöner", "midbass"), ("Breitband", "fullrange"), ("Mitteltön", "midrange"), ("Hochtön", "tweeter")) if k_ in tword), None)
    typ = typ or next((v for pat, v in PAGE_TYPE if re.search(pat, slug)), None)
    if typ is None: print("page no type", slug); continue
    w = secs.get("woofer") or secs.get("mid") or secs["main"]
    tw = secs.get("tweeter", {})
    tsd = tw if typ == "tweeter" and tw else w
    def fv(sec, k):
        v = pv(sec, k)
        m_ = re.search(r"\d[\d.,]*", v or "")
        return n(m_.group(0).rstrip(".,")) if m_ else None
    p = {"fs_hz": fv(tsd, "fs"), "re_ohm": fv(tsd, "re"), "qms": fv(tsd, "qms"), "qes": fv(tsd, "qes"), "qts": fv(tsd, "qts"), "vas_l": fv(tsd, "vas"),
         "sd_cm2": fv(tsd, "sd"), "mms_g": fv(tsd, "mms"), "bl_tm": fv(tsd, "bl")}
    spl = pv(tsd, "spl"); spl_key = next((k for k in tsd if canon(k) == "spl"), "")
    sens = n((re.search(r"[\d,]+(?= ?dB)", spl or "") or [None])[0]) if spl and re.search(r"[\d,]+(?= ?dB)", spl) else None
    basis = "2.83V/1m" if sens and "2,83" in spl_key + spl else ("unknown" if sens else None)
    if sens and basis == "2.83V/1m": p["spl_db_2v83"] = sens
    lei = pv(w, "power") or pv(secs["main"], "power") or ""
    nums = [int(x) for x in re.findall(r"\d+", lei.split("(")[0])]
    rms = peak = None
    if len(nums) >= 2: peak, rms = max(nums[:2]), min(nums[:2])
    elif nums: rms = nums[0]
    z = fv(w, "z") or fv(secs["main"], "z")
    dia = pv(w, "dia") or ""
    dm = re.search(r"(\d+) ?mm", dia)
    szm = int(dm.group(1)) if dm else None
    nom = {165: 6.5, 200: 8, 130: 5.25, 100: 4, 80: 3.15, 70: 2.75, 25: 1, 28: 1.1, 20: 0.8, 22: 0.87, 60: 2.36}
    frt = pv(tsd, "fr") or pv(secs["main"], "fr")
    frq = None
    if frt:
        mf = re.search(r"([\d.,]+)\s*(k?Hz)?\s*-\s*([\d.,]+)\s*(k?Hz)", frt)
        if mf: frq = [n(mf.group(1)) * (1000 if (mf.group(2) or mf.group(4)) == "kHz" else 1), n(mf.group(3)) * (1000 if mf.group(4) == "kHz" else 1)]
    xot = pv(secs["main"], "xo")
    if typ == "tweeter" and xot:
        mx = re.search(r"([\d.]+)\s*Hz\s*(\d+)\s*dB", xot)
        xover_t = {"hp_hz": n(mx.group(1)) if mx else None, "slope_db_oct": int(mx.group(2)) if mx else None, "note": "maker 'Trennfrequenz' as printed: " + xot}
    else: xover_t = None
    passive = None
    xo = secs.get("xo", {})
    if xo:
        tf = pv(xo, "xo"); pl = pv(xo, "lvl")
        passive = {"crossover_hz": n((re.search(r"[\d.]+", tf or "") or [None])[0]) if tf else None, "tweeter_level_as_printed": pl,
                   "as_printed": {k: re.split(r"\s*Matching products\b", " ".join(v))[0] for k, v in xo.items()}}  # P1_PUBLIC_DATA: drop stray page text after the value
    notes = ["Values from the gladen.com product page 'Technische Daten' block (decimal commas converted); no data sheet PDF found for this model."]
    if lei: notes.append(f"Power printed as '{lei}' (larger value taken as max, smaller as RMS).")
    if typ in ("component_set", "coaxial") and secs.get("woofer"): notes.append("T/S are those of the woofer section.")
    if re.search(r"mb0|appearance|one-t6|transit", slug): notes.append("Vehicle-specific model (maker naming).")
    extra = {}
    if tw and typ in ("component_set", "coaxial"): extra["tweeter_part_as_printed"] = {k: " ".join(v) for k, v in tw.items()}
    mat = secs.get("material")
    if mat: extra["materials_as_printed"] = {k: " ".join(v) for k, v in mat.items()}
    model = "GLADEN " + re.sub(r"(?i)^gladen\s*", "", title).strip()
    if not any(v for v in p.values()) and not rms and not sens: print("page without numbers", slug); continue
    if szm is None:
        ms_ = re.search(r"(?:aerospace|g-fit)-(\d+)", slug); szm = int(ms_.group(1)) if ms_ else None
    r = rec(model, typ, nom.get(szm), f"{szm} mm" if szm else None, z, "SVC", rms, peak, sens, basis, frq, None, p, "unknown",
            xover=xover_t, passive=passive, sources=[src(url, ["*"], doc="product page, Technische Daten")], notes=" ".join(notes), extra=extra)
    out.append(r); done.add(key)
print(Counter(r["type"] for r in out))
TERMS = ("R4 2026-11-23: gladen.com series pages and gladen-audio.de data sheets read 3 s apart (robots.txt: Joomla default, "
         "gladen-audio.de has none). Numbers only.")
save("gladen", "GLADEN (Gladen Europe GmbH)", "Germany", "https://www.gladen.com", TERMS, out)
