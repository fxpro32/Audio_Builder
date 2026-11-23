"""R2_SUBS_ALL (2026-11-23): shared helpers for the all-power-level car subwoofer set.
Record format = data/hp_subs_raw (see scripts/hp_subs/rec.py, copied and extended here; the old files are not edited).
Output: data/car_subs_raw/<region>/<slug>.json, region in {us, world, au}.
Every record carries "source": "hp_subs_raw" (copied unchanged from data/hp_subs_raw/<region>/<slug>.json)
or "source": "R2_SUBS_ALL" (collected by this job). Numbers only, each with its maker source URL.
Unit conversions: inches -> mm (x25.4), cu ft -> L (x28.3168), sq in -> cm2 (x6.4516); stated in notes."""
import json, os, re
IN = 25.4; CUFT = 28.3168; SQIN = 6.4516
ROOT = "/workspace/data/car_subs_raw"
HP = "/workspace/data/hp_subs_raw"
PRIVATE_SLUGS = {"vibe"}  # P1_PUBLIC_DATA: brands kept out of the public data (VIBE: read past a bot block)
RAW = "/workspace/references/raw/car_subs"
PKEYS = ["fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "xmax_mm", "mms_g", "bl_tm", "le_mh", "spl_db_1w1m", "spl_db_2v83"]
TODAY = "2026-11-23"


def mm(inches): return None if inches is None else round(inches * IN, 1)
def L(cuft): return None if cuft is None else round(cuft * CUFT, 2)
def cm2(sqin): return None if sqin is None else round(sqin * SQIN, 1)


def num(s):
    if s is None: return None
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(s))
    if not m: return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v


def final_loads(coil, z):
    if z is None: return []
    if coil == "SVC": return [z]
    if coil == "DVC": return sorted({z / 2, z * 2})
    if coil == "QVC": return sorted({z / 4, z, z * 4})
    return []


def rec(model, size_in, coil, ohms, rms, peak=None, params=None, ts_basis="unknown", depth_in=None, cut_in=None, disp_cuft=None,
        depth_mm=None, cut_mm=None, disp_l=None, boxes=(), status="current", sources=(), notes=""):
    w = lambda x: int(x) if isinstance(x, float) and x.is_integer() else x
    rms, peak = w(rms), w(peak)
    p = {k: None for k in PKEYS}; p.update({k: w(v) for k, v in (params or {}).items()})
    bad = set(p) - set(PKEYS)
    assert not bad, bad
    conv = []
    if depth_in is not None: depth_mm = mm(depth_in); conv.append(f"mounting depth {depth_in} in")
    if cut_in is not None: cut_mm = mm(cut_in); conv.append(f"cut-out {cut_in} in")
    if disp_cuft is not None: disp_l = L(disp_cuft); conv.append(f"displacement {disp_cuft} cu ft")
    n = notes
    if conv: n = (n + " " if n else "") + "Converted from imperial as published: " + ", ".join(conv) + "."
    fl = [w(x) for x in final_loads(coil, ohms)]
    return {"model": model, "size_in": size_in, "coil": coil, "ohms_per_coil": w(ohms) if ohms is not None else None,
            "coils": {"SVC": 1, "DVC": 2, "QVC": 4}.get(coil), "rms_w": rms, "peak_w": peak, "final_loads_ohm": fl,
            "ts_basis": ts_basis, "params": p, "mounting_depth_mm": depth_mm, "cutout_mm": cut_mm, "displacement_l": disp_l,
            "recommended_boxes": list(boxes), "status": status, "sources": list(sources), "notes": n}


def box(typ, cuft=None, tuning=None, source="", litres=None, note=None):
    b = {"type": typ, "volume_l": litres if litres is not None else L(cuft), "tuning_hz": tuning, "source": source}
    if cuft is not None: b["note"] = f"published as {cuft} cu ft" + (f"; {note}" if note else "")
    elif note: b["note"] = note
    return b


def src(url, fields=("*",), doc="product page", page=None, date=TODAY, tier=1):
    return {"fields": list(fields), "url": url, "doc": doc, "page": page, "read_date": date, "tier": tier}


def has_ts(d):
    p = d["params"]
    return any(p.get(k) is not None for k in ("fs_hz", "qts", "vas_l"))


def norm(m):
    return re.sub(r"[^a-z0-9]", "", (m or "").lower())


