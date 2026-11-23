#!/usr/bin/env python3
"""R3B: quality checker for data/parts_raw. Reports, per category and per brand, the records that are not clean:
 all categories: model_missing_or_short (model null or under 4 letters/digits), duplicate (same brand file, same normalised model, or same title),
                 bundle_unflagged (title says bundle/combo/package/kit with other items but the record has no "bundle" field), unflagged (an issue but no `check` text)
 amplifiers: channels_null, no_rms, rating_channels_null, bridged_suspect (unbridged rating with fewer channels than the amp has, or more than it has),
             rms_conflict (two powers for the same load/channels/bridge), min_load_null (ratings but no min load)
 dsp: kind_null, io_null (DSP/LOC with no inputs or outputs); amp+DSP with no amp ratings
 distribution: ports_null (no port/pole/gauge numbers)
 fuses: rating_null (a fuse or breaker with no amp rating), type_null (fuse/holder with no fuse type)
 terminals: size_null (no AWG, gauge or mm2)
 cable: size_null (no AWG or mm2), material_null, length_null
 capacitors: farads_null, voltage_null
Usage: quality.py [--brands] [--json out.json] [--list issue]  (--list prints the ids with that issue)"""
import json, glob, re, sys, collections
CATS = ["amplifiers", "dsp", "distribution", "fuses", "terminals", "cable", "capacitors"]
BUNDLE_RX = r"(?i)\bbundle\b|\bcombo\b|\bpackage\b|\bpkg\b|\bw/\s?(?!o\b)|\bwith (?:a |an )?(?:\d+\s*x?\s*)?(?:amp\b|amplifier|sub\b|subwoofer|speaker|wiring|install|kit|dsp\b|enclosure|box)|\+ ?(?:pnp |plug and play )?(?:wiring|install|amp|sub|pro\b|\d+x|harness)|& (?:wiring|install) kit|\bpack(?:age)? deal|\(\d+ ?pack\)|\b\d ?-?pack\b(?! of)"

def norm(s): return re.sub(r"[^A-Z0-9]", "", (s or "").upper())
COLOUR_SUFFIX = re.compile(r"/(?:RD|BL|BK|TI|WH|SL|GR|BLK|RED|BLU)$|-(?:RD|BL|BK|TI|WH)$")
def dup_key(cat, r):
    """same item twice in one brand file: amplifiers/dsp/capacitors/batteries by model (colour suffix removed; title when no model);
    other categories by model + title (one product name can cover several gauges / lengths with different models)"""
    mk = norm(COLOUR_SUFFIX.sub("", r.get("model") or "")); tk = (r.get("title") or "").strip().lower()
    if cat in ("amplifiers", "dsp", "capacitors", "batteries"): return mk if len(mk) >= 4 else ("T:" + tk if tk else r["id"])
    return (mk, tk) if (len(mk) >= 4 or tk) else r["id"]

