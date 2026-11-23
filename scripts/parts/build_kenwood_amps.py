#!/usr/bin/env python3
"""R3: Kenwood (USA site) car amplifiers: CTA-2006 continuous power, rated power at 14.4 V, current consumption, fuse, dimensions."""
import sys, re, glob, os; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
def frac_in(s):
    s = s.strip(); m = re.match(r"(\d+)(?:-(\d+)/(\d+))?$", s)
    return (int(m.group(1)) + (int(m.group(2)) / int(m.group(3)) if m.group(2) else 0)) if m else None
recs = []
for f in sorted(glob.glob(f"{RAW}/pages/kenwood/p_*.html")):
    h = os.path.basename(f)[2:-5]; raw = open(f, errors="replace").read()
    sp = f.replace("/p_", "/s_"); raw += open(sp, errors="replace").read() if os.path.exists(sp) and "404 Not Found" not in open(sp, errors="replace").read() else ""
    t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I))
    s = t
    rat = []
    for m in re.finditer(r"(\d+)\s*Watts RMS x (\d) \((\d(?:\.\d+)?) Ohms?[^)]*?(≤\s*[\d.]+% THD)?\)", s):
        rat.append({"w_per_ch": int(m.group(1)), "channels": int(m.group(2)), "ohm": float(m.group(3)), "bridged": "ridg" in s[max(0, m.start() - 40):m.start()], "group": None, "voltage_v": 14.4, "thd": (m.group(4) or "").replace("≤", "<=").strip() or None})
    if not rat: rat = [dict(x, voltage_v=x.get("voltage_v")) for x in ratings(t)]
    cta = [{"w": int(a), "ohm": float(b)} for a, b in re.findall(r"Continuous Power Output\|(\d+)\s*W(?:atts)?(?: x \d)? at (\d) ?ohms and ≤ 1% THD", s)]
    cur = re.search(r"Current Consumption\|([\d.]+)\s*\[?A\]?", s); fz = re.search(r"Fuse \((\d+)A x (\d)\)", t)
    dm = re.search(r"Dimensions\(WxHxD\)\|'?([\d\-/]+) [xX] '?([\d\-/]+) [xX] '?([\d\-/]+) \[?inch", s)
    chm = re.search(r"(\d)[- ]?(?:ch|Channel)", t[:3000], re.I)
    recs.append({"id": f"kenwood-{h}", "model": h.upper(), "model_basis": "maker page address (model code)", "title": h.upper(), "status": "maker site " + TODAY, "class": "D" if re.search(r"(?i)class[- ]?d", t) else None,
                 "channels": int(chm.group(1)) if chm else None, "rms_ratings": rat, "rated_voltage_v": 14.4 if "14.4V" in s else None, "cta2006": True if "CTA-2006 Compliant" in t or "CTA-2006" in s else None,
                 "cta2006_continuous": cta or None, "current_draw_a": float(cur.group(1)) if cur else None, "current_draw_basis": "maker 'Current Consumption', conditions not stated",
                 "fuse_onboard_a": int(fz.group(1)) * int(fz.group(2)) if fz else None, "fuse_onboard_note": f"{fz.group(1)} A x {fz.group(2)}" if fz else None,
                 "dims_mm": {"mm": [round(frac_in(x) * 25.4, 1) for x in dm.groups()], "order": "W x H x D"} if dm and all(frac_in(x) for x in dm.groups()) else None,
                 "min_load_ohm": min([x["ohm"] for x in rat if not x["bridged"]], default=None), "prices_aud": [], "prices_other": [],
                 "sources": [{"fields": ["all values"], "url": f"https://www.kenwood.com/usa/car/caraudio/amplifiers/{h}/", "read_date": TODAY, "tier": "maker"}],
                 "check": "parsed from the maker spec block by scripts/parts/build_kenwood_amps.py", "notes": "Kenwood 'Rated Power Output at 14.4V' lines are at <=0.5 % THD on some models; CTA-2006 continuous figures listed separately"})
write("amplifiers", "kenwood", {"brand": "Kenwood", "maker_site": "https://www.kenwood.com/usa/car/caraudio/amplifiers/", "method": "maker product pages (USA), 3 s apart", "terms_note": "Numbers only with URL.", "units": {"w_per_ch": "W RMS", "dims_mm": "mm"}}, recs)
