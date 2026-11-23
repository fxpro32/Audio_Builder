"""R4B_DRIVERS_MORE (2026-11-23): generic spec reader for maker Shopify stores whose product descriptions carry a spec list
('Label: value', 'Label:|value' or 'LABEL|value' alternation). Used by build_orion.py, build_earthquake.py, build_power_acoustik.py,
build_american_bass.py. Only labelled values are taken (no numbers from marketing prose). Untrusted text, parsed only."""
import re, html, json, glob
from common import num

FIELDS = [  # (field, label regex) first match wins
    ("size", r"^(nominal |speaker )?(diameter|size)|^speaker size|^woofer size|^size$|^nominal diameter|^speaker diameter|^woofer$"),
    ("impedance", r"impedance|^voice coil configuration"),
    ("rms", r"rms|continuous|nominal power"),
    ("peak", r"peak|max(imum)?( power)?$|max power|power handling \(max|power handling max|^power handling$"),
    ("sens", r"sensitivity|^spl$|efficiency"),
    ("freq", r"frequency (response|range)|response range|^frequency$"),
    ("depth", r"mounting depth|top mount depth"),
    ("cutout", r"cut-?out|mounting (hole|diameter)|baffle"),
    ("outer", r"overall diameter|outer diameter"),
    ("fs", r"^fs\b|free air resonance|resonan(ce|t) frequency"),
    ("qts", r"^qts|total (q|factor)"), ("qes", r"^qes|electrical (q|factor)"), ("qms", r"^qms|mechanical (q|factor)"),
    ("vas", r"^vas|equivalent volume"), ("sd", r"^sd\b|cone area|effective (piston|cone) area"), ("xmax", r"^x-?max|excursion"),
    ("re", r"^re\b|dc resistance"), ("mms", r"^mms|moving mass|mechanical mass$"), ("bl", r"^bl\b|bl factor|force factor"),
    ("le", r"^le\b|inductance"),
]


def body(p):
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or ""))
    return re.sub(r"\s*\|[\s|]*", "|", b)


def kv(text):
    toks = [t.strip() for t in text.split("|") if t.strip()]
    pairs = []
    for i, t in enumerate(toks):
        m = re.match(r"^([A-Za-z][A-Za-z0-9 ()/.\-]{1,40}?)\s*:\s*(.+)$", t)
        if m: pairs.append((m.group(1), m.group(2))); continue
        if t.endswith(":") and i + 1 < len(toks): pairs.append((t[:-1], toks[i + 1])); continue
        if re.fullmatch(r"[A-Z][A-Z0-9 ()/.\-&]{1,40}", t) and i + 1 < len(toks) and re.search(r"\d", toks[i + 1]) and len(toks[i + 1]) < 40:
            pairs.append((t, toks[i + 1]))
    d = {}
    for lab, val in pairs:
        if not re.search(r"\d", val) or len(val) > 60: continue  # labelled numbers only, never prose
        l = lab.lower().strip()
        for f, rx in FIELDS:
            if re.search(rx, l):
                d.setdefault(f, val); break
    return d


def f_num(v, unit=None):
    if not v: return None
    s = v.replace(",", "")
    if unit:
        m = re.search(r"(-?\d+(?:\.\d+)?)\s*" + unit, s, re.I)
        return num(m.group(1)) if m else None
    return num(s)


def mm_of(v):
    if not v: return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*mm", v, re.I)
    if m: return num(m.group(1))
    m = re.search(r"(\d+(?:\.\d+)?)\s*(\"|”|″|in|inch)", v, re.I)
    return round(float(m.group(1)) * 25.4, 1) if m else None


def freq(v):
    if not v: return None
    s = v.replace(",", "").replace(" ", "")
    m = re.search(r"(\d+(?:\.\d+)?)(k?)(?:hz)?[-–~to]+(\d+(?:\.\d+)?)(k?)hz", s, re.I)
    if not m: return None
    lo = float(m.group(1)) * (1000 if m.group(2) else 1); hi = float(m.group(3)) * (1000 if m.group(4) else 1)
    if lo < 20 and hi >= 1000 and m.group(4) and not m.group(2): lo *= 1000  # '3-20kHz' printed: both in kHz
    return [num(str(lo)), num(str(hi))]


def watts(v, pair_title=False):
    if not v: return None
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*(w|watt)", v, re.I) or re.search(r"^(\d[\d,]*)", v.strip())
    return num(m.group(1).replace(",", "")) if m else None


def size_of(title, d):
    for s in (d.get("size") or "", title):
        ov = re.search(r"(\d(?:\.\d+)?)\s*(?:\"|”|″|in(?:ch)?)?\s*[xX×]\s*(\d{1,2})(?:\"|”|″|\s|$|in)", s)
        if ov: return None, f"{ov.group(1)}x{ov.group(2)}"
        m = re.search(r"(\d{1,2}(?:\.\d{1,2})?)\s*(?:\"|”|″|-?inch|\s?in\b|\(inches\))", s, re.I)
        if m and float(m.group(1)) <= 18: return num(m.group(1)), None
    return None, None


