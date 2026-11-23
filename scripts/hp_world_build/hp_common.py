"""Shared helpers for agent A3 brand builders (2026-11-21). Each brand script builds
data/hp_subs_raw/world/<slug>.json from page text saved while reading the maker's pages."""
import json, re
OUT = "/workspace/data/hp_subs_raw/world/"
P_KEYS = ["fs_hz","re_ohm","qms","qes","qts","vas_l","sd_cm2","xmax_mm","mms_g","bl_tm","le_mh","spl_db_1w1m","spl_db_2v83"]

def num(s):
    if s is None: return None
    m = re.search(r"-?\d+(?:[.,]\d+)?", str(s))
    if not m: return None
    v = float(m.group(0).replace(",", "."))
    return int(v) if v.is_integer() else v

def loads(coil, ohms, coils):
    """Final loads with all coils driven: SVC -> [ohms]; DVC/QVC -> every series/parallel combination."""
    if ohms is None: return []
    if coils == 1: return [ohms]
    if coils == 2: return sorted({ohms/2, ohms*2})
    if coils == 4: return sorted({ohms/4, ohms, ohms*4})
    return []

def driver(**kw):
    p = {k: kw.pop(k, None) for k in P_KEYS}
    d = {"model": None, "size_in": None, "coil": None, "ohms_per_coil": None, "coils": None,
         "rms_w": None, "peak_w": None, "final_loads_ohm": None, "ts_basis": "unknown", "params": p,
         "mounting_depth_mm": None, "cutout_mm": None, "displacement_l": None,
         "recommended_boxes": [], "status": "unknown", "sources": [], "notes": ""}
    d.update(kw)
    if d["final_loads_ohm"] is None:
        d["final_loads_ohm"] = [x for x in loads(d["coil"], d["ohms_per_coil"], d["coils"])]
    d["final_loads_ohm"] = [int(x) if float(x).is_integer() else x for x in d["final_loads_ohm"]]
    return d

def save(slug, brand, country, url, terms, drivers, no_ts=None, extra=None):
    no_ts = list(no_ts or [])
    keep = []
    for d in drivers:
        p = d["params"]
        if p["fs_hz"] is None and p["qts"] is None and p["vas_l"] is None:
            have = {k: v for k, v in p.items() if v is not None}
            no_ts.append({"model": d["model"], "rms_w": d["rms_w"], "url": d["sources"][0]["url"] if d["sources"] else None,
                          "note": "Maker page has no Fs/Qts/Vas" + (f" (only {have})" if have else "") + f"; coil {d['coil']} {d['ohms_per_coil']} ohm, mounting depth {d['mounting_depth_mm']} mm, cut-out {d['cutout_mm']} mm. " + d["notes"][:300]})
        else:
            keep.append(d)
    drivers = keep
    doc = {"brand": brand, "country": country, "brand_url": url, "terms_note": terms,
           "drivers": drivers, "no_ts_published": no_ts or []}
    if extra: doc.update(extra)
    with open(OUT + slug + ".json", "w") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("saved", slug, len(drivers), "drivers,", len(no_ts or []), "no-T/S")
