"""Shared record helper for A2 hp-subs JSON (data/hp_subs_raw/us/). Transcribed values only; conversions are noted.
Unit conversions: inches -> mm (x25.4), cu ft -> L (x28.3168), sq in -> cm2 (x6.4516). Rounded to 1 decimal (mm, L) ."""
import json, os
IN = 25.4; CUFT = 28.3168; SQIN = 6.4516
def mm(inches): return None if inches is None else round(inches * IN, 1)
def L(cuft): return None if cuft is None else round(cuft * CUFT, 2)
def final_loads(coil, z):
    if coil == "SVC": return [z]
    if coil == "DVC": return sorted({z / 2, z * 2})
    if coil == "QVC": return sorted({z / 4, z, z * 4})  # all-parallel, series-parallel, all-series
    return []
PKEYS = ["fs_hz","re_ohm","qms","qes","qts","vas_l","sd_cm2","xmax_mm","mms_g","bl_tm","le_mh","spl_db_1w1m","spl_db_2v83"]
def rec(model, size_in, coil, ohms, rms, peak=None, params=None, ts_basis="unknown", depth_in=None, cut_in=None, disp_cuft=None,
        depth_mm=None, cut_mm=None, disp_l=None, boxes=(), status="current", sources=(), notes="", conv=True):
    w = lambda x: int(x) if isinstance(x, float) and x.is_integer() else x
    rms, peak = w(rms), w(peak)
    p = {k: None for k in PKEYS}; p.update(params or {})
    bad = set(p) - set(PKEYS)
    assert not bad, bad
    convnotes = []
    if depth_in is not None: depth_mm = mm(depth_in); convnotes.append(f"mounting depth {depth_in} in")
    if cut_in is not None: cut_mm = mm(cut_in); convnotes.append(f"cut-out {cut_in} in")
    if disp_cuft is not None: disp_l = L(disp_cuft); convnotes.append(f"displacement {disp_cuft} cu ft")
    n = notes
    if convnotes and conv: n = (n + " " if n else "") + "Converted from imperial as published: " + ", ".join(convnotes) + "."
    return {"model": model, "size_in": size_in, "coil": coil, "ohms_per_coil": ohms, "coils": {"SVC":1,"DVC":2,"QVC":4}[coil],
            "rms_w": rms, "peak_w": peak, "final_loads_ohm": final_loads(coil, ohms), "ts_basis": ts_basis, "params": p,
            "mounting_depth_mm": depth_mm, "cutout_mm": cut_mm, "displacement_l": disp_l, "recommended_boxes": list(boxes),
            "status": status, "sources": list(sources), "notes": n}
def box(typ, cuft=None, tuning=None, source="", litres=None, note=None):
    b = {"type": typ, "volume_l": litres if litres is not None else L(cuft), "tuning_hz": tuning, "source": source}
    if cuft is not None: b["note"] = f"published as {cuft} cu ft" + (f"; {note}" if note else "")
    elif note: b["note"] = note
    return b
def src(url, fields=("*",), doc="product page", page=None, date="2026-11-21", tier=1):
    return {"fields": list(fields), "url": url, "doc": doc, "page": page, "read_date": date, "tier": tier}
def save(slug, brand, brand_url, terms_note, drivers, no_ts=(), country="USA", extra=None):
    out = {"brand": brand, "country": country, "brand_url": brand_url, "terms_note": terms_note, "drivers": drivers, "no_ts_published": list(no_ts)}
    if extra: out.update(extra)
    path = f"/workspace/data/hp_subs_raw/us/{slug}.json"
    json.dump(out, open(path, "w"), indent=1, ensure_ascii=False)
    print(f"saved {path}: {len(drivers)} drivers, {len(out['no_ts_published'])} without T/S")
def box_range(typ, lo_cuft, hi_cuft, tuning=None, source=""):
    """Maker gives a volume range: volume_l stays null (no single value published); range kept in volume_range_l."""
    return {"type": typ, "volume_l": None, "volume_range_l": [L(lo_cuft), L(hi_cuft)], "tuning_hz": tuning, "source": source,
            "note": f"published as a range {lo_cuft} to {hi_cuft} cu ft"}
