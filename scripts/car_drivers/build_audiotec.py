#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Audiotec Fischer (Germany) brands HELIX, BRAX, MATCH: car speakers (tweeters, midrange, midbass,
coaxials, component sets). Values from each product page's 'Technical data' table (audiotec-fischer.de/en/<brand>/speakers/...),
read 2026-11-23 3 s apart. Raw: references/raw/car_drivers/audiotec/ (p_*.html, list.txt). Vehicle-specific MATCH UP / HELIX
models are kept (drivers with published numbers) and flagged. Mounting adapters (flexmounts), tweeter pods and stand-alone
crossovers are left out. Set parts from the page's 'Scope of delivery' list. Usage: python3 -I build_audiotec.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/audiotec/"
url_of = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}

SECT = {"Midbass": "woofer", "Midrange": "mid", "Woofer": "woofer", "Midwoofer": "woofer", "Tweeter": "tweeter", "Features": "features",
        "Crossover": "crossover", "Compatibility": "end", "Recommended enclosure volumes": "boxes", "Recommended installation options": "boxes",
        "DSP settings": "dsp", "Recommended DSP / amplifier settings": "dsp"}
LAB = {"Power handling RMS / Max.": "power", "Power handling RMS / max.": "power", "Power RMS / max.": "power", "Power RMS / Max.": "power",
       "Impedance": "z", "DC resistance": "re", "Frequency response": "fr", "Resonance frequency": "fs", "Mechanical Q factor": "qms",
       "Electrical Q factor": "qes", "Total Q factor": "qts", "Compliance": "cms", "Equivalent air volume": "vas", "Force factor": "bl",
       "Sensitivity": "spl", "Efficiency 1 W / 1 m": "spl1w", "Cone area": "sd", "Moving mass": "mms", "Max. linear excursion": "xlin",
       "Max. mechanical excursion": "xmech", "Outer diameter": "od", "Outer diameter with universal mounting ring": "od_ring",
       "Installation diameter": "cut", "Installation depth": "depth", "Recommended highpass filter": "hp", "Recommended DSP / amplifier highpass filter": "hp",
       "Minimum crossover frequency": "minxo", "Slope": "slope", "Cone material": "cone", "Voice coil diameter": "vcd", "Dimensions crossover": "xodim",
       "Dimensions crossovers": "xodim", "Tweeter level adjustment range": "twlevel", "Mechanical resistance": "rms_mech", "Voice coil winding height": "vch",
       "Net volume": "netvol", "Port tuning frequency": "fb", "Installation place": "place"}
SYMS = {"P", "Z", "Re", "Fs", "Qms", "Qes", "Qts", "Cms", "Vas", "B*I", "B*l", "SPL", "Sd", "Mms", "Rms", "ø", "Ø", "Xmax", "Xlin", "Fb"}


def f(s):
    if s is None: return None
    s = str(s)
    m = re.search(r"\d[\d.,]*", s)
    if not m: return None
    x = m.group(0).rstrip(".,")
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", x): x = re.sub(r"[.,]", "", x)  # thousands separator (20.000 / 25,000)
    else: x = x.replace(",", ".")
    v = float(x)
    return int(v) if v.is_integer() else v


def parse(t):
    i = t.find("Technical data", t.find("Technical data") + 15)
    j = t.find("|Scope of delivery", i)
    toks = [x.strip() for x in t[i:j].split("|")[1:] if x.strip()]
    scope = []
    k2 = t.find("Scope of delivery|", j)
    if k2 > 0:
        for x in t[k2 + 18:].split("|"):
            if x in ("Description", "Accessories", "Similar products", "Technologies", "Press & awards"): break
            scope.append(x.strip())
    secs = {"main": {}}; cur = "main"; key = None; free = {}
    for x in toks:
        if x in SECT and not (cur == "features" and SECT[x] in ("woofer", "mid", "tweeter")):
            cur = SECT[x]; key = None; secs.setdefault(cur, {}); free.setdefault(cur, []); continue
        if cur in ("features", "crossover", "end", "boxes", "dsp") and x not in LAB:
            free.setdefault(cur, []).append(x); continue
        if x in LAB:
            key = LAB[x]; secs[cur].setdefault(key, []); continue
        if x in SYMS: continue
        if key: secs[cur][key].append(x)
    return secs, free, scope