def load(dirpath):
    ps, seen = [], set()
    for f in sorted(glob.glob(dirpath + "/products_*.json"), key=lambda s: int(re.search(r"_(\d+)\.json", s).group(1))):
        for p in json.load(open(f))["products"]:
            if p["id"] not in seen: seen.add(p["id"]); ps.append(p)
    return ps


def make(ps, prefix, url_base, typ_fn, doc="maker product description (Shopify products.json)", overrides=None):
    """Records for products typ_fn(p) accepts (returns a TYPES value or None). Products without a labelled power, sensitivity or
    Fs go to the listed-only list. overrides: model -> dict(params=..., src=src-dict, notes=...) from spec sheets read by R4B."""
    from common import rec, src
    out, nospec = [], []
    for p in ps:
        typ = typ_fn(p)
        if not typ: continue
        sku = ((p.get("variants") or [{}])[0].get("sku") or "").strip()
        title = p["title"]
        model = f"{prefix} {sku}" if sku else f"{prefix} " + re.split(r"\s[|–-]\s", title)[0][:50]
        url = url_base + "/products/" + p["handle"]
        d = kv(body(p))
        params = {"fs_hz": f_num(d.get("fs"), "hz") or f_num(d.get("fs")), "qts": f_num(d.get("qts")), "qes": f_num(d.get("qes")), "qms": f_num(d.get("qms")),
                  "vas_l": f_num(d.get("vas"), "l") , "sd_cm2": f_num(d.get("sd"), "cm"), "xmax_mm": f_num(d.get("xmax"), "mm"), "re_ohm": f_num(d.get("re")),
                  "mms_g": f_num(d.get("mms"), "g"), "bl_tm": f_num(d.get("bl")), "le_mh": f_num(d.get("le"), "mh")}
        rms = watts(d.get("rms")); peak = watts(d.get("peak")); sens = f_num(d.get("sens"), "db") or f_num(d.get("sens"))
        if sens and not (70 <= sens <= 120): sens = None
        ov = (overrides or {}).get(model)
        if not (rms or peak or sens or params["fs_hz"] or ov):
            nospec.append({"model": model, "title": title, "type": typ, "url": url, "note": "No labelled specification list in the maker's product description."})
            continue
        size, lab = size_of(title, d)
        imp = f_num(d.get("impedance"), "(?:ohm|Ω)") or f_num(d.get("impedance"))
        notes = []
        if re.search(r"\(pair\)|pair\b", title, re.I) and (rms or peak): notes.append("Title says pair: power may be the pair rating as printed.")
        fr = freq(d.get("freq"))
        if fr and fr[0] > fr[1]: notes.append(f"Maker prints frequency response '{d.get('freq')}' (low end above high end, likely a unit typo): kept as printed, flagged.")
        sources = [src(url, ["*"], doc=doc)]
        if ov:
            for k, v in ov["params"].items():
                if params.get(k) is None: params[k] = v
            sources.insert(0, ov["src"]); notes.append(ov["notes"])
        r = rec(model, typ, size, lab, imp if imp and imp <= 16 else None, "SVC", rms, peak, sens, "unknown" if sens else None, fr, None,
                params, "unknown", depth_mm=mm_of(d.get("depth")), cutout_mm=mm_of(d.get("cutout")), frame_mm=mm_of(d.get("outer")),
                sources=sources, notes=" ".join(notes), extra={"title": title})
        out.append(r)
    return out, nospec


def typ_from_text(t):
    t = re.sub(r"(w/|with)[^|,]*tweeter", " ", t.lower())  # 'midrange w/ bullet tweeter' is the maker's midrange
    if re.search(r"in-?wall|in-?ceiling|ceiling|outdoor|all[- ]weather|pendant|landscape|stand|wall mount|center channel|\blcr\b|array|"
                 r"\bdj\b|intercom|commercial|home audio|rock\b|theia|bookshelf|water-resistant|powersports", t): return None
    if re.search(r"subwoofer|amplifier|\bamp\b|marine|bluetooth|handlebar|grille|cable|kit\b|enclosure|crossover|wire|led|light|radio|"
                 r"receiver|warranty|recone|dust cap|apparel|horn driver|powered|tower|pa speaker|monitor|soundbar|headphone|earbud|refurb|open-box|bundle", t): return None
    if re.search(r"tweeter", t): return "tweeter"
    if re.search(r"component", t): return "component_set"
    if re.search(r"coax|2-way|3-way|4-way|2 way|3 way|4 way|full[- ]range", t): return "coaxial"
    if re.search(r"mid-?bass|woofer", t): return "midbass"
    if re.search(r"mid-?range|midrange|loudspeaker|speaker", t): return "midrange"
    return None
