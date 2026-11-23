"""R4_CAR_DRIVERS (2026-11-23): shared helpers for car tweeters, midrange, midbass, coaxials, component sets, full-range.
Record format = data/hp_subs_raw (scripts/hp_subs/rec.py) extended with: type, size_label, impedance, magnet, sensitivity,
frequency range, frame/cut-out/mounting depth, crossover (recommended + included passive), set links, AU prices.
Output: data/car_drivers_raw/<type>/<slug>.json (one file per brand and type). Numbers only, each with its maker source URL.
Unit conversions: inches -> mm (x25.4), sq in -> cm2 (x6.4516), cu ft -> L (x28.3168); stated in notes when used."""
import json, os, re
IN = 25.4; CUFT = 28.3168; SQIN = 6.4516
ROOT = "/workspace/data/car_drivers_raw"
RAW = "/workspace/references/raw/car_drivers"
TYPES = ("tweeter", "midrange", "midbass", "coaxial", "component_set", "fullrange")
PKEYS = ["fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "xmax_mm", "mms_g", "bl_tm", "le_mh", "spl_db_1w1m", "spl_db_2v83"]
TODAY = "2026-11-23"


def mm(inches): return None if inches is None else round(inches * IN, 1)
def L(cuft): return None if cuft is None else round(cuft * CUFT, 2)
def cm2(sqin): return None if sqin is None else round(sqin * SQIN, 1)


def num(s):
    if s is None: return None
    m = re.search(r"-?(?:\d+(?:[.,]\d+)?|[.,]\d+)", str(s))  # also '.68' (leading decimal point as printed)
    if not m: return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


def w(x): return int(x) if isinstance(x, float) and x.is_integer() else x


def rec(model, type_, size_in=None, size_label=None, impedance_ohm=None, coil="SVC", rms_w=None, peak_w=None,
        sens_db=None, sens_basis=None, freq_hz=None, magnet=None, params=None, ts_basis="unknown",
        depth_mm=None, cutout_mm=None, frame_mm=None, depth_in=None, cut_in=None, frame_in=None,
        xover=None, passive=None, set_parts=None, parts_of=None, price_au=None, status="current", sources=(), notes="", extra=None):
    """type_ in TYPES. freq_hz = [lo, hi] as printed. sens_basis = '1W/1m' | '2.83V/1m' | 'unknown'.
    frame_mm = outer frame diameter, or [w, h] for oval frames. xover = recommended crossover dict
    {hp_hz, lp_hz, slope_db_oct, note}. passive = included passive crossover dict {woofer_lp_hz, tweeter_hp_hz, slope_db_oct,
    tweeter_level_db: [...], note}. set_parts = list of {role, model, ref} for a component set; parts_of = set models this part belongs to."""
    assert type_ in TYPES, type_
    p = {k: None for k in PKEYS}; p.update({k: w(v) for k, v in (params or {}).items() if v is not None})
    bad = set(p) - set(PKEYS)
    assert not bad, bad
    conv = []
    if depth_in is not None: depth_mm = mm(depth_in); conv.append(f"mounting depth {depth_in} in")
    if cut_in is not None: cutout_mm = mm(cut_in); conv.append(f"cut-out {cut_in} in")
    if frame_in is not None:
        frame_mm = [mm(x) for x in frame_in] if isinstance(frame_in, (list, tuple)) else mm(frame_in); conv.append(f"frame {frame_in} in")
    n = notes
    if conv: n = (n + " " if n else "") + "Converted from imperial as published: " + ", ".join(conv) + "."
    r = {"model": model, "type": type_, "size_in": w(size_in), "size_label": size_label, "impedance_ohm": w(impedance_ohm),
         "coil": coil, "rms_w": w(rms_w), "peak_w": w(peak_w), "sensitivity_db": w(sens_db), "sensitivity_basis": sens_basis,
         "freq_range_hz": [w(x) for x in freq_hz] if freq_hz else None, "magnet": magnet, "ts_basis": ts_basis, "params": p,
         "mounting_depth_mm": w(depth_mm), "cutout_mm": cutout_mm, "frame_mm": frame_mm,
         "recommended_crossover": xover, "passive_crossover": passive, "set_parts": set_parts, "part_of_sets": parts_of,
         "price_au": price_au or [], "status": status, "sources": list(sources), "notes": n}
    if extra: r.update(extra)
    return r


def src(url, fields=("*",), doc="product page", page=None, date=TODAY, tier=1):
    return {"fields": list(fields), "url": url, "doc": doc, "page": page, "read_date": date, "tier": tier}


def save(slug, brand, country, brand_url, terms_note, records, no_specs=(), **extra):
    """Writes one file per type present: data/car_drivers_raw/<type>/<slug>.json. no_specs = models listed without numbers."""
    import glob as _g
    for old in _g.glob(f"{ROOT}/*/{slug}.json"): os.remove(old)  # this builder owns these files; rebuilt in full below
    by = {}
    for r in records: by.setdefault(r["type"], []).append(r)
    # R4B: re-attach AU retail prices from the join file (built by scripts/prices_au/join_prices.py), key '<type>/<slug>.json#<model>'
    # P1_PUBLIC_DATA: prices are no longer written into the public raw files; they stay in
    # data/private/prices_au/join_car_drivers.json and scripts/import_car_drivers.mjs attaches them to the private bundle
    for t, rs in by.items():
        for r in rs: r.pop("price_au", None)
    for t, rs in sorted(by.items()):
        os.makedirs(f"{ROOT}/{t}", exist_ok=True)
        out = {"brand": brand, "country": country, "brand_url": brand_url, "terms_note": terms_note, "collected_by": "R4_CAR_DRIVERS",
               "type": t, "drivers": rs, "no_specs_published": [x for x in no_specs if x.get("type") == t]}
        out.update(extra)
        path = f"{ROOT}/{t}/{slug}.json"
        json.dump(out, open(path, "w"), indent=1, ensure_ascii=False)
        nts = sum(1 for r in rs if r["params"].get("fs_hz") and r["params"].get("qts"))
        print(f"saved {path}: {len(rs)} records, {nts} with fs+Qts")
    left = [x for x in no_specs if x.get("type") not in by]
    for t in sorted({x["type"] for x in left}):
        os.makedirs(f"{ROOT}/{t}", exist_ok=True)
        path = f"{ROOT}/{t}/{slug}.json"
        json.dump({"brand": brand, "country": country, "brand_url": brand_url, "terms_note": terms_note, "collected_by": "R4_CAR_DRIVERS",
                   "type": t, "drivers": [], "no_specs_published": [x for x in left if x["type"] == t], **extra}, open(path, "w"), indent=1, ensure_ascii=False)
        print(f"saved {path}: 0 records, listed only")


def text_of(path):
    """Cleaned page text with '|' between elements (untrusted data, read only)."""
    import html
    t = open(path, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", "|", t); t = html.unescape(t); t = re.sub(r"[ \t\r\n]+", " ", t); t = re.sub(r"(\s*\|\s*)+", "|", t)
    return t
