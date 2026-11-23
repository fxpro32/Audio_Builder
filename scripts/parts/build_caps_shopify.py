#!/usr/bin/env python3
"""R3B: power capacitors / ultracapacitors from maker Shopify dumps already saved (Audiopipe, Boss Audio, Sundown). Numbers from title + body text:
farads, rated / max / surge voltage, ESR as published. Writes data/parts_raw/capacitors/<brand>.json (maker-store tier, USD)."""
import sys, re; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
CFG = {"audiopipe": ("www.audiopipe.com", "Audiopipe"), "boss-audio": ("www.bossaudio.com", "Boss Audio Systems"), "sundown": ("sundownaudio.com", "Sundown Audio")}
for key, (site, brand) in CFG.items():
    recs, skipped = [], []
    for p in shopify_products(site):
        t = p["title"]; body = clean(p["body_html"]); full = t + "|" + body
        if not re.search(r"(?i)capacitor|\bfarad\b|super ?cap|ultra ?cap", t + " " + (p.get("product_type") or "")) or re.search(r"(?i)blocking|bracket|mount\b|cover|\d+\s*AH\b|deep cycle", t): continue
        url = f"https://{site}/products/{p['handle']}"
        sku = (p["variants"][0].get("sku") or "").strip(); mdl, mb = model_pick(t, [sku] if sku else [])
        if mdl is None and sku: mdl, mb = sku, "maker SKU"
        f = re.search(r"(?i)(\d+(?:\.\d+)?)\s*farads?\b", full) or re.search(r"(?i)\((\d+(?:\.\d+)?)\s*F(?:arad)?\)", full)
        uf = re.search(r"(?i)capacitance:?\s*([\d,]{7,})\s*(?:µF|μF|uF)?", full)
        far = float(f.group(1)) if f else (int(uf.group(1).replace(",", "")) / 1e6 if uf else None)
        rated = re.search(r"(?i)rated voltage:?\s*(\d+(?:\.\d+)?)\s*V", full); vmax = re.search(r"(?i)max(?:imum)?\.? voltage:?\s*(\d+(?:\.\d+)?)\s*V|VDC:?\s*(\d+(?:\.\d+)?)\s*V\s*Max", full)
        surge = re.search(r"(?i)(\d+(?:\.\d+)?)\s*V(?:olt)?\s*surge|(\d+)[\s-]*volt surge", full)
        esr = re.search(r"(?i)(?:E\.?S\.?R\.?[^:|]{0,40}:?\s*<?\s*|\|)(\d*\.\d+)\s*(m?Ω|ohms?|mW|mΩ)(?:\s*or less)?", full)
        cur = re.search(r"(?i)([\d,]{3,6})\s*max amp output|up to\s*([\d,]{3,6})\s*amps", full); wsup = re.search(r"(?i)up to (?:a )?([\d,]{3,6})[\s-]*watt", full)
        recs.append({"id": f"{key}-{p['handle']}"[:90], "model": mdl, "model_basis": mb, "title": t, "status": "listed on maker store " + TODAY,
                     "kind": "ultracapacitor / hybrid" if re.search(r"(?i)ultra ?cap|super ?cap|hybrid", full) else "power capacitor",
                     "farads": far, "voltage_v": float(rated.group(1)) if rated else (float(vmax.group(1) or vmax.group(2)) if vmax else None),
                     "voltage_basis": "rated voltage" if rated else ("maximum voltage" if vmax else None),
                     "voltage_max_v": float(vmax.group(1) or vmax.group(2)) if vmax else None, "voltage_surge_v": float(surge.group(1) or surge.group(2)) if surge else None,
                     "esr_as_published": (esr.group(0).strip("|: ")[:60]) if esr else None,
                     "esr_mohm": (float(esr.group(1)) * (1000 if esr.group(2).lower() in ("ω", "ohm", "ohms") else 1)) if esr and esr.group(2).lower() != "mw" else None,
                     "max_current_a_maker": int((cur.group(1) or cur.group(2)).replace(",", "")) if cur else None, "recommended_amp_power_w": int(wsup.group(1).replace(",", "")) if wsup else None,
                     "prices_aud": [], "prices_other": [{"supplier": f"{brand} store (US)", "price": sorted({float(x["price"]) for x in p["variants"]}), "currency": "USD", "url": url, "read_date": TODAY}],
                     "sources": [{"fields": ["title/body values"], "url": url, "read_date": TODAY, "tier": "maker-store", "doc": f"https://{site}/products.json (body_html)"}],
                     "check": "auto-parsed from the maker store text (scripts/parts/build_caps_shopify.py); ESR unit as published (Boss CPRD2 says 'mW', a typo for mohm or ohm, so not converted)", "notes": ""})
    write("capacitors", key, {"brand": brand, "maker_site": f"https://{site}", "method": "maker Shopify store products.json (saved dump), title + body numbers; scripts/parts/build_caps_shopify.py",
          "terms_note": "Numbers only with URL; USD maker-store prices.", "units": {"farads": "F", "voltage_v": "V", "esr_mohm": "milliohm"}}, recs, skipped)
