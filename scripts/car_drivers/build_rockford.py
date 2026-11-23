#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Rockford Fosgate (USA) car speakers (Prime R1/R2, Punch P1/P2/P3, Power T1-T5 coaxials, component systems,
tweeters) from rockfordfosgate.com product detail pages ('Specifications' block), slugs from the maker sitemap, read 2026-11-23
3 s apart. Rockford prints only Fs (no full T/S) on newer speaker pages. Imperial/metric: the metric value in brackets is used.
Amplifiers, subwoofers (R2), kits, marine and motorcycle models are left out. Raw: references/raw/car_drivers/rockford/.
Usage: python3 -I build_rockford.py"""
import sys, re, os, glob
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/rockford/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}
LABELS = ["CEA-2031 Compliant", "Speaker Type", "Nominal Impedance", "Crossover", "Frequency Response", "Tweeter Size", "Midrange Size", "Woofer Size",
          "Mounting Hardware", "Power Handling", "Grille/Trim Ring Included", "Shipping Weight", "Midrange Mounting Depth", "Tweeter Mounting Depth",
          "Woofer Mounting Depth", "Sensitivity", "Piezo Size", "Voice Coil Diameter", "Fs", "Removable Motor Cover", "Included in the Box", "Mounting Depth",
          "Front Side Clearance", "Cutout Diameter", "Front-Loading Depth", "Rear-Loading Depth", "Min. Mounting Depth", "Woofer Cutout Diameter",
          "Woofer Front Side Clearance", "Midrange Mounting Diameter", "Midrange Front-Loading Depth", "Midrange Rear-Loading Depth", "Mounting Diameter",
          "Midrange Front Side Clearance", "Midrange Cutout Diameter", "Compatibility"]


def spec(t):
    ms = [m.start() for m in re.finditer(r"\|Specifications\|", t)]
    if not ms: return {}, None
    seg = t[ms[-1] + 16:t.find("|Support|", ms[-1])]
    toks = [x.strip() for x in seg.split("|") if x.strip()]
    d = {}; key = None
    for x in toks:
        if x in LABELS: key = x; d.setdefault(key, []); continue
        if key and not re.fullmatch(r"\(.*\)", x): d[key].append(x)
    head = t[:ms[-1]]
    return {k: " | ".join(v) for k, v in d.items()}, head


def mmv(v):
    if not v: return None
    m = re.search(r"\(([\d.]+)\s*mm\)", v)
    if m: return num(m.group(1))
    m = re.search(r"\(([\d.]+)\s*cm\)", v)
    return round(num(m.group(1)) * 10, 1) if m else None


out, skipped = [], []
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    d, head = spec(t)
    if not d: skipped.append(fn); continue
    slug = fn[:-5]
    raw = open(p, encoding="utf-8", errors="replace").read()
    ti = re.search(r"<title>\s*(.*?)\s*</title>", raw, re.S)
    title = re.sub(r"\s*[|–-]\s*Rockford Fosgate.*$", "", ti.group(1)).strip() if ti else slug
    st = (d.get("Speaker Type") or "").lower()
    if "component" in st: typ = "component_set"
    elif "coax" in st or "full-range" in st or "twin drive" in st or "3-way" in st or "2-way" in st: typ = "coaxial"
    elif "tweeter" in st or re.search(r"t$|t-s$|^p1t|^r1t", slug): typ = "tweeter"
    elif "mid" in st: typ = "midrange"
    else: typ = "coaxial" if d.get("Midrange Size") else ("tweeter" if d.get("Tweeter Size") and not d.get("Woofer Size") else None)
    if typ is None: skipped.append(fn + " (no type: " + st + ")"); continue
    szs = d.get("Midrange Size") or d.get("Woofer Size") or ""
    if typ == "tweeter": szs = d.get("Tweeter Size") or d.get("Piezo Size") or ""
    mo = re.search(r"(\d+(?:\.\d+)?)\s*\"?\s*x\s*(\d+)", szs)
    size = None; lab = None
    if mo: lab = f"{mo.group(1)}x{mo.group(2)}"
    else:
        mi = re.search(r"([\d.]+)\s*\"", szs); size = num(mi.group(1)) if mi else None
        mmm = mmv(szs); lab = f"{mmm:g} mm" if mmm else None
    pw = d.get("Power Handling") or ""
    mr = re.search(r"(\d+)\s*Watts RMS", pw); mp = re.search(r"(\d+)\s*Watts (?:Max|Peak)", pw)
    fr = None
    mf = re.search(r"([\d.]+)\s*(k?)Hz\s*-\s*([\d.]+)\s*(k?)Hz", (d.get("Frequency Response") or "").replace(" ", "").replace("Hz-", "Hz - "))
    if mf: fr = [num(mf.group(1)) * (1000 if mf.group(2) else 1), num(mf.group(3)) * (1000 if mf.group(4) else 1)]
    z = num(d.get("Nominal Impedance"))
    fs = num((re.search(r"([\d.]+)\s*Hz", d.get("Fs") or "") or [None, None])[1]) if d.get("Fs") and re.search(r"\d", d["Fs"]) else None
    depth = mmv(d.get("Midrange Mounting Depth") or d.get("Woofer Mounting Depth") or d.get("Mounting Depth") or d.get("Min. Mounting Depth") or d.get("Rear-Loading Depth"))
    if typ == "tweeter": depth = mmv(d.get("Tweeter Mounting Depth") or d.get("Mounting Depth"))
    cut = mmv(d.get("Cutout Diameter") or d.get("Woofer Cutout Diameter") or d.get("Midrange Cutout Diameter") or d.get("Mounting Diameter") or d.get("Midrange Mounting Diameter"))
    xo = d.get("Crossover")
    passive = None; xover = None
    if xo and xo not in ("—", "n/a"):
        mx = re.search(r"([\d.]+)\s*kHz", xo); sl = re.findall(r"(\d+)\s*dB/[Oo]ctave\s*(High|Low)", xo)
        info = {"crossover_hz": num(mx.group(1)) * 1000 if mx else None, "slopes_as_printed": [f"{a} dB/oct {b}-pass" for a, b in sl], "as_printed": xo}
        if typ in ("component_set", "coaxial"): passive = info
        else: xover = {"hp_hz": info["crossover_hz"], "note": "maker 'Crossover' as printed: " + xo}
    notes = []
    if fs: notes.append("Only Fs printed (no full T/S).")
    if d.get("Front Side Clearance"): notes.append("Front side clearance as printed: " + d["Front Side Clearance"])
    if d.get("Front-Loading Depth"): notes.append("Front-loading depth as printed: " + d["Front-Loading Depth"])
    sens = num(d.get("Sensitivity"))
    if d.get("Sensitivity") and "|" in d["Sensitivity"]: notes.append("Sensitivity printed as '" + d["Sensitivity"] + "' (two values, drive references not shown in the text); first value stored, basis unknown.")
    extra = {"title": title}
    if d.get("Tweeter Size") and typ != "tweeter": extra["tweeter_size_as_printed"] = d["Tweeter Size"]
    if d.get("Tweeter Mounting Depth") and typ != "tweeter": extra["tweeter_depth_mm"] = mmv(d["Tweeter Mounting Depth"])
    r = rec(f"Rockford Fosgate {slug.upper()}", typ, size, lab, z, "SVC", num(mr.group(1)) if mr else None, num(mp.group(1)) if mp else None,
            sens, "1W/1m" if sens and "|" not in (d.get("Sensitivity") or "") and "1W" in t[t.rfind("|Sensitivity|"):t.rfind("|Sensitivity|") + 40] else ("unknown" if sens else None), fr, None,
            {"fs_hz": fs}, "unknown", depth_mm=depth, cutout_mm=cut, xover=xover, passive=passive,
            sources=[src(url, ["*"], doc="product page, Specifications")], notes=" ".join(notes), extra=extra)
    out.append(r)
print("skipped:", skipped)
from collections import Counter
print(Counter(r["type"] for r in out))
save("rockford-fosgate", "Rockford Fosgate", "USA", "https://rockfordfosgate.com",
     "R4 2026-11-23: robots.txt 'Disallow:' (empty, all allowed); product pages read 3 s apart. Numbers only.", out)
