#!/usr/bin/env python3
"""R3_ELECTRONICS shared helpers: load Shopify dumps, clean text, write one brand file per category.
Schema (documented in references/research_i_car_electronics.md, section "Schema"):
 file = {schema:"parts_raw/1", category, brand, maker_site, read_date, agent, method, terms_note, units, records:[...], not_recorded:[...], notes}
 record = {id, model, title, status, <category fields>, prices_aud:[{supplier,price_aud,url,read_date,note}], prices_other:[...],
           sources:[{fields:[...], url, read_date, tier:"maker"|"maker-store"|"retailer", doc}], notes}
Numbers only, no prose copied from makers. Missing = null. Never guessed."""
import json, glob, re, html, os, datetime
TODAY = "2026-11-23"
RAW = "/workspace/references/raw/parts"
OUT = "/workspace/data/parts_raw"

def shopify_products(site):
    return [p for f in sorted(glob.glob(f"{RAW}/shopify/{site}/products_*.json"), key=lambda s: int(re.findall(r"_(\d+)\.json", s)[0]))
            for p in json.load(open(f))["products"]]

def clean(htm):
    t = html.unescape(re.sub(r"<[^>]+>", "|", htm or "")).replace("\u2126", "\u03a9")  # OHM SIGN -> Greek capital omega
    t = re.sub(r"[ \s]+", " ", t); t = re.sub(r"(\s*\|\s*)+", "|", t)
    return t.strip("|")

def tags(p):
    t = p.get("tags") or []
    return t if isinstance(t, list) else [x.strip() for x in t.split(",")]

def num(s):
    s = s.replace(",", "")
    return float(s) if "." in s else int(s)

def write(category, brand_slug, meta, records, not_recorded=None):
    os.makedirs(f"{OUT}/{category}", exist_ok=True)
    not_recorded = list(not_recorded or [])
    finalize(category, records, not_recorded)
    d = {"schema": "parts_raw/1", "category": category, **meta, "read_date": meta.get("read_date", TODAY), "agent": "R3_ELECTRONICS; cleaned by R3B_PARTS_CLEAN",
         "record_count": len(records), "records": records, "not_recorded": not_recorded or []}
    p = f"{OUT}/{category}/{brand_slug}.json"
    json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)
    print(f"wrote {p}: {len(records)} records, {len(not_recorded or [])} not recorded")
    # P1_PUBLIC_DATA: retailer-listing files go to data/private/parts_raw; maker files keep a full copy there and lose prices here
    import sys as _s
    _pd = str(__import__("pathlib").Path(__file__).resolve().parent.parent / "public_data")
    if _pd not in _s.path: _s.path.insert(0, _pd)
    import split as _split
    _split.set_data(os.path.dirname(OUT)); print("  public/private split:", _split.split_parts_file(p))
    return p

