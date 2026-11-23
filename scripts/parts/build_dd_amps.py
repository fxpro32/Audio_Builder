#!/usr/bin/env python3
"""R3: DD Audio amplifiers from ddaudio.com 'Model Specs' tables (test voltage, continuous W per load, max current draw, power wire gauge, mm dimensions, MSRP)."""
import sys, re, os; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
D = f"{RAW}/pages/dd"; urls = {re.sub(r"/+$", "", u.strip()).split("/")[-1]: u.strip() for u in open(f"{D}/list.txt") if u.strip()}
recs = []
for n, url in urls.items():
    f = f"{D}/p_{n}.html"
    if not os.path.exists(f): continue
    raw = open(f, errors="replace").read(); t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I))
    i = t.find("Model Specs|Model Specs"); s = t[i:i + 4000] if i >= 0 else ""
    if not s: continue
    def val(lab):
        m = re.search(r"\|" + re.escape(lab) + r"\|([^|]*)", s); return m.group(1).strip() if m else None
    title = html.unescape((re.search(r"<title>(.*?)</title>", raw, re.S) or [None, n])[1]).strip()
    V = val("Test Voltage"); rat = []
    for m in re.finditer(r"\|Continuous Wattage @ ([\d.]+)Ω\|([^|]+)", s):
        ohm = float(m.group(1)); parts = [p.strip() for p in m.group(2).split("/")]; parsed = []
        for p in parts:
            grp = (re.match(r"\(([^)]*)\)", p) or [None, None])[1]; q = re.sub(r"^\([^)]*\)\s*", "", p)
            g = re.match(r"([\d,]+)\s*x\s*([\d,]+)$", q)
            if g:
                a, b = num(g.group(1)), num(g.group(2)); ch, w = (a, b) if a <= 8 and b > 8 else (b, a)
                parsed.append((w, int(ch), grp))
            elif re.match(r"^[\d,]+$", q):
                parsed.append((num(q), 1, grp))
        maxch = max([c for _, c, _ in parsed], default=0)
        for w, ch, grp in parsed:
            rat.append({"w_per_ch": w, "channels": ch, "ohm": ohm, "bridged": len(parsed) > 1 and ch < maxch and grp is None, "group": grp, "voltage_v": float(V) if V else None})
    def fnum(x):
        m = re.search(r"[\d.]+", x or ""); return float(m.group(0)) if m else None
    dmm = val("Dimensions (MM)"); msrp = val("MSRP (USD)")
    recs.append({"id": f"dd-audio-{n}", "model": (re.match(r"([A-Za-z0-9.\-]+)", title) or [None, n.upper()])[1].rstrip(":"), "model_basis": "maker page title", "title": title[:150], "status": ("discontinued per maker site" if re.search(r"(?i)discontinued", t[:3000]) else "maker page " + TODAY),
                 "class": None, "channels": int(fnum(val("Output Channel"))) if fnum(val("Output Channel")) else None, "rms_ratings": rat, "rated_voltage_v": fnum(V),
                 "rating_basis": "maker 'Continuous Wattage' at the stated test voltage; THD not stated on the page", "cta2006": True if re.search(r"(?i)CTA[- ]?2006|CEA[- ]?2006", t) else None,
                 "total_power_w": fnum(val("Total Wattage")), "dynamic_power_w": fnum(val("Dynamic Wattage")),
                 "current_draw_max_a": fnum(val("Max Current Draw")), "current_draw_basis": "maker: maximum possible current draw, not average", "power_wire_awg_accepts": val("Power Wire Gauge In"),
                 "speaker_wire_awg_accepts": val("Speaker Wire Gauge Out"), "operating_voltage": val("Operating Voltage"),
                 "min_load_ohm": min([x["ohm"] for x in rat if not x["bridged"]], default=None),
                 "dims_mm": {"mm": [float(x) for x in re.findall(r"[\d.]+", dmm)][:3], "order": "as published"} if dmm else None,
                 "prices_aud": [], "prices_other": [{"supplier": "DD Audio MSRP", "price": [fnum(msrp)], "currency": "USD", "url": url, "read_date": TODAY}] if fnum(msrp) else [],
                 "sources": [{"fields": ["all values"], "url": url, "read_date": TODAY, "tier": "maker"}], "check": "parsed from the maker Model Specs table by scripts/parts/build_dd_amps.py", "notes": ""})
write("amplifiers", "dd-audio", {"brand": "DD Audio", "maker_site": "https://ddaudio.com", "method": "maker product pages listed at https://ddaudio.com/product-category/amplifiers/ (incl. page 2 and ?inactive), 3 s apart",
      "terms_note": "Numbers only with URL.", "units": {"w_per_ch": "W continuous at test voltage", "current_draw_max_a": "A", "dims_mm": "mm"}}, recs)
