#!/usr/bin/env python3
"""R3: DS18 power/signal accessories from the maker Shopify store (titles + body numbers). USD maker-store prices.
Writes data/parts_raw/{cable,wiring_kits,fuses,distribution,terminals,interconnects,batteries,dsp}/ds18.json"""
import sys, re, math; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
SITE = "www.ds18.com"; FT = 0.3048
def awg(s):
    s = s.replace("1X0", "1/0").replace("2X0", "2/0")
    return {"1/0": "1/0", "0": "1/0", "2/0": "2/0"}.get(s, s)
def awg_mm2(g):
    n = {"1/0": 0, "2/0": -1, "3/0": -2, "4/0": -3}.get(g); n = int(g) if n is None else n
    d = 0.127 * 92 ** ((36 - n) / 39); return round(math.pi / 4 * d * d, 2)
out = {k: [] for k in ("cable", "wiring_kits", "fuses", "distribution", "terminals", "interconnects", "batteries", "dsp")}
for p in shopify_products(SITE):
    t = p["title"]; v = (p.get("vendor") or "").strip(); body = clean(p["body_html"]); url = f"https://{SITE}/products/{p['handle']}"
    prices = sorted({float(x["price"]) for x in p["variants"]}); pt = p["product_type"]
    base = {"id": f"ds18-{p['handle']}"[:90], "model": v if re.match(r"^[A-Z0-9][A-Z0-9./-]{2,}$", v) else None, "title": t, "status": "listed on maker store " + TODAY,
            "prices_aud": [], "prices_other": [{"supplier": "DS18 store (US)", "price": prices, "currency": "USD", "url": url, "read_date": TODAY}],
            "sources": [{"fields": ["title/body values"], "url": url, "read_date": TODAY, "tier": "maker-store", "doc": f"https://{SITE}/products.json (title, body_html)"}]}
    mat = "OFC" if re.search(r"OFC|Oxygen", t + body[:600]) and "CCA" not in t else ("CCA" if re.search(r"CCA|Copper[- ]Clad", t + body) else None)
    strands = re.search(r"Strand Count:?\s*\|?\s*(\d+)\s*[xX×]\s*([\d.]+)\s*mm", body)
    m = re.match(r"(?:DS18 \S+ )?(\d+/\d|\d+)-GA .*?(Ground|Power|Speaker|Remote)[^,]*?(?:Cable|Wire)[^\d]*?(\d+) (?:Ft|Feet)", t, re.I)
    if pt in ("Car Audio : Wires", "Marine And Off Road : Wires") and m and not re.search(r"(?i)kit\b(?! *-)", t.replace("Ft Red Kit", "")):
        g = awg(m.group(1)); L = int(m.group(3)); kind = {"ground": "power/ground", "power": "power/ground", "speaker": "speaker", "remote": "remote/primary"}[m.group(2).lower()]
        rec = {**base, "kind": kind, "awg": g, "awg_nominal_mm2": awg_mm2(g), "material": mat, "length_m": round(L * FT, 2), "length_ft": L,
               "strands": int(strands.group(1)) if strands else None, "strand_d_mm": float(strands.group(2)) if strands else None,
               "actual_area_mm2_from_strands": round(int(strands.group(1)) * math.pi / 4 * float(strands.group(2)) ** 2, 2) if strands else None,
               "maker_power_range_w": [int(x) for x in re.search(r"(\d{3,5})\s*[–-]\s*(\d{3,5})\s*W", body).groups()] if re.search(r"(\d{3,5})\s*[–-]\s*(\d{3,5})\s*W", body) else None,
               "price_per_m_usd": round(prices[0] / (L * FT), 2)}
        if re.search(r"5 ?Ft Black and 20 ?Ft Red|5ft Black And 20ft Red", t, re.I): rec.update(length_m=None, length_ft=None, price_per_m_usd=None, note="kit: 5 ft black + 20 ft red")
        out["cable"].append(rec); continue
    if re.search(r"(?i)installation (wiring )?kit|wiring kit|power harness kit", t):
        g = re.search(r"(\d+/\d|\d+)-Ga", t, re.I)
        out["wiring_kits"].append({**base, "kind": "amp wiring kit", "awg": awg(g.group(1)) if g else None, "material": mat}); continue
    if re.search(r"(?i)fuse holder|fuse block|FDG", t) or v.startswith("FH") or v.startswith("ANLFH") or v == "PSFHDB4":
        ft = "ANL" if re.search(r"(?<!Mini )ANL", t) and "AFS" not in t else ("AFS / mini ANL" if re.search(r"AFS|Mini ANL", t) else ("AGU" if "AGU" in t else None))
        ins = re.findall(r"(\d+)\s*[xX]\s*(\d+/?\d?)-?\s*GA\s*(In|Out)", t.replace("1X0-GA", "1 X 0-GA"), re.I) or re.findall(r"(\d)[xX]\s?(\d+)\s*GA\s*(In|Out)", t + " " + body)
        fa = re.search(r"(\d{2,3})\s*A(?:mp)?\b", t); n_out = re.search(r"(\d)\s*[xX]\s*\d+\s*-?GA\s*Out", t + body, re.I)
        out["fuses"].append({**base, "kind": "fuse holder" + (" / distribution" if re.search(r"(?i)distribution|DB", t + v) else ""), "fuse_type": ft,
                             "inputs_outputs": [{"count": int(a), "awg": awg(b), "dir": c.lower()} for a, b, c in ins] or None, "fuse_included_a": int(fa.group(1)) if fa else None}); continue
    if re.search(r"(?i)distribution (bar )?block", t):
        io = re.findall(r"(\d+)\s*[xX]\s*(\d+/\d|\d+)-?GA\s*(In|Out)?", t.replace("1X0-GA", "1 X 0-GA").replace("2 X 0-GA", "2 X 0-GA"), re.I)
        out["distribution"].append({**base, "kind": "distribution block", "ports": [{"count": int(a), "awg": awg(b), "dir": (c or "").lower() or None} for a, b, c in io] or None}); continue
    if re.search(r"(?i)ring terminals|input reducers", t):
        g = re.findall(r"(\d+/\d|\d+)-Ga", t, re.I); pk = re.search(r"Pack of (\d+)", t)
        out["terminals"].append({**base, "kind": "ring terminal" if "Ring" in t else "amp input reducer", "awg": [awg(x) for x in g], "pack_qty": int(pk.group(1)) if pk else None}); continue
    if re.search(r"\bRCA\b", t) and pt.endswith("Wires") or v.startswith("R") and "RCA" in t:
        L = re.search(r"(\d+(?:\.\d)?) (?:Feet|Foot|FT)", t, re.I); pk = re.search(r"(\d+) Pack", t)
        out["interconnects"].append({**base, "kind": "RCA " + ("Y connector" if re.search(r"(?i)Y Connector|Y-", t) else "cable"), "length_m": round(float(L.group(1)) * FT, 2) if L else None, "level": (re.search(r"Level (\d)", t) or [None, None])[1], "pack_qty": int(pk.group(1)) if pk else 1}); continue
    if pt == "Batteries" or v.startswith("INF-"):
        if not re.search(r"(?i)battery|power cell", t) or re.search(r"(?i)charger|maintainer|kit|mount", t): continue
        ah = re.search(r"(\d+)\s*AH", t, re.I); w = re.search(r"(\d{3,5})\s*Watts", t + " " + body); cca = re.search(r"(?i)(\d{3,5})\s*(?:CCA|cold cranking)", body)
        cont = re.search(r"(?i)(\d{2,4})\s*A continuous", body); dims = re.search(r"([\d.]+)”\s*x\s*([\d.]+)”\s*x\s*([\d.]+)”", body)
        out["batteries"].append({**base, "chemistry": "LiFePO4" if re.search(r"(?i)lifepo4|lithium", t + body) else ("AGM" if "AGM" in t else None), "capacity_ah": int(ah.group(1)) if ah else None,
                                 "maker_watts_rating": int(w.group(1)) if w else None, "cca_a": int(cca.group(1)) if cca else None, "continuous_discharge_a": int(cont.group(1)) if cont else None,
                                 "dims_mm": [round(float(x) * 25.4, 1) for x in dims.groups()] if dims else None, "voltage_v": 12}); continue
    if pt == "Car Audio : Processor" and re.search(r"(?i)DSP|Sound Processor|crossover|equalizer|converter|bass processor|line driver", t):
        io = re.search(r"(\d+)-Channel In and (\d+)-Channel Out", t) or re.search(r"(\d+)-Channel In.*?(\d+)-Channel Out", t)
        bands = re.search(r"(\d+)[ -]band", body + " " + t, re.I)
        chs = re.search(r"(?i)(\d+)[\s-]*Channel", t)
        out["dsp"].append({**base, "channels_title": int(chs.group(1)) if chs else None, "kind": "DSP" if re.search(r"(?i)DSP|Sound Processor", t) else ("amp+DSP" if "Amplifier" in t else "signal processor (EQ / crossover / line output converter)"),
                           "inputs": int(io.group(1)) if io else None, "outputs": int(io.group(2)) if io else None, "eq_bands": int(bands.group(1)) if bands else None,
                           "bluetooth": bool(re.search(r"(?i)bluetooth|\bBT\b", t))}); continue
meta = {"brand": "DS18", "maker_site": "https://www.ds18.com", "method": "maker's own Shopify store, products.json (title, vendor field = model, body numbers); scripts/parts/build_ds18_accessories.py",
        "terms_note": "Numbers only, URL per record; USD maker-store prices.", "units": {"length_m": "m (converted from feet)", "awg_nominal_mm2": "mm2 for the stated AWG (ASTM B258 formula), NOT measured", "actual_area_mm2_from_strands": "mm2 = strands x pi/4 x d^2 from the maker strand count"}}
for k, recs in out.items(): write(k, "ds18", meta, recs)
