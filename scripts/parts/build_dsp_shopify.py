#!/usr/bin/env python3
"""R3: DSPs / line output converters / bass processors / amp+DSP from a maker Shopify store. Usage: build_dsp_shopify.py audiocontrol"""
import sys, re; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
CFG = {"audiocontrol": ("www.audiocontrol.com", "AudioControl", lambda p: p["product_type"] in ("Digital Signal Processor", "Factory System Upgrade", "Line Driver", "Crossover Network"))}
key = sys.argv[1]; site, brand, sel = CFG[key]; recs = []
for p in shopify_products(site):
    if not sel(p): continue
    t = clean(p["body_html"]); url = f"https://{site}/products/{p['handle']}"; full = p["title"] + "|" + t
    def g(rx, f=float):
        m = re.search(rx, t, re.I); return f(m.group(1)) if m else None
    cd = re.search(r"(?i)current draw[^|:]*:?\s*([\d.]+)\s*(mA|A)\b", t)
    model = re.match(r"^(?:The\s+)?([A-Z][A-Za-z0-9.-]+(?:\s?PRO)?)", p["title"])
    kind = "amp+DSP" if re.search(r"(?i)amplifier", p["title"]) else ("DSP" if re.search(r"(?i)\bDSP\b|matrix", full[:400]) and not re.search(r"(?i)line output converter", p["title"]) else
            ("line output converter" if re.search(r"(?i)line output|LOC", p["title"]) else ("bass restoration processor" if re.search(r"(?i)bass restoration", p["title"]) else p["product_type"].lower())))
    chm = re.search(r"(\d+)-Channel", p["title"])
    recs.append({"id": f"{key}-{p['handle']}"[:90], "model": model.group(1) if model else None, "title": p["title"], "status": "listed on maker store " + TODAY, "kind": kind,
                 "channels_title": int(chm.group(1)) if chm else None,
                 "speaker_level_inputs_ch": g(r"speaker[- ]level inputs?\s*\(?(\d+) channels", int) or g(r"Speaker Level Input:\s*\d+\s*\((\d+) channels", int),
                 "preamp_inputs": g(r"(\d+)\s*preamp inputs", int) or g(r"Preamp Inputs?:\s*(\d+)", int), "preamp_outputs": g(r"(\d+)\s*(?:assignable\s*)?preamp outputs", int) or g(r"Preamp Outputs?:\s*(\d+)", int),
                 "eq_bands": g(r"(\d+)[\s-]band", int), "crossover_slopes_db_oct": sorted({int(x) for x in re.findall(r"(\d{2}) dB/octave", t)}) or None,
                 "max_output_vrms": g(r"Maximum Output Level:\s*([\d.]+)\s*Vrms"), "current_draw_a": (float(cd.group(1)) / 1000 if cd.group(2).lower() == "ma" else float(cd.group(1))) if cd else None,
                 "fuse_a": g(r"Recommended Fuse Rating:\s*([\d.]+)\s*A") or fuse_a(t), "dims_mm": dims_in(t), "amp_rms_ratings": ratings(t) if kind == "amp+DSP" else None,
                 "prices_aud": [], "prices_other": [{"supplier": f"{brand} store (US)", "price": sorted({float(x["price"]) for x in p["variants"]}), "currency": "USD", "url": url, "read_date": TODAY}],
                 "sources": [{"fields": ["all numeric fields"], "url": url, "read_date": TODAY, "tier": "maker-store", "doc": f"https://{site}/products.json (body_html)"}],
                 "check": "auto-parsed from the maker store text; verify against the manual"})
write("dsp", key, {"brand": brand, "maker_site": f"https://{site}", "method": "maker Shopify store products.json body text; scripts/parts/build_dsp_shopify.py", "terms_note": "Numbers only with URL.", "units": {"current_draw_a": "A", "dims_mm": "mm"}}, recs)
