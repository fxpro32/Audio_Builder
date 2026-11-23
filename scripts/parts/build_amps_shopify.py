#!/usr/bin/env python3
"""R3: amplifier records from a maker's own Shopify store dump (body text numbers only).
Usage: build_amps_shopify.py sundown|american-bass|ampere|audiopipe|cerwin-vega|ds18|taramps"""
import sys, re; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
CFG = {
 "sundown": ("sundownaudio.com", "Sundown Audio", lambda p: "Amplifier" in p["product_type"]),
 "american-bass": ("www.americanbassusa.com", "American Bass", lambda p: re.search(r"(?i)amplifier", p["product_type"] + p["title"]) and not re.search(r"(?i)kit|wire", p["title"])),
 "ampere": ("www.ampereaudio.com", "Ampere Audio", lambda p: re.search(r"(?i)amplifier|amp\b", p["product_type"] + " " + p["title"])),
 "audiopipe": ("www.audiopipe.com", "Audiopipe", lambda p: re.search(r"(?i)amplifier", p["product_type"] + " " + p["title"]) and not re.search(r"(?i)kit|wire|speaker|horn", p["title"])),
 "cerwin-vega": ("cerwinvega.com", "Cerwin-Vega Mobile", lambda p: re.search(r"(?i)amplifier", p["product_type"] + " " + p["title"]) and not re.search(r"(?i)kit|wire", p["title"])),
 "ds18": ("www.ds18.com", "DS18", lambda p: p["product_type"] in ("Car Audio : Amplifier", "Marine And Off Road : Amplifiers")),
 "audiocontrol": ("www.audiocontrol.com", "AudioControl", lambda p: p["product_type"] in ("Amplifier", "Power Amplifiers") or (p["product_type"] == "Digital Signal Processor" and re.search(r"(?i)amplifier", p["title"]))),
 "taramps": ("www.tarampsusa.com", "Taramps", lambda p: re.search(r"(?i)LINE|AMPLAYER", p["product_type"]) and re.search(r"(?i)amplifier", p["title"])),
}
key = sys.argv[1]; site, brand, sel = CFG[key]
P = shopify_products(site); recs, skipped = [], []
for p in P:
    if not sel(p): continue
    if key == "sundown" and (p.get("vendor") or "").strip() and brand.split()[0].lower() not in p["vendor"].lower():
        skipped.append({"title": p["title"], "reason": f"other brand sold on the store (vendor {p['vendor']})"}); continue
    if re.search(r"(?i)stereo integrity", p["title"]) and key != "stereo-integrity":
        skipped.append({"title": p["title"], "reason": "Stereo Integrity product sold on this store (other brand)"}); continue
    if re.search(r"(?i)\b(used|refurbished|yard sale|b-stock|open box)\b", p["title"] + " " + p["handle"]):
        skipped.append({"title": p["title"], "reason": "used/refurbished listing of a model"}); continue
    if re.search(r"(?i)antenna|bass knob|headphone|receiver|\bpre[ -]?amp|plate amplifier|bar cube|hi-fi|streaming|professional power amplifier|replacement amplifier for|\bCV[24]-\d+H\b", p["title"]):
        skipped.append({"title": p["title"], "reason": "not a car amplifier (accessory, home / pro-audio / mains amplifier)"}); continue
    skus = sorted({(x.get("sku") or "").strip() for x in p["variants"] if (x.get("sku") or "").strip()})
    base_skus = sorted({COLOUR_SUFFIX.sub("", re.sub(r"-1$", "", s)) for s in skus})
    if len(base_skus) > 1 and not re.search(r"(?i)\d+\s*ohm", " ".join(x.get("title") or "" for x in p["variants"])):
        # one store page for a whole series: one record per model code, no values assigned (the page text does not say which value belongs to which model)
        for sku in base_skus:
            url0 = f"https://{site}/products/{p['handle']}"
            recs.append({"id": f"{key}-{p['handle']}-{sku.lower()}"[:90], "model": sku, "model_basis": "maker SKU (series page)", "title": p["title"] + " / " + sku, "status": "listed on maker store " + TODAY,
                         "class": None, "channels": None, "rms_ratings": [], "rated_voltage_v": None, "cta2006": None, "min_load_ohm": None, "fuse_onboard_a": None, "dims_mm": None,
                         "prices_other": [], "prices_aud": [], "series_listing": True,
                         "sources": [{"fields": ["model code"], "url": url0, "read_date": TODAY, "tier": "maker-store", "doc": f"https://{site}/products.json (variants)"}],
                         "check": "series page listing several models; values not assigned per model (see the model's own page / manual)", "notes": ""})
        continue
    t = clean(p["body_html"]); full = p["title"] + "|" + t
    rat = ratings(t) or ratings(p["title"])
    url = f"https://{site}/products/{p['handle']}"
    cls = "D" if re.search(r"(?i)class[\s-]*d\b|class_d", full + " ".join(tags(p))) else ("AB" if re.search(r"(?i)class[\s-]*a/?b\b", full) else None)
    if key == "ds18" and re.match(r"^[A-Z0-9][A-Z0-9./-]{1,}$", (p.get("vendor") or "").strip()): mdl, mbasis = p["vendor"].strip(), "maker SKU (store vendor field)"
    elif key == "taramps": mdl, mbasis = model_pick(re.sub(r"(?i)^taramps\s+", "", p["title"]), [])
    else: mdl, mbasis = model_pick(p["title"], base_skus[:1] if len(base_skus) == 1 else [])
    model = type("M", (), {"group": lambda self, i, v=mdl: v})() if mdl else None
    chm = re.search(r"(?i)(\d)[\s-]*(?:ch\b|channel)", p["title"]) or re.search(r"(?i)(\d)[\s-]*channel", t)
    ch = int(chm.group(1)) if chm else (1 if re.search(r"(?i)mono", p["title"]) else None)
    sfx = re.search(r"\b\d{2,5}\.(\d)(?:[A-Za-z]{0,3}\d?)?\b", (mdl or "") + " " + p["title"]) or re.search(r"\b\d{3,5}[xX](\d)\b", (mdl or "") + " " + p["title"])
    if ch is None and sfx and 0 < int(sfx.group(1)) <= 8: ch = int(sfx.group(1))
    if ch is None and re.search(r"(?i)\bmono[\s-]?block\b|\bmono (?:amp|amplifier)\b|single[\s-]channel|\b1[\s-]channel", t) and not re.search(r"(?i)\b[2-8][\s-]*(?:ch\b|channel)", t): ch = 1
    if ch is None and rat and [x for x in rat if not x["bridged"]] and all(x["channels"] in (1, None) for x in rat if not x["bridged"]) and (re.search(r"(?i)\.1D?\b|mono", p["title"]) or all(x["channels"] == 1 for x in rat if not x["bridged"])): ch = 1
    conf = {}
    for x in rat:
        k = (x["ohm"], x["channels"], x["group"], x["bridged"]); conf.setdefault(k, set()).add(x["w_per_ch"])
    conflicts = [f"{k[0]} ohm x{k[1]}: {sorted(v)} W" for k, v in conf.items() if len(v) > 1]
    v = re.search(r"(?i)(?:@|at)\s*(1[2-4](?:\.\d)?)\s*V", t)
    prices = sorted({float(x["price"]) for x in p["variants"] if x.get("price")})
    fields = [f for f, val in (("rms_ratings", rat), ("class", cls), ("channels", ch)) if val]
    r = {"id": f"{key}-{p['handle']}"[:90], "model": model.group(1) if model else None, "model_basis": mbasis, "title": p["title"], "status": "listed on maker store " + TODAY,
         "class": cls, "channels": ch, "rms_ratings": rat, "rated_voltage_v": float(v.group(1)) if v else None, "cta2006": True if re.search(r"(?i)CTA[- ]?2006|CEA[- ]?2006", full) else None,
         "min_load_ohm": min([x["ohm"] for x in rat if not x["bridged"]], default=None), "fuse_onboard_a": fuse_a(t), "dims_mm": dims_in(t),
         "power_wire_awg_maker": (lambda m: ("1/0" if m.group(1) == "0" else m.group(1)) if m else None)(re.search(r"(?i)(\d/0|\d{1,2})[\s-]*(?:gauge|ga|awg)\s*(?:\(.*?\)\s*)?power wire", t)),
         "power_wire_note": (lambda m: m.group(0)[:160] if m else None)(re.search(r"(?i)(?:one|two|three|four|\d)\s+\d?/?\d+[\s-]*gauge power wires?[^|]{0,120}", t)),
         "fuse_at_battery_note": (lambda m: m.group(0)[:160] if m else None)(re.search(r"(?i)\d{2,3}[\s-]*amp fuse installed within \d+ inches[^|]{0,60}", t)),
         "current_draw_a": (lambda m: (float(m.group(1)) / 1000 if m.group(2).lower() == "ma" else float(m.group(1))) if m else None)(re.search(r"(?i)current draw[^|:]*:?\s*\|?\s*([\d.]+)\s*(mA|A)\b", t)), "efficiency_pct": None,
         "prices_other": [{"supplier": f"{brand} store (US)", "price": prices, "currency": "USD", "url": url, "read_date": TODAY}] if prices else [],
         "prices_aud": [],
         "sources": [{"fields": fields + [f for f in ("fuse_onboard_a", "dims_mm") if True], "url": url, "read_date": TODAY, "tier": "maker-store", "doc": f"https://{site}/products.json (body_html)"}],
         "check": "auto-parsed from the maker store text by regex; spot-checked samples only (see research_i); verify against the maker manual before relying on a value", "notes": ("maker text gives different power for the same load, check the manual: " + "; ".join(conflicts) + "; " if conflicts else "") + ("" if rat else "no RMS table in the store text; ") + ("" if cls else "class not stated in store text")}
    if r["fuse_onboard_a"] is None: r["sources"][0]["fields"].remove("fuse_onboard_a")
    if r["dims_mm"] is None: r["sources"][0]["fields"].remove("dims_mm")
    recs.append(r)
meta = {"brand": brand, "maker_site": f"https://{site}", "method": "maker's own Shopify store, public products.json, body text and titles; numbers only (values parsed by scripts/parts/build_amps_shopify.py, spot-checked)",
        "terms_note": "Numbers (facts) only with source URL; no text, images or PDFs copied. Store prices are USD maker-store prices on the read date.",
        "units": {"w_per_ch": "W RMS per channel", "ohm": "ohm load per channel (bridged = load across the bridged pair)", "dims_mm": "mm, converted from inches when published in inches"}}
write("amplifiers", key, meta, recs, skipped)