# ---- amplifier text helpers ----
_OHM = r"(\d(?:\.\d+)?|\.5)\s*-?\s*(?:ohms?|Ohms?|OHMS?|Ω|Ohm)\b"
_W = r"(\d{1,2},\d{3}|\d{2,5})"
def _n(x): return num(x)
def ratings(text):
    """RMS ratings from short spec segments ('|'-separated). Returns [{w_per_ch, channels, ohm, bridged, group}]"""
    text = _prep(text)
    out, seen, cur_long, cur_v = [], set(), [False], [None]
    def add(w, ch, ohm, br, grp=None):
        k = (w, ch, ohm, br, grp, cur_v[0])
        if k in seen and not cur_long[0]:
            for x in out:
                if (x["w_per_ch"], x["channels"], x["ohm"], x["bridged"], x["group"], x.get("voltage_v")) == k: x["_long"] = False
        if k not in seen and 5 <= w <= 50000:
            seen.add(k); out.append({"w_per_ch": w, "channels": ch, "ohm": ohm, "bridged": br, "group": grp, "_long": cur_long[0]})
            if cur_v[0]: out[-1]["voltage_v"] = cur_v[0]
    for seg in text.split("|"):
        if not re.search(_OHM, seg) or seg.startswith("SKIP "): continue
        if re.search(r"(?i)\b10\s*%\s*THD|THD[^|]{0,6}\b10\s*%", seg): continue  # 10 % THD lines are not the rated power
        cur_long[0] = len(seg) > 140
        vs = set(re.findall(r"\b(1[0-5](?:\.\d)?)\s*V(?:DC)?\b", seg)); cur_v[0] = float(vs.pop()) if len(vs) == 1 else None
        low = seg.lower()
        if re.search(r"\b(max|peak)\b", low) and "rms" not in low: continue
        if re.search(r"\bd\.?p\.?p\b|dynamic peak|dynamic power", low) and "rms" not in low: continue
        if re.search(r"\d\s*v\s*dc|vdc", low): continue  # dyno test lines at a stated voltage, not ratings
        br = "bridg" in low or bool(re.match(r"\s*mono\b", low) and re.search(r"[xX×]\s*[2-8]\b|\b[2-8]\s*[xX×]", seg))
        if re.search(r"link|strap", low): br = "strapped"
        m = re.match(r"\s*(\d(?:\.\d+)?)\s*Ohms?\s*(Mono|Stereo|Bridged|Strapped)?[^:]{0,20}:\s*" + _W + r"\s*W", seg, re.I)
        if m:
            add(_n(m.group(3)), 1 if (m.group(2) or "").lower() == "mono" else None, float(m.group(1)), "strapped" if re.search("strap|link", low) else br); continue
        ohms = [float(o) for o in re.findall(_OHM, seg)]
        if len(seg) <= 140 and len(set(ohms)) == 1:
            ohm = ohms[0]; got = False
            for m in re.finditer(_W + r"\s*(?:W|Watts?|w)?\s*(?:[Rr][Mm][Ss]\s*)?[xX×]\s*(\d)\b\s*(\((?:Ch|ch)[^)]*\))?", seg):
                add(_n(m.group(1)), int(m.group(2)), ohm, br if br == "strapped" else (_brw(seg, m) or (len(re.findall(r"\d+\s*[xX×]\s*\d", seg)) == 1 and "bridg" in low and not re.search(r"\d{3,}\s*w\s*bridg", low))), (m.group(3) or "").strip("() ") or None); got = True
            if not got:
                for m in re.finditer(r"\b(\d)\s*[xX×]\s*" + _W + r"\s*(?:W|Watts?|w)", seg):
                    add(_n(m.group(2)), int(m.group(1)), ohm, br if br == "strapped" else (_brw(seg, m) or (len(re.findall(r"\d+\s*[xX×]\s*\d", seg)) == 1 and "bridg" in low and not re.search(r"\d{3,}\s*w\s*bridg", low)))); got = True
            if not got:
                m = re.match(r"\s*(?:RMS\s*(?:Power)?\s*:?\s*)?" + _W + r"\s*(?:W|Watts?)?\s*(?:RMS\s*)?(?:@|at)\s*" + _OHM, seg)
                if m: add(_n(m.group(1)), None, float(m.group(2)), br); got = bool(m)
        if not (len(seg) <= 140 and len(set(ohms)) == 1 and got):
            for m in re.finditer(r"(?i)\bRMS\b[^:|]{0,40}?(?:@|at)\s*" + _OHM + r"[^:|]{0,40}:\s*" + _W + r"\s*W", seg):
                add(_n(m.group(2)), None, float(m.group(1)), _brw(seg, m))
            for m in re.finditer(_W + r"\s*(?:W|Watts?)\s*RMS\s*(?:x\s*(\d)\s*)?(?:@|at)\s*" + _OHM, seg, re.I):
                add(_n(m.group(1)), int(m.group(2)) if m.group(2) else None, float(m.group(3)), _brw(seg, m))
            for m in re.finditer(r"\b(\d)\s*[xX×]\s*" + _W + r"\s*(?:W|Watts?)\s*(?:RMS\s*)?(?:[Bb]ridged\s*)?(?:@|at)\s*" + _OHM, seg, re.I):
                add(_n(m.group(2)), int(m.group(1)), float(m.group(3)), _brw(seg, m))
    if any(not x["_long"] for x in out): out = [x for x in out if not x["_long"]]
    for x in out: x.pop("_long")
    # tidy: drop channel-less duplicates of a rating that also has a channel count; prefer the bridged flag when both exist
    keep = []
    for x in out:
        if x["channels"] is None and any(y is not x and y["channels"] and y["w_per_ch"] == x["w_per_ch"] and y["ohm"] == x["ohm"] for y in out): continue
        if x["bridged"] is False and any(y["bridged"] and y["w_per_ch"] == x["w_per_ch"] and y["ohm"] == x["ohm"] and y["channels"] == x["channels"] for y in out): continue
        keep.append(x)
    # PM 2026-11-23: 'Mono' lines (Brazil style) are per-channel ratings; only the lines with fewer channels than the most are bridged pairs
    mono = [x for x in keep if x["bridged"] == "mono"]
    if mono:
        top = max((x["channels"] or 0) for x in mono)
        for x in mono: x["bridged"] = bool(x["channels"]) and x["channels"] < top
    return keep