def pick(vals, role):
    """vals: tokens for one label. role 'woofer' | 'tweeter' | 'mid'. Handles 'Tweeter: x', 'Midbass: x', 'TW: x', 'W: x', 'M: x'."""
    if not vals: return None
    pref = {"woofer": ("Midbass:", "Woofer:", "W:", "Midrange / Midbass / Woofer:", "Midwoofer:"), "tweeter": ("Tweeter:", "TW:"), "mid": ("Midrange:", "M:")}[role]
    tagged = [v for v in vals if re.match(r"^(Tweeter|Midbass|Woofer|Midrange|TW|W|M|Midwoofer)\s*:", v)]
    if not tagged: return vals[0] if role == "woofer" else None
    if role == "woofer" and not any(v.startswith(pr) for v in vals for pr in pref): pref = ("Midrange:", "M:")
    for v in vals:
        for p in pref:
            if v.startswith(p):
                r = v[len(p):].strip()
                return r if r and r != "-" else None
    return None


def ts_of(d):
    g = lambda k: f(d.get(k, [None])[0]) if d.get(k) else None
    p = {"re_ohm": g("re"), "fs_hz": g("fs"), "qms": g("qms"), "qes": g("qes"), "qts": g("qts"), "vas_l": g("vas"), "bl_tm": g("bl"),
         "sd_cm2": g("sd"), "mms_g": g("mms")}
    x = (d.get("xlin") or [None])[0]
    if x and re.match(r"^(\+/-|±)", x.strip()): p["xmax_mm"] = f(x)
    for s in d.get("spl", []):
        if "2.83" in s or "2,83" in s: p["spl_db_2v83"] = f(s)
        elif re.search(r"1 ?W", s) and re.search(r"\d+(\.\d)? ?dB", s): p["spl_db_1w1m"] = f(s)
    if d.get("spl1w"): p["spl_db_1w1m"] = f(d["spl1w"][0])
    if d.get("spl") and len(d["spl"]) >= 2 and d["spl"][0].strip() in ("1 W / 1 m", "1W / 1m"): p["spl_db_1w1m"] = f(d["spl"][1])
    return p


def power(vals):
    s = " ".join(vals or [])
    m = re.search(r"([\d.,]+)\s*/\s*([\d.,]+)\s*Watt", s)
    return (f(m.group(1)), f(m.group(2))) if m else (None, None)


def fr(vals):
    s = pick(vals, "woofer") if vals else None
    s = " ".join(vals or []) if s is None else s
    m = re.search(r"([\d.,]+)\s*(k?Hz)\s*[-–]\s*([\d.,]+)\s*(k?Hz)", s)
    if not m: return None
    a = f(m.group(1)) * (1000 if m.group(2) == "kHz" else 1); b = f(m.group(3)) * (1000 if m.group(4) == "kHz" else 1)
    return [a, b]


def mmv(s):
    if not s: return None
    m = re.search(r"([\d.,]+)\s*(?:x\s*([\d.,]+)\s*)?mm", s)
    if not m: return None
    return [f(m.group(1)), f(m.group(2))] if m.group(2) else f(m.group(1))


def hpf(vals):
    s = " ".join(vals or [])
    m = re.search(r"([\d.,]+)\s*(k?Hz)\s*/\s*(\d+)\s*dB", s)
    if not m: return {"note": s} if s else None
    return {"hp_hz": f(m.group(1)) * (1000 if m.group(2) == "kHz" else 1), "slope_db_oct": int(m.group(3)), "note": s}


def kind(slug):
    s = slug.lower()
    if re.search(r"-fx-", s) or s.endswith("atp25"): return None
    if re.search(r"ci\d-t\d|pr-t\d|ml28|gl1-mk2|up-t1", s): return "tweeter"
    if "ml8-mid" in s: return "midbass"
    if re.search(r"ci\d-m\d|ml80|gl2|up-s4mb", s): return "midrange"
    if re.search(r"-k\d|pr-k|pf-k", s): return "component_set"
    if re.search(r"-c\d|c42|pf-c|f-42c|s-42c|up-x4", s): return "coaxial"
    if re.search(r"-w\d|-s200|ml165|gl6|pr-w|up-w8|mw-8|-e50", s): return "midbass"
    return None


SIZE = {165: 6.5, 130: 5.25, 100: 4, 200: 8, 80: 3.15, 87: 3.5, 50: 2, 25: 1, 20: 0.79, 28: 1.1, 120: 4.75}
OVAL = {460: "4x6", 570: "5x7", 690: "6x9"}


def size_of(slug, typ):
    s = slug.lower()
    for k, v in (("ml8-mid", (8, "8 in")), ("gl6", (6.5, "165 mm class")), ("ml165", (6.5, "165 mm class")), ("ml80", (3.15, "80 mm class")),
                 ("ml28", (1.1, "28 mm class")), ("gl1", (1, "25 mm class (maker: GL1)")), ("gl2", (2, "50 mm class (maker: GL2)")),
                 ("mw-8", (8, "8 in (vehicle-specific)")), ("up-w8", (8, "8 in (vehicle-specific)")), ("c42", (4, "4 in (vehicle-specific)")),
                 ("x4", (4, "4 in (vehicle-specific)")), ("f-42c", (4, "4 in (vehicle-specific)")), ("s-42c", (4, "4 in (vehicle-specific)")),
                 ("up-s4", (4, "4 in (vehicle-specific)")), ("up-t1", (None, "tweeter (vehicle-specific)"))):
        if k in s: return v
    m = re.search(r"-(?:[a-z])(\d{2,3})", s)
    if m:
        c = int(m.group(1))
        if c in OVAL: return None, OVAL[c]
        if c in SIZE: return SIZE[c], f"{c} mm class"
    return None, None