def issues(cat, r):
    out = []
    m = norm(r.get("model"))
    if len(m) < 4 and not (m and str(r.get("model_basis") or "").startswith("maker")): out.append("model_missing_or_short")
    if re.search(BUNDLE_RX, r.get("title") or "") and not r.get("bundle"): out.append("bundle_unflagged")
    if cat == "amplifiers":
        rat = r.get("rms_ratings") or []; ch = r.get("channels")
        if ch is None: out.append("channels_null")
        if not rat: out.append("no_rms")
        if any(x.get("channels") is None for x in rat): out.append("rating_channels_null")
        if ch:
            for x in rat:
                c = x.get("channels")
                if c is None: continue
                if x.get("bridged") or x.get("group"): continue
                if (ch in (2, 4) and c * 2 <= ch) or c > ch:
                    out.append("bridged_suspect"); break
        conf = collections.defaultdict(set)
        for x in rat: conf[(x.get("ohm"), x.get("channels"), bool(x.get("bridged")), x.get("group"), x.get("voltage_v"))].add(x.get("w_per_ch"))
        if any(len(v) > 1 for v in conf.values()): out.append("rms_conflict")
        if rat and r.get("min_load_ohm") is None and any(not x.get("bridged") for x in rat): out.append("min_load_null")
    elif cat == "dsp":
        k = r.get("kind")
        if not k: out.append("kind_null")
        if k and k != "amp+DSP" and "accessory" not in k and r.get("channels_title") is None and r.get("inputs") is None and r.get("outputs") is None and r.get("preamp_inputs") is None and r.get("speaker_level_inputs_ch") is None and r.get("preamp_outputs") is None: out.append("io_null")
        if k == "amp+DSP" and not r.get("amp_rms_ratings"): out.append("amp_dsp_no_rms")
    elif cat == "distribution":
        if not any(r.get(k) for k in ("ports", "poles", "awg", "ports_text_numbers", "gauges_in_name", "inputs_outputs", "ways", "studs")): out.append("ports_null")
    elif cat == "fuses":
        k = (r.get("kind") or "")
        if k in ("fuse", "circuit breaker") and r.get("rating_a") is None and not r.get("ratings_a") and not r.get("fuse_included_a"): out.append("rating_null")
        if k in ("fuse", "fuse holder", "fuse kit") and not r.get("fuse_type"): out.append("type_null")
    elif cat == "terminals":
        if not any(r.get(k) for k in ("awg", "gauges", "cable_mm2", "stud_mm", "wire_mm2_colour_code")) and "battery terminal" not in (r.get("kind") or "") and "accessory" not in (r.get("kind") or ""): out.append("size_null")
    elif cat == "cable":
        if not any(r.get(k) for k in ("awg", "conductor_mm2", "sizes", "size_label")): out.append("size_null")
        if not r.get("material"): out.append("material_null")
        if r.get("length_m") is None and not r.get("sizes") and not r.get("length_note") and not r.get("note") and "per metre" not in (r.get("title") or "").lower(): out.append("length_null")
    elif cat == "capacitors":
        if r.get("farads") is None: out.append("farads_null")
        if r.get("voltage_v") is None: out.append("voltage_null")
    return out

def run():
    per_cat = collections.defaultdict(collections.Counter); per_brand = collections.defaultdict(collections.Counter); ids = collections.defaultdict(list); totals = collections.Counter()
    for cat in CATS:
        for f in sorted(glob.glob(f"/workspace/data/parts_raw/{cat}/*.json")):
            d = json.load(open(f)); b = f.split("/")[-1][:-5]
            seen = set()
            for r in d["records"]:
                totals[cat] += 1; per_brand[(cat, b)]["records"] += 1
                iss = issues(cat, r)
                k = dup_key(cat, r)
                if k in seen: iss.append("duplicate")
                seen.add(k)
                if iss and not (r.get("check") or "").strip(): iss.append("unflagged")
                if iss: per_cat[cat]["not_clean"] += 1; per_brand[(cat, b)]["not_clean"] += 1
                for i in iss: per_cat[cat][i] += 1; per_brand[(cat, b)][i] += 1; ids[i].append(f"{cat}/{b}:{r['id']}")
    return totals, per_cat, per_brand, ids

if __name__ == "__main__":
    totals, per_cat, per_brand, ids = run()
    for cat in CATS:
        c = per_cat[cat]; print(f"{cat}: {totals[cat]} records, not clean {c['not_clean']}: " + ", ".join(f"{k} {v}" for k, v in sorted(c.items()) if k != "not_clean"))
    if "--brands" in sys.argv:
        for (cat, b), c in sorted(per_brand.items()):
            if c["not_clean"]: print(f"  {cat}/{b}: {c['records']} rec, not clean {c['not_clean']}: " + ", ".join(f"{k} {v}" for k, v in sorted(c.items()) if k not in ("records", "not_clean")))
    if "--list" in sys.argv: print("\n".join(ids[sys.argv[sys.argv.index("--list") + 1]]))
    if "--json" in sys.argv:
        json.dump({"totals": totals, "per_category": per_cat, "per_brand": {f"{c}/{b}": v for (c, b), v in per_brand.items()}}, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
    print("unflagged total:", sum(per_cat[c]["unflagged"] for c in CATS))