def save(region, slug, brand, country, brand_url, terms_note, drivers=(), no_ts=(), coverage="", extra=None, hp_region=None, upgrade_listed=False):
    """Write data/car_subs_raw/<region>/<slug>.json = copied hp_subs_raw records (if that brand file exists) + new records.
    New records without any of Fs/Qts/Vas move to no_ts_published (flagged incomplete, same as the earlier jobs).
    A new record whose model name equals a copied one is dropped (the hp_subs_raw copy wins and keeps its sources)."""
    hp_region = hp_region or region
    priv = slug in PRIVATE_SLUGS  # P1_PUBLIC_DATA: read from and written to the private overlay
    hp_path = f"{HP.replace('/data/', '/data/private/') if priv else HP}/{hp_region}/{slug}.json"
    old_d, old_n, hp_terms = [], [], None
    if os.path.exists(hp_path):
        h = json.load(open(hp_path))
        hp_terms = h.get("terms_note")
        for d in h["drivers"]: old_d.append(dict(d, source="hp_subs_raw"))
        for d in h.get("no_ts_published", []): old_n.append(dict(d, source="hp_subs_raw"))
    if upgrade_listed:  # R2B_SUBS_MORE: a new record WITH T/S replaces an hp_subs_raw 'listed without T/S' entry of the same model (the hp file itself is unchanged)
        newts = {norm(d["model"]) for d in drivers if has_ts(d)}
        newurl = {s["url"].rstrip("/").lower() for d in drivers if has_ts(d) for s in d["sources"] if s.get("url")}
        hit = lambda n: norm(n["model"]) in newts or (n.get("url") or "").rstrip("/").lower() in newurl
        gone = [n["model"] for n in old_n if hit(n)]
        old_n = [n for n in old_n if not hit(n)]
        if gone: print("hp_subs_raw listed entries replaced by new records with T/S:", gone)
    seen = {norm(d["model"]) for d in old_d} | {norm(d["model"]) for d in old_n}
    new_d, new_n, dup = [], [], 0
    for d in drivers:
        if norm(d["model"]) in seen: dup += 1; continue
        seen.add(norm(d["model"]))
        d = dict(d, source="R2_SUBS_ALL")
        if has_ts(d): new_d.append(d)
        else:
            p = {k: v for k, v in d["params"].items() if v is not None}
            new_n.append({"model": d["model"], "rms_w": d["rms_w"], "url": d["sources"][0]["url"] if d["sources"] else None,
                          "note": "No Fs/Qts/Vas published by the maker" + (f" (only {p})" if p else "") +
                                  f"; size {d['size_in']} in, coil {d['coil']} {d['ohms_per_coil']} ohm, peak {d['peak_w']} W, mounting depth {d['mounting_depth_mm']} mm, cut-out {d['cutout_mm']} mm. " + (d["notes"] or ""),
                          "size_in": d["size_in"], "coil": d["coil"], "ohms_per_coil": d["ohms_per_coil"], "peak_w": d["peak_w"],
                          "mounting_depth_mm": d["mounting_depth_mm"], "cutout_mm": d["cutout_mm"], "status": d["status"],
                          "sources": d["sources"], "source": "R2_SUBS_ALL"})
    for n in no_ts:
        if norm(n["model"]) in seen: dup += 1; continue
        seen.add(norm(n["model"])); new_n.append(dict(n, source="R2_SUBS_ALL"))
    tn = terms_note + ((" | hp_subs_raw terms note: " + hp_terms) if hp_terms and hp_terms not in terms_note else "")
    out = {"brand": brand, "country": country, "brand_url": brand_url, "terms_note": tn,
           "coverage": coverage, "hp_subs_raw_file": hp_path.replace("/workspace/", "") if os.path.exists(hp_path) else None,
           "drivers": old_d + new_d, "no_ts_published": old_n + new_n}
    if extra: out.update(extra)
    root = ROOT.replace("/data/", "/data/private/") if priv else ROOT
    os.makedirs(f"{root}/{region}", exist_ok=True)
    path = f"{root}/{region}/{slug}.json"
    json.dump(out, open(path, "w"), indent=1, ensure_ascii=False)
    print(f"saved {path}: {len(old_d)}+{len(new_d)} drivers (hp+new), {len(old_n)}+{len(new_n)} without T/S, {dup} duplicates skipped")
    return out