def _prep(text):
    """R3B: make spec text easier for ratings(): (1) a short label cell with no digits ('Bridged Power:') is prefixed to the next value cell;
    (2) a value cell with several loads ('100W x 4 @ 4ohm, 150W x 4 @ 2ohm') is split at ', ' / ';' into one cell per load (pieces without a load
    are glued back to the previous piece); (3) a multi-load piece ('300W x 1 (2ohm/4ohm, 14.4V)') is repeated once per load;
    (4) a 'label with the load' cell ('4OHM RMS POWER', 'RMS Power @ 14.4V, 4ohm') gives its load to the next value cell;
    (5) a section header for 10 % THD, burst or a supply voltage under 13.8 V marks its lines SKIP; (6) 'N Ch:' mode lines get a '(Ch mode N)' group."""
    out, label, pend, section = [], "", None, ""
    for cell in text.split("|"):
        st = re.sub(r"^[\s•·*\-–]+", "", cell).strip()
        if not st: continue
        if st.endswith(":") and len(st) <= 90 and re.search(r"(?i)power|output|rms", st):
            section = "SKIP " if re.search(r"(?i)10\s*%|thd\s*10|burst|\b1[0-3](?:\.\d)?\s*v\b", st) else ""
        if pend is not None:
            ohm, lab = pend; pend = None
            mv = re.match(r"^(?:(\d)\s*[xX×]\s*)?([\d,]{2,6})\s*(?:W|Watts?)(?:\s*RMS)?(?:\s*[xX×]\s*(\d))?\.?$", st)
            skip = "SKIP " if re.search(r"(?i)\b(?:1[0-3](?:\.\d)?)\s*v\b|10\s*%", lab) else ""
            if mv:
                ch = mv.group(1) or mv.group(3)
                out.append(skip + ("Bridged " if re.search(r"(?i)bridg", lab) else "") + f"{mv.group(2)} W RMS" + (f" x {ch}" if ch else "") + f" @ {ohm} ohm"); continue
            if re.search(r"\d\s*(?:W|Watts?)\b", st) and not re.search(_OHM, st) and len(st) <= 80:
                for q in re.split(r"\s+/\s+|;\s*", st): out.append(skip + ("Bridged " if re.search(r"(?i)bridg", lab) and not re.search(r"(?i)bridg", q) else "") + q + f" @ {ohm} ohm")
                continue
        ml = re.search(_OHM, st)
        if ml and len(st) <= 45 and not re.search(r"\d\s*(?:W|Watts?)\b", st) and re.search(r"(?i)power|rms|output|watt", st) and not re.search(r"(?i)\b(max|peak|dynamic)\b", st) and len(set(re.findall(_OHM, st))) == 1:
            pend = (ml.group(1), st); out.append(st); continue
        if not re.search(r"\d", st) and len(st) <= 60: label = st; out.append(st); continue
        pre = section
        if label and re.search(r"(?i)bridg", label) and not re.search(r"(?i)bridg", st): pre += "Bridged "
        elif label and re.search(r"(?i)\b(max|peak|dynamic)\b|d\.?p\.?p", label) and not re.search(r"(?i)rms|continuous", label + st): pre += "Max "
        label = ""
        mode = re.match(r"(\d)\s*Ch(?:annels?)?\s*:\s*", st)
        if mode and len(st) <= 120:
            M = mode.group(1); st = re.sub(r"([xX×]\s*\d)\b", r"\1 (Ch mode " + M + ")", st[mode.end():])
        pieces = []
        for q in re.split(r"[;,]\s+|\s+or\s+", st):
            if pieces and not re.search(_OHM, q) and not re.search(r"(?i)\bbridg", q): pieces[-1] += ", " + q
            else: pieces.append(q)
        if len(pieces) > 1 and sum(1 for q in pieces if re.search(_OHM, q)) < 2: pieces = [st]
        pieces = [z for q in pieces for z in (re.split(r"\s+\+\s+", q) if all(re.search(_OHM, z) for z in re.split(r"\s+\+\s+", q)) else [q])]
        for q in pieces:
            if re.search(r"(?i)\bburst\b", q): continue
            mm = re.search(r"(\d(?:\.\d+)?)\s*(?:Ω|ohms?)?\s*/\s*(\d(?:\.\d+)?)\s*(?:Ω|ohms?)\b", q, re.I)
            if mm and mm.group(1) != mm.group(2):
                for o in (mm.group(1), mm.group(2)): out.append(pre + q[:mm.start()] + o + " ohm" + q[mm.end():])
            else: out.append(pre + q)
    return "|".join(out)

