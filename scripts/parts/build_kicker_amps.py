#!/usr/bin/env python3
"""R3: Kicker amplifiers from kicker.com product pages (saved in references/raw/parts/pages/kicker/p_*.html)."""
import sys, re, glob, os; sys.path.insert(0, "/workspace/scripts/parts"); from common import *
D = f"{RAW}/pages/kicker"; recs = []
for f in sorted(glob.glob(f"{D}/p_*.html")):
    h = os.path.basename(f)[2:-5]; raw = open(f, encoding="utf-8", errors="replace").read()
    t = clean(re.sub(r"<script.*?</script>|<style.*?</style>", " ", raw, flags=re.S | re.I))
    t = t.replace("|⁄|", "/").replace("|3|/|16|", "3/16")
    title = (re.search(r"<title>(.*?)</title>", raw, re.S) or [None, h])[1].strip()
    i = t.find("Specifications"); spec = t[i:i + 2500] if i >= 0 else ""
    rat = []; vhead = re.search(r"@\s*(1[234](?:\.\d)?)\s*V", spec); V = float(vhead.group(1)) if vhead else None
    subpos = min([k for k in (spec.find("Sub Channel"), spec.find("Sub channel")) if k >= 0], default=10**9)
    pats = [r"(\d(?:\.\d+)?)\s*(?:Ω|Ohm)\s*(stereo|mono|bridged mono|bridged)?[^:|]{0,40}:\s*(\d[\d,]*)\s*x\s*(\d)",
            r"(\d(?:\.\d+)?)\s*(?:Ω|Ohm)\s*(Stereo|Mono|Bridged Mono|Bridged)?[^|]{0,30}\|\s*(\d[\d,]*)\s*x\s*(\d)",
            r"(\d(?:\.\d+)?)\s*(?:Ω|Ohm)\s*(mono|stereo|bridged)\s*:\s*(\d[\d,]*)\s*(W)"]
    for k, pat in enumerate(pats):
        for m in re.finditer(pat, spec, re.I):
            lab = (m.group(2) or "").lower(); n = 1 if m.group(4) == "W" else int(m.group(4))
            br = "bridg" in lab or (lab == "mono" and n > 1)
            x = {"w_per_ch": num(m.group(3)), "channels": n, "ohm": float(m.group(1)), "bridged": br, "group": "sub channel" if m.start() > subpos else None, "voltage_v": V}
            if not any(all(x[q] == y[q] for q in ("w_per_ch", "channels", "ohm", "bridged")) for y in rat): rat.append(x)
    cta = bool(re.search(r"CEA-2006|CTA-2006", spec)); dyn = re.search(r"Dynamic Power \[Watts\]\|(\d[\d,]*)", spec)
    def cm(lbl):
        m = re.search(lbl + r"[^|]*\|[^|]*?,\s*([\d.]+)\|", spec) or re.search(lbl + r":?\s*[\d\-/ ]+\(([\d.]+)\s*cm\)", spec)
        return float(m.group(1)) * 10 if m else None
    L, W, H = cm("Length"), cm("Width"), cm("Height")
    if "(in, mm)" in spec:
        def mm(c):
            m = re.search(r"\|" + c + r":\s*[\d\-/ ]+,\s*([\d.]+)", spec); return float(m.group(1)) if m else None
        L, W, H = mm("L"), mm("W"), mm("H")
    model = re.search(r"\b((?:CXA|KXA|IQ|PXA|LX|KPX|WXA|VXA)\s?\d+\.\d)", title, re.I) or re.search(r"MODEL\|((?:CXA|KXA|IQ|PXA|LX|KPX|WXA|VXA)\s?\d+\.\d)", spec, re.I) or re.search(r"(\d\d(?:LX|KPX|WXA|VXA)\d+)", h, re.I)
    mono = re.search(r"(?i)mono", title) and all(x["channels"] in (1, None) for x in rat if not x["bridged"])
    chm = re.search(r"(\d)-Channel", title) or re.search(r"[A-Z]\s?\d{2,4}\.(\d)\b", model.group(1) if model else "") or re.search(r"\d{3,4}(\d)$", h)
    url = f"https://www.kicker.com/{h}"
    recs.append({"id": f"kicker-{h}"[:90], "model": model.group(1).upper() if model else h, "title": title, "status": "listed on maker site " + TODAY,
                 "class": "D" if re.search(r"(?i)class[- ]?d", t) else None, "channels": int(chm.group(1)) if chm and int(chm.group(1)) in (1,2,3,4,5,6,7,8) else (1 if mono else None),
                 "rms_ratings": rat, "rated_voltage_v": rat[0]["voltage_v"] if rat else None, "cta2006": True if cta else None,
                 "dynamic_power_w": num(dyn.group(1)) if dyn else None, "min_load_ohm": min([x["ohm"] for x in rat if not x["bridged"]], default=None),
                 "fuse_onboard_a": None, "power_wire_awg_maker": None, "current_draw_a": None, "efficiency_pct": None,
                 "dims_mm": {"mm": [L, W, H], "order": "L x W x H", "from": "cm values on the page"} if L else None,
                 "manual_url": (lambda m: ("https://www.kicker.com" + m.group(1)) if m and m.group(1).startswith("/") else (m.group(1) if m else None))(re.search(r'href="([^"]+\.pdf)"[^>]*>\s*(?:Download|Manual)', raw)),
                 "prices_aud": [], "prices_other": [],
                 "sources": [{"fields": ["rms_ratings", "rated_voltage_v", "cta2006", "dims_mm", "dynamic_power_w", "class"], "url": url, "read_date": TODAY, "tier": "maker"}],
                 "check": "parsed from the maker spec block by scripts/parts/build_kicker_amps.py", "notes": "" if rat else "no RMS line parsed; see page"})