out, skipped, names = [], [], {}
for fn in sorted(glob.glob(R + "p_*.html")):
    b = os.path.basename(fn); url = url_of.get(b)
    if not url: continue
    raw = open(fn, encoding="utf-8", errors="replace").read()
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", raw, re.S)
    name = html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else b
    slug = url.rstrip("/").split("/")[-1]
    typ = kind(slug)
    if typ is None: skipped.append((name, "not a driver (crossover, tweeter pod)")); continue
    t = text_of(fn)
    secs, free, scope = parse(t)
    main = secs["main"]
    is_multi = typ in ("component_set", "coaxial")
    role = "woofer" if typ in ("midbass", "component_set", "coaxial") else ("tweeter" if typ == "tweeter" else "mid")
    rms, peak = power(main.get("power"))
    z = f(pick(main.get("z"), "woofer") or (main.get("z") or [None])[0])
    sens = basis = None
    p_main = ts_of(main)
    if p_main.get("spl_db_2v83"): sens, basis = p_main["spl_db_2v83"], "2.83V/1m"
    elif p_main.get("spl_db_1w1m"): sens, basis = p_main["spl_db_1w1m"], "1W/1m"
    depth = mmv(pick(main.get("depth"), "woofer" if is_multi else "woofer")); cut = mmv(pick(main.get("cut"), "woofer")); od = mmv(pick(main.get("od"), "woofer"))
    notes = []
    if "/match/" in url and slug.startswith(("up-", "mw-")) or "BMW" in name or re.search(r"\bMB\b", name):
        notes.append("Vehicle-specific (plug and play) model by the maker's naming; fits only the named vehicles.")
    tsd = main
    for k in ("woofer", "mid"):
        if is_multi and secs.get(k, {}).get("fs"): tsd = secs[k]; notes.append("T/S are those of the woofer (maker table section 'Midbass'/'Woofer').")
    p = ts_of(tsd) if tsd is not main else p_main
    if tsd is not main:
        for k in ("spl_db_2v83", "spl_db_1w1m"):
            p[k] = p.get(k) or p_main.get(k)
    if tsd.get("xmech"): notes.append(f"Maker also prints max. mechanical excursion {tsd['xmech'][0]}; xmax_mm = max. linear excursion (one way).")
    xover = hpf(main.get("hp")) if typ in ("midbass", "midrange", "tweeter") else None
    if main.get("minxo"):
        mv = main["minxo"]; pairs = []
        for a, b in zip(mv[0::2], mv[1::2]):
            if re.search(r"dB", a): pairs.append({"slope_db_oct": f(a), "min_hp_hz": f(b)})
        pref12 = next((q for q in pairs if q["slope_db_oct"] == 12), pairs[0] if pairs else None)
        xover = {"hp_hz": pref12["min_hp_hz"] if pref12 else None, "slope_db_oct": pref12["slope_db_oct"] if pref12 else None,
                 "min_hp_by_slope": pairs, "note": "maker table 'Recommended crossover frequencies for the highpass' (minimum per slope); hp_hz/slope = the 12 dB/oct row when given"}
    pw_note = [x for x in (main.get("power") or []) if x.startswith("(")]
    if pw_note: notes.append("Power rating condition as printed: " + " ".join(pw_note))
    if free.get("dsp") and typ in ("midrange", "midbass", "tweeter"):
        xover = (xover or {}); xover["dsp_note"] = " | ".join(free["dsp"])[:500]
    passive = None
    xo_free = free.get("crossover") or []
    xo_lab = main.get("xodim")
    if xo_free or xo_lab or any("rossover" in s for s in scope):
        hp_ = re.search(r"(?:Tweeter|TW)\s*:?\s*[^|]*?(\d+)\s*dB", " ".join(xo_free)); lp_ = re.search(r"(?:Midbass|Woofer|W)\s*:?\s*[^|]*?(\d+)\s*dB", " ".join(xo_free))
        passive = {"tweeter_slope_db_oct": int(hp_.group(1)) if hp_ else None, "woofer_slope_db_oct": int(lp_.group(1)) if lp_ else None,
                   "tweeter_level_db": " ".join(main.get("twlevel", [])) or None, "note": " | ".join(xo_free)[:400] or None,
                   "dimensions": " ".join(xo_lab) if xo_lab else None}
        if typ in ("midbass", "midrange", "tweeter") and not xo_free: passive = None
    extra = {}
    magnet = None
    feat = " ".join(free.get("features", []) + main.get("cone", []))
    if re.search(r"neodym", feat, re.I): magnet = "neodymium" if typ != "coaxial" and typ != "component_set" else "neodymium (tweeter or drivers, per maker features)"
    cone = [c for c in main.get("cone", []) + (tsd.get("cone", []) if tsd is not main else []) if c.strip() not in ("-", "M:", "W: -")]
    if cone: extra["cone_material"] = "; ".join(cone)[:120]
    bx = []
    if free.get("boxes") or secs.get("boxes"):
        bxt = " | ".join(free.get("boxes", []))
        for m in re.finditer(r"([\d.,]+)\s*(?:liter|L)\b[^|]*?(?:System resonance:\s*([\d.,]+)\s*Hz)?", bxt):
            pass
        sb = secs.get("boxes", {})
        if sb.get("netvol"): bx.append({"type": "sealed", "volume_l": f(sb["netvol"][0]), "tuning_hz": None, "source": url, "note": "maker 'Net volume' under recommended installation"})
        if bxt: notes.append("Maker enclosure/DSP recommendations: " + bxt[:400])
    if free.get("dsp") and typ not in ("midrange", "midbass", "tweeter"): notes.append("Maker DSP settings: " + " | ".join(free["dsp"])[:300])
    if bx: extra["recommended_boxes"] = bx
    if is_multi:
        tw = {"impedance": pick(main.get("z"), "tweeter"), "outer_mm": mmv(pick(main.get("od"), "tweeter")), "cutout_mm": mmv(pick(main.get("cut"), "tweeter")),
              "depth_mm": mmv(pick(main.get("depth"), "tweeter"))}
        if secs.get("tweeter"):
            st = secs["tweeter"]; tw.update({"fs_hz": f((st.get("fs") or [None])[0]), "impedance": (st.get("z") or [tw["impedance"]])[0], "voice_coil": (st.get("vcd") or [None])[0]})
        if any(v for v in tw.values()): extra["tweeter_part"] = tw
    if scope: extra["scope_of_delivery"] = [s for s in scope if re.match(r"^\d+ x ", s)]
    sz, lab = size_of(slug, typ)
    r = rec(name, typ, sz, lab, z, "SVC", rms, peak, sens, basis, fr(main.get("fr")), magnet, p, "per_coil",
            depth_mm=depth, cutout_mm=cut, frame_mm=od, xover=xover, passive=passive,
            sources=[src(url, ["*"], doc="product page, Technical data table")], notes=" ".join(notes), extra=extra)
    if not any(v for k, v in r["params"].items()) and not r["rms_w"] and not r["cutout_mm"] and not r["freq_range_hz"]:
        skipped.append((name, "no numbers on page")); continue
    out.append(r); names[name.upper()] = r