def _brw(seg, m):
    """bridged only if 'bridg' is right before the match or after it before the next number, or the cell starts with 'Bridged' (label)"""
    if re.match(r"(?i)\s*bridg", seg): return True
    if re.match(r"(?i)\s*mono\b", seg) and re.search(r"[xX×]\s*[2-8]\b|\b[2-8]\s*[xX×]", m.group(0)): return "mono"  # resolved in ratings(): PM 2026-11-23, 'MONO @ 4 Ohms: 4 x 300 W' (Audiopipe/Brazil style) = 4 mono channels, only the lines with fewer channels are bridged
    before = re.split(r"[,;/]|\bor\b|\band\b", seg[max(0, m.start() - 14):m.start()].lower())[-1]; after = re.split(r"\d", seg[m.end():m.end() + 30], 1)[0].lower()
    return "bridg" in before or "bridg" in after or "bridg" in m.group(0).lower()

def fuse_a(text):
    m = re.search(r"(?i)fus(?:e|es|ing)[^|]{0,25}?(\d{2,3})\s*(?:A\b|Amps?)", text) or re.search(r"(?i)(\d{2,3})\s*(?:A|Amp)\s*(?:x\s*(\d))?\s*fuse", text)
    return int(m.group(1)) if m else None

def dims_in(text):
    m = re.search(r"(?i)dimensions?\s*(?:\([^)]*\))?\s*:?\s*\|?\s*(?:\(?L\s*x\s*W\s*x\s*H\)?\s*:?\s*)?(\d+(?:\.\d+)?)\s*(?:\"|”|″|in|'')?\s*(?:L|W|H|D)?\s*[xX×]\s*([\d.]+)\s*(?:\"|”|″|in|'')?\s*(?:L|W|H|D)?\s*[xX×]\s*([\d.]+)\s*(\"|”|″|in|''|mm|cm)?", text)
    if not m: return None
    a = [float(m.group(i)) for i in (1, 2, 3)]; unit = (m.group(4) or "").strip()
    if unit in ("mm",): return {"mm": a, "as_published": m.group(0)[-60:]}
    if unit == "cm": return {"mm": [round(x * 10, 1) for x in a], "as_published": m.group(0)[-60:]}
    return {"mm": [round(x * 25.4, 1) for x in a], "as_published_in": a}

