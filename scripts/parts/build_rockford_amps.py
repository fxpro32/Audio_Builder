#!/usr/bin/env python3
"""R3: Rockford Fosgate amplifiers from rockfordfosgate.com product pages (spec table incl. efficiency, current draw, fuse, wire gauge)."""
import sys, re, glob, os; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
D = f"{RAW}/pages/rockford"; recs = []
def after(t, label, n=200):
    i = t.find(label); return t[i + len(label): i + len(label) + n] if i >= 0 else ""
for f in sorted(glob.glob(f"{D}/p_*.html")):
    h = os.path.basename(f)[2:-5]; raw = open(f, encoding="utf-8", errors="replace").read()
    t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I)); i = t.find("|Specifications|Cta") if "|Specifications|Cta" in t else t.rfind("Specifications|")
    s = t[i:i + 4000]
    if "Rated Power" not in s: continue
    title = (re.search(r"<title>(.*?)</title>", raw, re.S) or [None, h])[1].strip()
    rp = after(s, "(RMS Continuous Power)|", 600).split("|Dynamic Power")[0]
    rat = []; strap = False
    for line in rp.split("|"):
        if re.search(r"(?i)bdSYNC|two amplifiers", line): strap = True
        mo = re.search(r"@\s*([\d.]+)\s*(?:Ω|-?Ohms?)", line)
        if not mo: continue
        groups = re.findall(r"([\d,]+|N/A|xxx)\s*(?:Watts|W)\s*x\s*(\d)", line)
        for k, (w, n) in enumerate(groups):
            if not re.match(r"[\d,]+$", w): continue
            rat.append({"w_per_ch": num(w), "channels": int(n), "ohm": float(mo.group(1)), "bridged": "strapped (two amps)" if strap else ("ridged" in line),
                        "group": ("sub channel" if (len(groups) > 1 and k == len(groups) - 1) else ("main channels" if len(groups) > 1 else None)), "voltage_v": 14.4})
    dyn = [{"w_per_ch": num(m.group(1)), "channels": int(m.group(2)), "ohm": float(m.group(3))} for m in re.finditer(r"([\d,]+)\s*(?:Watts|W)\s*x\s*(\d)\s*@\s*([\d.]+)\s*(?:-Ohm|Ω)", after(s, "Dynamic Power", 400).split("|Bridgeable")[0])]
    eblk = after(s, "Efficiency|(average)|", 120).split("|Total Harmonic")[0]
    eff = [(float(a), float(b)) for a, b in re.findall(r"([\d.]+)%\s*@\s*([\d.]+)\s*(?:-Ohm|Ω)", eblk)] or [(float(a), None) for a in re.findall(r"([\d.]+)%", eblk)]
    def num_after(label, unit="A"):
        seg = after(s, label, 80)
        seg = seg.split("|")[0] if not seg.startswith("(") else (seg.split("|")[1] if "|" in seg else "")
        m = re.search(r"([\d,.]+)\s*" + unit, seg); return num(m.group(1)) if m else None
    pw = re.search(r"(\d/0|\d+)\s*AWG", after(s, "Power Wire Gauge|", 30))
    cm = re.search(r"([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*\(cm\)", after(s, "Dimensions", 120))
    ch = re.search(r"Number of Channels\|(\d)", s); cls = re.search(r"Circuit Topology Class\|([^|]+)", s)
    model = re.search(r"\b([A-Z]\d{3,4}[A-Za-z0-9-]*|T\d{3,5}[A-Za-z0-9-]*|P\d{3,4}[A-Za-z0-9-]*|R2-[\dX]+[A-Z0-9]*|R\d{3,4}[A-Z0-9-]*|PM\d+[A-Z0-9-]*)", title)
    url = f"https://rockfordfosgate.com/products/details/{h}/"
    recs.append({"id": f"rockford-{h}", "model": model.group(1) if model else h.upper(), "title": title, "status": "listed in the maker car-amplifier selector " + TODAY,
                 "class": (cls.group(1).strip() if cls and "lass" in cls.group(1) else None), "channels": int(ch.group(1)) if ch else None, "rms_ratings": rat, "rated_voltage_v": 14.4,
                 "cta2006": True if re.search(r"(?i)cta-2006 compliant", s) else None, "dynamic_power": dyn,
                 "total_power_w": num_after("Total Power|(Sum of Rated Power)|", "Watts"), "efficiency_pct": [{"pct": a, "ohm": b, "note": (">" if ">" in eblk else None)} for a, b in eff if a >= 20] or None,
                 "power_wire_awg_maker": pw.group(1) if pw else None, "recommended_fuse_a": num_after("Recommended Fuse|"), "fuse_included": None if not after(s, "Recommended Fuse", 25) else ("not included" not in after(s, "Recommended Fuse", 25)),
                 "current_draw_avg_music_13v8_a": num_after("Average Current Draw|(13.8V Music)|"), "current_draw_max_sine_13v8_a": num_after("Max. Current Draw|(13.8V Sinewave)|"),
                 "suggested_alternator_a": num_after("Suggested Alternator|"), "operating_voltage": (re.search(r"Operating Voltage\|([^|]+)", s) or [None, None])[1],
                 "min_load_ohm": min([x["ohm"] for x in rat if not x["bridged"]], default=None),
                 "dims_mm": {"mm": [float(x) * 10 for x in cm.groups()], "order": "H x W x D (maker order)"} if cm else None,
                 "prices_aud": [], "prices_other": [],
                 "sources": [{"fields": ["all values"], "url": url, "read_date": TODAY, "tier": "maker"}],
                 "check": "parsed from the maker spec table by scripts/parts/build_rockford_amps.py", "notes": ""})
write("amplifiers", "rockford-fosgate", {"brand": "Rockford Fosgate", "maker_site": "https://rockfordfosgate.com", "method": "maker product pages from https://rockfordfosgate.com/products/selector/car-amplifiers/ (3 s apart)",
      "terms_note": "Numbers only with URL. Rated power is CTA-2006 at 14.4 V per maker; current draw figures are at 13.8 V (music average and sine max) as labelled by the maker.",
      "units": {"w_per_ch": "W RMS", "current_draw_*": "A", "dims_mm": "mm (from the maker cm values)"}}, recs)