# R3B: external fuse + power/ground wire gauge from the maker PDF manuals (saved in references/raw/parts/pages/kicker_manuals/, text by scripts/pdf_text.mjs)
import glob as _g
MAN = {}
for tf in sorted(_g.glob(f"{RAW}/pages/kicker_manuals/*.txt")):
    url = [u.strip() for u in open("/workspace/scripts/parts/kicker_manuals.txt") if u.strip().endswith("/" + tf.split("/")[-1][:-4] + ".pdf")]
    for m in re.finditer(r"(?m)^([A-Z]{2,5}\d{2,5}\.\d)D? +(\d) ?x ?(\d+) ?Amp[a-z]* +(\d/0|\d+) ?Gauge\s*(.*)$", open(tf).read()):
        MAN.setdefault(m.group(1), {"fuses": int(m.group(2)), "fuse_a": int(m.group(3)), "awg": m.group(4), "kits": m.group(5).strip("() "), "url": url[0] if url else None})
for r in recs:
    mm = re.match(r"^([A-Z]{2,5})\s?(\d{2,5})\.?(\d)\b", r["model"].upper()) if r.get("model") else None
    if mm and not re.search(r"\.", r["model"]): r["model"] = f"{mm.group(1)}{mm.group(2)}.{mm.group(3)}"; r["model_basis"] = "maker page (model code normalised to the maker's NNN.N form)"
    elif mm: r["model"] = f"{mm.group(1)}{mm.group(2)}.{mm.group(3)}"
    k = r.get("model")
    if k in MAN and MAN[k]["url"]:
        e = MAN[k]; r["recommended_fuse_a"] = e["fuse_a"] * e["fuses"]; r["recommended_fuse_note"] = f"maker manual: external fuse {e['fuses']} x {e['fuse_a']} A"
        r["power_wire_awg_maker"] = e["awg"]; r["kicker_wiring_kits"] = e["kits"]
        r["sources"].append({"fields": ["recommended_fuse_a", "power_wire_awg_maker", "kicker_wiring_kits"], "url": e["url"], "read_date": TODAY, "tier": "maker", "doc": "amplifier owner's manual, external fuse table"})
write("amplifiers", "kicker", {"brand": "Kicker", "maker_site": "https://www.kicker.com", "method": "maker product pages (spec block), 3 s apart",
      "terms_note": "Numbers only with URL. Kicker states RMS at 14.4 V, <= 1% THD+N and a CEA-2006B line on most pages.",
      "units": {"w_per_ch": "W RMS per channel at voltage_v", "dims_mm": "mm"}}, recs)