# ---- R3B_PARTS_CLEAN (2026-11-23): model names, bundles, duplicates, amplifier channel / bridge / per-load tidy-up, quality flags ----
_UNIT_TOK = re.compile(r"(?i)^(\d+(?:[.,]\d+)?(?:w|watts?|v|vdc|a|amps?|ah|f|farad|mm|mm2|cm|m|ft|in|hz|khz|db|ohms?|ga|awg|k|kw|pcs|pk|pack|ch|x\d+w?)|\d+[xX]\d+(?:w|ga)?|\d+-(?:channel|ch|way|ohms?|gauge|ga|awg|pack|band|inch|pin|core)|class-?\w+|ip\d+|cta-?2006(?:-b)?|cea-?2006|\d+/0|\d+(?:\.\d+)?)$")
_TOK = re.compile(r"[A-Za-z0-9]+(?:[.\-/][A-Za-z0-9]+)*")
COLOUR_SUFFIX = re.compile(r"/(?:RD|BL|BK|TI|WH|SL|GR|BLK|RED|BLU)$|-(?:RD|BL|BK|TI|WH)$")
def norm_model(s): return re.sub(r"[^A-Z0-9]", "", (s or "").upper())
def model_tokens(title):
    """model-like tokens of a title: letters and digits (or a digit block with a dot, e.g. 2000.1D), not a unit or size"""
    out = []
    for m in _TOK.finditer(title or ""):
        t = m.group(0).strip(".-/")
        if len(norm_model(t)) < 3 or _UNIT_TOK.match(t) or not re.search(r"\d", t): continue
        if not (re.search(r"[A-Za-z]", t) or "." in t): continue
        out.append(t)
    return out
def model_pick(title, skus=(), strip=r"^(?:A-|UA-|PS-)"):
    """R3B: maker model from a title and the store SKU(s). Prefers the SKU when it contains the title's model token (fuller code, e.g. GF-2000.1D for
    'Godfather 2000.1D'), otherwise the longest model-like title token, otherwise the SKU. Returns (model, basis)."""
    skus = [re.sub(strip, "", re.sub(r"\s*\(.*?\)\s*$", "", s or "").strip()) for s in skus if (s or "").strip()]
    skus = [s for s in skus if re.search(r"\d", s) and len(s) <= 30 and not re.search(r"\s{1,}\w+\s+\w+\s+\w+", s)]
    toks = model_tokens(title)
    best = max(toks, key=lambda t: (bool(re.search(r"[A-Za-z]", t) and re.search(r"\d", t)), ("-" in t or "." in t), len(norm_model(t))), default=None)
    if len(skus) == 1:
        s = skus[0]
        if best and norm_model(best) == norm_model(s): return best, "maker SKU (title spelling)"
        if best and norm_model(best) in norm_model(s) and len(norm_model(s)) - len(norm_model(best)) <= 6: return s, "maker SKU"
        if best and norm_model(s) in norm_model(best): return best, "title"
        if best and len(norm_model(best)) >= 5: return best, "title (store SKU differs: " + s + ")"
        return s, "maker SKU"
    return (best, "title") if best else (None, None)