# component sets: link parts named in 'Scope of delivery' (e.g. '2 x Tweeter Ci3 T20FM-AL MK2') to records of the same brand
def norm(s): return re.sub(r"[^A-Z0-9]", "", s.upper())
for s in out:
    if s["type"] != "component_set": continue
    brand = s["model"].split()[0]
    links = []
    for line in s.get("scope_of_delivery", []):
        m = re.match(r"\d+ x (Tweeter|Midbass|Midrange|Woofer|Midwoofer)\s+(.+)$", line)
        if not m or re.search(r"mounting|material|accessor|cable|grille|housing|spacer", m.group(2), re.I): continue
        pm = m.group(2).strip()
        hit = next((r for r in out if r is not s and norm(r["model"]).endswith(norm(pm)) or norm(r["model"]) == norm(brand + pm)), None)
        links.append({"role": m.group(1).lower(), "model": (brand + " " + pm) if not pm.upper().startswith(brand) else pm, "in_dataset": hit is not None})
        if hit: hit["part_of_sets"] = sorted(set((hit["part_of_sets"] or []) + [s["model"]]))
    if links: s["set_parts"] = links
for n, why in skipped: print("skipped:", n, "|", why)
from collections import Counter
print(Counter(r["type"] for r in out))
TERMS = ("R4 2026-11-23: product pages read 3 s apart, one at a time (R2 read the same site for subs). Site has Terms of service "
         "(not read in full). Numbers only, no text or images copied; 'Maker features' notes are short paraphrase-free quotes of material names only.")
save("audiotec-fischer", "Audiotec Fischer (HELIX, BRAX, MATCH)", "Germany", "https://www.audiotec-fischer.de", TERMS, out)
