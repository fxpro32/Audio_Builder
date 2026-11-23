#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Nakamichi car speakers from nakamichicaraudio.com (Shopify products.json, 1 request, read 2026-11-23).
Values from the 'Specification:' label|value list in each product description. Power: maker 'N-power' (nominal) as rms_w and
'Peak Power' as peak_w, per piece as printed ('1pc'). Subwoofers, receivers, amps, DSP left out.
Raw: references/raw/car_drivers/nakamichi/. Usage: python3 -I build_nakamichi.py"""
import sys, re, json, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
R = "/workspace/references/raw/car_drivers/nakamichi/"
ps = json.load(open(R + "products_1.json"))["products"]
TY = {"Coaxial Speaker": "coaxial", "Component Speaker": "component_set", "Mid-range Speakers": "midrange"}
out = []
for p in ps:
    pt = p.get("product_type") or ""
    if pt not in TY: continue
    b = html.unescape(re.sub(r"<[^>]+>", "|", p.get("body_html") or "")); b = re.sub(r"\s*\|[\s|]*", "|", b)
    toks = [x.strip() for x in b.split("|") if x.strip()]
    i = next((k for k, x in enumerate(toks) if x.startswith("Specification")), None)
    desc = next((toks[k + 1] for k, x in enumerate(toks) if x.startswith("Description")), "")
    if i is None: print("no spec", p["title"]); continue
    d = {}
    for a, v in zip(toks[i + 1::2], toks[i + 2::2]):
        k = re.sub(r"\s+", "", a).lower().replace("freauency", "frequency")
        k = {"n-power": "N-power", "peakpower": "Peak Power", "impedance": "Impedance", "mountingdepth": "Mounting Depth", "frequencyresponse": "Frequency Response",
             "sensitivity(db/w/m)": "Sensitivity(dB/W/m)", "speakertype": "Speaker Type", "voicecoil": "Voice Coil"}.get(k, a)
        d.setdefault(k, v)
    title = re.sub(r"\s+", " ", p["title"]).strip()
    typ = TY[pt]
    dl = (desc + " " + title).lower()
    if "tweeter" in dl and "way" not in dl: typ = "tweeter"
    st = d.get("Speaker Type", "")
    mo = re.search(r"(\d)\s*[x×]\s*(\d+)", st + " " + desc)
    mi = re.search(r"([\d.]+)\s*(?:''|\"|”)", st + " " + desc)
    size = None; lab = None
    if mo: lab = f"{mo.group(1)}x{mo.group(2)}"
    elif mi: size = num(mi.group(1))
    mm = re.search(r"\((\d+)\s*mm\)", st)
    if mm and not lab: lab = f"{mm.group(1)} mm"
    def pc(v):
        m = re.search(r"(\d+)\s*[wW]\s*\(1\s*pc", v or ""); return num(m.group(1)) if m else num(v)
    fr = None
    mf = re.search(r"([\d.]+)\s*(k?)Hz\s*[-–~]\s*([\d.]+)\s*(k?)Hz", d.get("Frequency Response", ""), re.I)
    if mf: fr = [num(mf.group(1)) * (1000 if mf.group(2) else 1), num(mf.group(3)) * (1000 if mf.group(4) else 1)]
    dep = d.get("Mounting Depth", ""); md = re.search(r"\(([\d.]+)\s*mm\)", dep) or re.search(r"([\d.]+)\s*mm", dep)
    cut = d.get("Mounting Hole") or d.get("Cut-out Diameter") or d.get("Mounting Diameter") or ""
    mc = re.search(r"\(?([\d.]+)\s*mm\)?", cut)
    sens = num(d.get("Sensitivity(dB/W/m)") or d.get("Sensitivity"))
    notes = []
    if d.get("Sensitivity(dB/W/m)") and "+" in d["Sensitivity(dB/W/m)"]: notes.append(f"Sensitivity printed as '{d['Sensitivity(dB/W/m)']}' (tolerance); nominal stored.")
    if d.get("N-power"): notes.append(f"Power as printed: N-power '{d['N-power']}', peak '{d.get('Peak Power', '')}'; per-piece values stored.")
    r = rec(f"Nakamichi {title.replace('Nakamichi', '').strip()}", typ, size, lab, num(d.get("Impedance")), "SVC", pc(d.get("N-power")), pc(d.get("Peak Power")),
            sens, "1W/1m" if sens and "dB/W/m" in "".join(d) else ("unknown" if sens else None), fr, None, {}, "unknown",
            depth_mm=num(md.group(1)) if md else None, cutout_mm=num(mc.group(1)) if mc else None,
            sources=[src("https://nakamichicaraudio.com/products/" + p["handle"], ["*"], doc="maker product description (Shopify products.json)")],
            notes=" ".join(notes), extra={"description_as_printed": desc[:80], "voice_coil_as_printed": d.get("Voice Coil")})
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("nakamichi", "Nakamichi (car audio)", "Japan / USA", "https://nakamichicaraudio.com", "R4 2026-11-23: Shopify products.json, one request. Numbers only.", out)