from quality import BUNDLE_RX  # one definition, shared with the checker
def _rating_key(x): return (x.get("ohm"), x.get("channels"), bool(x.get("bridged")), x.get("group"), x.get("voltage_v"))
def amp_fix(r):
    """R3B amplifier tidy-up on one record (in place). Every inference is written to r['inferred'] so it can be audited."""
    inf = r.setdefault("inferred", [])
    rat = r.get("rms_ratings") or []
    # exact repeats of the same rating
    seen, keep = set(), []
    for x in rat:
        k = (x.get("w_per_ch"),) + _rating_key(x)
        if k not in seen: seen.add(k); keep.append(x)
    rat = r["rms_ratings"] = keep
    src = (r.get("model") or "") + " " + (r.get("title") or "")
    modes = {int(m.group(1)) for x in rat for m in [re.match(r"Ch mode (\d)", x.get("group") or "")] if m}
    if r.get("channels") is None and modes: r["channels"] = max(modes); inf.append("channels = largest 'N Ch' mode in the maker table")
    if r.get("channels") is None:
        m = re.search(r"\b\d{2,5}\.(\d)(?:[A-Za-z]{0,3}\d?)?\b", src) or re.search(r"\b\d{3,5}[xX](\d)\b", src)
        c = re.search(r"(?i)\b(\d)[\s-]*(?:ch\b|channel)", r.get("title") or "")
        if c and 0 < int(c.group(1)) <= 12: r["channels"] = int(c.group(1)); inf.append("channels from title")
        elif m and 0 < int(m.group(1)) <= 8: r["channels"] = int(m.group(1)); inf.append("channels from the model number suffix (.N / xN)")
        elif re.search(r"(?i)\bmono(?:block)?\b|monobloco", r.get("title") or ""): r["channels"] = 1; inf.append("channels = 1 (title says mono)")
        else:
            tot = {}
            for x in rat:
                if not x.get("bridged") and x.get("channels"): tot.setdefault(x.get("ohm"), set()).add(x["channels"])
            if tot:
                n = max(sum(v) for v in tot.values()); r["channels"] = n; inf.append("channels = sum of the unbridged rating lines at one load")
    N = r.get("channels")
    plain = [x for x in rat if not x.get("bridged") and not x.get("group") and x.get("channels")]
    if N and plain and all(x["channels"] > N for x in plain):
        M = max(x["channels"] for x in plain); inf.append(f"source says {N} channel(s) but every unbridged rating line is x {M}; channels set to {M}"); r["channels"] = N = M
    if N and modes:
        # 'M Ch' mode lines on an N-channel amp (e.g. Hertz/Audison '3 Ch: 160W x 2 (4ohm) + 500W x 1 (4ohm)' on a 4-channel amp):
        # the lines with N - M channels are the bridged pairs (2 + 1x2 = 4 channels used)
        for x in rat:
            m = re.match(r"Ch mode (\d)", x.get("group") or "")
            if m and int(m.group(1)) < N and x.get("channels") == N - int(m.group(1)) and not x.get("bridged"):
                x["bridged"] = True; x["bridged_inferred"] = True; inf.append(f"{x['w_per_ch']} W x {x['channels']} in the maker's '{m.group(1)} Ch' mode line of a {N}-channel amp marked bridged")
    if N:
        for x in rat:
            if x.get("channels") is None:
                if N == 1 and not x.get("bridged"): x["channels"] = 1; inf.append("rating channels = 1 (mono amp)")
                elif x.get("bridged") == "strapped" and N == 1: x["channels"] = 1; inf.append("strapped (two amps linked) rating counted as 1 channel")
                elif x.get("bridged") and N % 2 == 0: x["channels"] = N // 2; inf.append(f"bridged rating channels = {N // 2} ({N}-channel amp)")
                elif not x.get("bridged") and not x.get("group") and all(y.get("channels") in (None, N) for y in rat if not y.get("bridged")):
                    x["channels"] = N; inf.append(f"rating channels = {N} (line gave no 'x N'; amp has {N} channels)")
        for x in rat:
            c = x.get("channels")
            if not c or x.get("bridged") or x.get("group") or N not in (2, 4) or c * 2 > N: continue
            full = [y for y in rat if y.get("channels") == N and not y.get("bridged")]
            half = [y["w_per_ch"] for y in full if y.get("ohm") == x.get("ohm") / 2]; same = [y["w_per_ch"] for y in full if y.get("ohm") == x.get("ohm")]
            if (half and x["w_per_ch"] >= 1.6 * max(half)) or (same and x["w_per_ch"] >= 2.5 * max(same)) or (not full and N == 2 and c == 1):
                x["bridged"] = True; x["bridged_inferred"] = True
                inf.append(f"{x['w_per_ch']} W x {c} at {x.get('ohm')} ohm marked bridged ({N}-channel amp; " + ("power vs the per-channel rating" if full else "single line on a 2-channel amp") + ")")
    if r.get("min_load_ohm") is None and any(not x.get("bridged") for x in rat):
        r["min_load_ohm"] = min(x["ohm"] for x in rat if not x.get("bridged")); inf.append("min_load_ohm = lowest unbridged rating load")
    if not inf: del r["inferred"]

