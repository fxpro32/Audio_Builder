#!/usr/bin/env python3
"""R3: Taramps amplifiers from taramps.com.br (English pages): power per load at 14.4 VDC, efficiency, rest / music / sine current, dims.
Writes data/parts_raw/amplifiers/taramps.json (maker tier) and keeps the US-store records (build_amps_shopify.py taramps) for prices only."""
import sys, re, os, json; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
D = f"{RAW}/pages/taramps"; urls = {re.sub(r"/+$", "", u.strip()).split("/")[-1]: u.strip() for u in open(f"{D}/list.txt") if u.strip()}
recs, skipped = [], []
for slugn, url in urls.items():
    n = slugn
    f = f"{D}/p_{n}.html"
    if not os.path.exists(f): continue
    raw = open(f, errors="replace").read(); t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I))
    i = t.find("Technical information"); s = t[i:i + 3000] if i >= 0 else ""
    if "Number of Channels" not in s and "Maximum power" not in s: skipped.append({"title": n, "reason": "no amplifier spec table (not an amplifier or page differs)"}); continue
    def val(lab):
        m = re.search(r"\|" + re.escape(lab) + r"\|([^|]*)", s, re.I); return m.group(1).strip() if m else None
    def amps(lab):
        v = val(lab); m = re.search(r"([\d.,]+)\s*A", v or ""); return float(m.group(1).replace(",", ".")) if m else None
    rat = []
    for m in re.finditer(r"@\s*([\d.]+)\s*VDC\s*-\s*([\d.,]+)\s*Ohms?\s*(\([^)]*\))?\s*:\s*(?:(\d+)\s*[xX]\s*)?([\d.,]+)\s*Watts\s*RMS", s):
        w = float(m.group(5).replace(".", "").replace(",", ".")) if re.search(r"\.\d{3}", m.group(5)) else float(m.group(5).replace(",", "."))
        rat.append({"w_per_ch": w, "channels": int(m.group(4)) if m.group(4) else None, "ohm": float(m.group(2).replace(",", ".")), "bridged": bool(m.group(3) and re.search(r"(?i)bridg", m.group(3))), "group": (m.group(3) or "").strip("() ") or None, "voltage_v": float(m.group(1))})
    vnom = re.search(r"Nominal Power @\s*([\d.,]+)\s*VDC", s); Vn = float(vnom.group(1).replace(",", ".")) if vnom else None
    if not rat and vnom:
        blk = s[vnom.end():]; blk = blk[:blk.find("|Number of Channels")] if "|Number of Channels" in blk else blk[:600]
        bridged = False
        for seg in blk.split("|"):
            if re.search(r"(?i)bridged", seg) and not re.search(r"(?i)W\s*RMS", seg): bridged = True; continue
            m = re.match(r"\s*([\d.,]+)\s*Ohms?:\s*([\d.,]+)\s*W\s*RMS(?:\s*\((\d+)\s*x\s*([\d.,]+)\s*W)?", seg, re.I)
            if m:
                ohm = float(m.group(1).replace(",", ".")); n = int(m.group(3)) if m.group(3) else 1; wv = m.group(4) or m.group(2)
                w = float(re.sub(r"[.,]", "", wv)) if re.fullmatch(r"\d{1,3}([.,]\d{3})+", wv) else float(wv.replace(",", "."))
                rat.append({"w_per_ch": w, "channels": n, "ohm": ohm, "bridged": bridged, "group": None, "voltage_v": Vn})
    if not rat:
        rat = [dict(x, voltage_v=None) for x in ratings(s) if not x["bridged"]]
    if not rat:
        mp = re.search(r"\|Maximum power\|([\d.,]+)\s*W\s*RMS", s); mo = re.search(r"Minimum Output Impedance\|([\d.,]+)", s, re.I)
        if mp and mo: rat.append({"w_per_ch": float(mp.group(1).replace(",", "")), "channels": 1, "ohm": float(mo.group(1).replace(",", ".")), "bridged": False, "group": "maker 'Maximum power' at minimum impedance", "voltage_v": None})
    eff = val("Efficiency"); dm = val("Dimensions (WxHxD)"); h1 = re.search(r"<h1[^>]*>(.*?)</h1>", raw, re.S); title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", h1.group(1)))).strip() if h1 else html.unescape((re.search(r"<title>(.*?)</title>", raw, re.S) or [None, n])[1]).split("|")[0].strip()
    title = re.sub(r"(?i)^\(PT\)\s*|^(?:amplificador(?: profissional)?|processador de áudio)\s+|\s+amplificador(?: profissional)?$", "", title).replace("\u2013", "-").strip()
    if re.search(r"(?i)processador|processor|amplayer", title) or re.search(r"(?i)processador|amplayer", slugn): skipped.append({"title": title, "reason": "audio processor (DSP category), not an amplifier"}); continue
    chs = val("Number of Channels")
    recs.append({"id": f"taramps-{slugn}", "model": slugn.upper() if (not title or title.lower() == "taramps") else title, "model_basis": "page address" if (not title or title.lower() == "taramps") else "maker page title (h1)", "title": title, "status": "maker page " + TODAY, "class": val("Operation class"),
                 "channels": int(re.sub(r"\D", "", chs)) if chs and re.sub(r"\D", "", chs) else None, "rms_ratings": rat, "rated_voltage_v": rat[0]["voltage_v"] if rat else None, "cta2006": None,
                 "min_load_ohm": (lambda m: float(m.group(1).replace(",", ".")) if m else None)(re.search(r"([\d.,]+)\s*ohm", val("Minimum Output Impedance") or "", re.I)),
                 "efficiency_pct": [{"pct": float(a.replace(",", ".")), "ohm": (float(b.replace(",", ".")) if b else None)} for a, b in re.findall(r"([\d]+(?:[.,]\d+)?)\s*%(?:\s*@\s*([\d.,]+)\s*Ohm)?", eff)] if eff else None,
                 "current_draw_rest_a": amps("Consumption at rest"), "current_draw_music_max_a": amps("Maximum music consumption"), "current_draw_max_sine_a": amps("Maximum consumption in sinusoidal signal"),
                 "current_draw_basis": "maker labels: consumption at rest / maximum music consumption / maximum consumption in sinusoidal signal (voltage not stated; power rated at 14.4 VDC)",
                 "supply_voltage_range_v": [val("Minimum Supply Voltage"), val("Maximum Supply Voltage")],
                 "dims_mm": {"mm": [float(x) for x in re.findall(r"[\d.]+", dm.split("mm")[0])][:3], "order": "W x H x D"} if dm and "mm" in dm else None,
                 "prices_aud": [], "prices_other": [], "sources": [{"fields": ["all values"], "url": url, "read_date": TODAY, "tier": "maker"}],
                 "check": "parsed from the maker 'Technical information' table by scripts/parts/build_taramps_br.py", "notes": ""})
# keep US-store prices (USD) for matching model names
try:
    us = json.load(open(f"{OUT}/amplifiers/taramps.json"))
    if "Technical information" not in us.get("method", ""):
        json.dump(us, open(f"{RAW}/taramps_us_store_records.json", "w"), indent=1)
except Exception: pass
write("amplifiers", "taramps", {"brand": "Taramps", "maker_site": "https://www.taramps.com.br/en/", "method": "maker product pages (English) from https://www.taramps.com.br/pt/produto-sitemap.xml, 'Technical information' table, 3 s apart; scripts/parts/build_taramps_br.py",
      "terms_note": "Numbers only with URL. Brazilian maker; US-store listing (tarampsusa.com) kept in references/raw/parts/taramps_us_store_records.json for USD prices.", "units": {"w_per_ch": "W RMS at 14.4 VDC", "current_*": "A"}}, recs, skipped)
