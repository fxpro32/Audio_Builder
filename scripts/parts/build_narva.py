#!/usr/bin/env python3
"""R3: Narva (Australian maker, narva.com.au Shopify store, AUD RRP) cable, fuses, circuit breakers, holders, lugs, bus bars.
Values from product titles + variant SKU/price only (the body text is generic prose). Writes data/parts_raw/{cable,fuses,terminals,distribution}/narva.json"""
import sys, re; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
SITE = "www.narva.com.au"
AUTO_MM_TO_MM2 = {"2": None, "2.5": None, "3": 1.13, "4": 1.84, "5": 2.9, "6": 4.59}  # retailer table, see SRC_TABLE
SRC_TABLE = "https://www.solar4rvs.com.au/buying/buyer-guides/cable-size-conversion-tables-mm-mm2-b_s-awg"
def awg_mm2(g):
    import math; n = {"1/0": 0, "2/0": -1, "3/0": -2, "4/0": -3}.get(g, None); n = int(g) if n is None else n
    d = 0.127 * 92 ** ((36 - n) / 39); return round(math.pi / 4 * d * d, 2)
P = shopify_products(SITE); out = {"cable": [], "fuses": [], "terminals": [], "distribution": []}
for p in P:
    t = p["title"]; v = p["variants"][0]; sku = v.get("sku"); price = float(v["price"]); url = f"https://{SITE}/products/{p['handle']}"
    src = [{"fields": ["title values", "price_aud", "sku"], "url": url, "read_date": TODAY, "tier": "maker-store", "doc": f"https://{SITE}/products.json"}]
    pr = [{"supplier": "Narva (maker RRP, narva.com.au)", "price_aud": price, "url": url, "read_date": TODAY, "note": "AUD as listed on the maker store"}]
    base = {"id": f"narva-{sku}", "model": sku, "title": t, "status": "listed on maker store " + TODAY, "prices_aud": pr, "sources": src}
    m = re.match(r"(\d+)A (?:(Marine) )?(?:(Red|Black|Red/Black|[A-Za-z/ ]+?) )?(\d+(?:\.\d)?) ?(mm|B&S) (.*?)(?: ?- ?(\d+)m)?$", t)
    if m and re.search(r"(?i)cable", t):
        amps, marine, colour, size, unit, kind, length = m.groups()
        mc = re.search(r"(\d+) Core", kind); cores = int(mc.group(1)) if mc else (2 if re.search(r"(?i)twin|figure 8", kind) else 1)
        r = {**base, "kind": "speaker" if "Speaker" in kind else ("battery/starter" if re.search(r"(?i)battery|starter", kind) else "automotive"),
             "size_label": f"{size} {unit}", "awg": int(size) if unit == "B&S" else None,
             "conductor_mm2": awg_mm2(size) if unit == "B&S" else AUTO_MM_TO_MM2.get(size),
             "conductor_mm2_basis": ("AWG/B&S nominal area from the ASTM B258 diameter formula (maker gives no mm2)" if unit == "B&S" else
                                     ("AU auto-cable 'mm' label = overall size, not area; conductor area from the retailer conversion table " + SRC_TABLE if AUTO_MM_TO_MM2.get(size) else "not published")),
             "cores": cores, "material": "copper (OFC per maker page text)", "current_rating_a": int(amps),
             "current_rating_basis": "maker title rating; for B&S battery cable the maker page says 'Amps rating based on a 60% duty cycle for 5 minutes' (not a continuous rating)" if unit == "B&S" else "maker title rating, conditions not stated",
             "marine": bool(marine), "colour": colour, "length_m": int(length) if length else None,
             "price_per_m_aud": round(price / int(length), 2) if length else None}
        out["cable"].append(r); continue
    m = re.match(r"(\d+)A (ANL|ANS \(Midi\) (\d)mm|ANM \(Mega\)|Maxi Blade|ANG|Bolt-Down Battery) Fuse(?: Strips)? \((?:(\d+) Pack|Box of (\d+))\)", t)
    if m:
        a, kind, stud, pk, box = m.groups(); typ = {"ANL": "ANL", "ANM (Mega)": "MEGA", "Maxi Blade": "MAXI", "ANG": "ANG fuse strip", "Bolt-Down Battery": "bolt-down battery terminal fuse"}.get(kind, "MIDI")
        out["fuses"].append({**base, "kind": "fuse", "fuse_type": typ, "maker_type_name": kind.split(" ")[0] if "Midi" in kind else kind, "rating_a": int(a), "stud_mm": int(stud) if stud else None,
                             "pack_qty": int(pk or box), "price_each_aud": round(price / int(pk or box), 2)}); continue
    m = re.match(r"(\d+)A High Amp (Automatic|Manually) Reset Circuit Breaker", t)
    if m:
        out["fuses"].append({**base, "kind": "circuit breaker", "fuse_type": "high-amp circuit breaker", "reset": "auto" if m.group(2) == "Automatic" else "manual", "rating_a": int(m.group(1))}); continue
    if re.search(r"(?i)(ANL|Midi|Mega|Maxi|Battery) Fuse Holder|Fuse Holder Block|Midi Fuse Wiring Kit|ANL Fuse Holder|Battery Fuse Holder", t):
        g = re.findall(r"(\d+(?:\.\d+)?) ?mm²", t); out["fuses"].append({**base, "kind": "fuse holder", "fuse_type": next((x for x in ("ANL", "Midi", "Mega", "Maxi") if x.lower() in t.lower()), None), "accepts_mm2": [float(x) for x in g] or None}); continue
    m = re.match(r"(\d+)mm² (Straight Barrel )?Cable Lug With (\d+)mm Stud \((\d+) Pack\)", t)
    if m:
        out["terminals"].append({**base, "kind": "cable lug", "barrel": "straight" if m.group(2) else "standard", "cable_mm2": int(m.group(1)), "stud_mm": int(m.group(3)), "pack_qty": int(m.group(4)), "price_each_aud": round(price / int(m.group(4)), 2)}); continue
    m = re.search(r"(\d+) Pole .*Bus Bar|Bus Bar", t)
    if m and re.search(r"(?i)bus bar", t):
        out["distribution"].append({**base, "kind": "bus bar", "poles": int(m.group(1)) if m.group(1) else None}); continue
meta = {"brand": "Narva", "maker_site": "https://www.narva.com.au", "method": "maker's Australian Shopify store, products.json titles, SKUs and AUD prices; parsed by scripts/parts/build_narva.py",
        "terms_note": "Facts only (sizes, ratings, prices) with URL; no text or images copied.", "units": {"price_aud": "AUD inc. GST as listed", "conductor_mm2": "mm2", "current_rating_a": "A"}}
for cat, recs in out.items(): write(cat, "narva", meta, recs)