def finalize(category, records, not_recorded):
    """R3B: run on every file by write(): bundles flagged, amplifier tidy-up, duplicates merged (same normalised model in one file),
    then the quality checker's issues are written to r['quality_issues'] and every record with an issue gets a `check` text."""
    sys_path_added = "/workspace/scripts/parts"
    import sys as _s
    if sys_path_added not in _s.path: _s.path.insert(0, sys_path_added)
    from quality import issues, dup_key
    for r in records:
        if re.search(BUNDLE_RX, r.get("title") or "") and not r.get("bundle"): r["bundle"] = True
        if r.get("model"): r["model"] = re.sub(r"\s+", " ", str(r["model"])).strip(" -|:")
        if category == "amplifiers": amp_fix(r)
    # duplicates: same normalised model (colour suffix removed) or same title
    groups = {}
    for r in records: groups.setdefault(dup_key(category, r), []).append(r)
    out = []
    for r in records:
        g = groups[dup_key(category, r)]
        if len(g) == 1: out.append(r); continue
        prim = sorted(g, key=lambda x: (bool(x.get("bundle")), -len(x.get("rms_ratings") or x.get("amp_rms_ratings") or []), -sum(v is not None for v in x.values())))[0]
        if r is prim:
            if COLOUR_SUFFIX.search(r.get("model") or ""): r["model"] = COLOUR_SUFFIX.sub("", r["model"])
            out.append(r); continue
        if r.get("bundle") and not prim.get("bundle"):
            not_recorded.append({"title": r.get("title"), "id": r["id"], "url": r["sources"][0]["url"], "reason": f"bundle / multi-pack listing that includes {prim.get('model')}; the item itself is recorded as {prim['id']}"}); continue
        prim.setdefault("variants", []).append({"id": r["id"], "model": r.get("model"), "title": r.get("title"), "url": r["sources"][0]["url"], "prices_other": r.get("prices_other") or [], "prices_aud": r.get("prices_aud") or []})
        for s in r.get("sources", []):
            if s["url"] not in [x["url"] for x in prim["sources"]]: prim["sources"].append({**s, "fields": ["same model, other listing (colour / variant)"]})
        prim["prices_other"] = (prim.get("prices_other") or []) + [p for p in (r.get("prices_other") or []) if p not in (prim.get("prices_other") or [])]
        prim["prices_aud"] = (prim.get("prices_aud") or []) + [p for p in (r.get("prices_aud") or []) if p not in (prim.get("prices_aud") or [])]
        not_recorded.append({"title": r.get("title"), "id": r["id"], "url": r["sources"][0]["url"], "reason": f"duplicate listing of {prim.get('model')} (colour / variant / repeat), merged into {prim['id']}"})
    records[:] = out
    for r in records:
        iss = issues(category, r)
        r.pop("quality_issues", None)
        if iss:
            r["quality_issues"] = iss
            if not (r.get("check") or "").strip(): r["check"] = "not clean: " + ", ".join(iss) + " (scripts/parts/quality.py); verify against the maker page or manual"
