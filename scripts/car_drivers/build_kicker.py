#!/usr/bin/env python3
"""R4_CAR_DRIVERS: KICKER (USA) car speakers (KS, KSS, KST, CS, DS, QS, Westcoast ST pro audio) from kicker.com product pages
(specTitle / specRecord table), listed from the maker sitemap (copy saved by R2: references/raw/car_subs/kicker/sitemap.xml) and
read 2026-11-23 3 s apart. KICKER publishes no T/S for its car speakers (only for subwoofers and the ST pro midranges, whose
T/S pages are not read here). Metric values as printed ('in, mm' columns: the mm part is used). Raw: references/raw/car_drivers/kicker/.
Usage: python3 -I build_kicker.py"""
import sys, re, os, glob, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, num
R = "/workspace/references/raw/car_drivers/kicker/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def met(v):
    if not v: return None
    m = re.search(r",\s*([\d.]+)\s*$", v.strip())
    return num(m.group(1)) if m else None


out, seen = [], set()
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = open(p, encoding="utf-8", errors="replace").read()
    pairs = [(html.unescape(re.sub(r"<[^>]+>", "", a)).strip(), html.unescape(re.sub(r"<[^>]+>", "", b)).strip())
             for a, b in re.findall(r'class="specTitle">(.*?)</td>.*?class="specRecord">(.*?)</td>', t, re.S)]
    if not pairs: print("no spec table", fn); continue
    sp = {}
    for a, b in pairs: sp.setdefault(a, b)
    title = html.unescape((re.findall(r"<title>(.*?)</title>", t, re.S) or [fn])[0]).replace("KICKER |", "").strip()
    title = re.sub(r"\s*\|\s*KICKER.*$", "", title).strip()
    code = re.search(r"kicker\.com/([A-Za-z0-9]+)", url)
    pn = re.findall(r"\b(\d{2}[A-Z]{2,4}\d{2,6}[A-Z]?)\b", t)
    model_code = next((x for x in pn if x[2:4] in ("KS", "CS", "DS", "QS", "ST") or x[2:5] in ("KSC", "KSS", "KST", "CSC", "CSS", "CST", "DSC", "QSS", "QSC")), None)
    model = f"KICKER {title}" + (f" ({model_code})" if model_code else "")
    if model in seen: continue
    seen.add(model)
    tl = title.lower()
    design = sp.get("Speaker Design", "")
    if "tweeter" in tl or re.search(r"KST|ST[34]T", url): typ = "tweeter"
    elif "component" in tl or "comp" in tl and "compression" not in tl: typ = "component_set"
    elif "coax" in tl or "way" in design.lower() or "3-way" in tl: typ = "coaxial"
    elif "midrange" in tl or re.search(r"ST[79]MR", url): typ = "midrange"
    elif "horn" in tl or "driver" in tl: typ = "tweeter"
    else: typ = "coaxial"
    if "pod" in tl and "tweeter" not in tl: typ = "component_set"
    def nk(k): return re.sub(r"[^a-z0-9]", "", k.lower().replace("ω", "ohm").replace("Ω".lower(), "ohm"))
    spn = {nk(k): v for k, v in sp.items()}
    def F(*pats):
        for pat in pats:
            for k, v in spn.items():
                if re.search(pat, k): return v
        return None
    def met2(v):
        if not v: return None
        m = re.search(r"[,\[]\s*([\d.]+)\s*\]?\s*$", v.strip())
        return num(m.group(1)) if m else None
    woof = F(r"^woofer(size)?(in|\()", r"^woofer(inmm|size)", r"^squarewoofers", r"^mid(inmm|range)") or ""
    tw = F(r"^tweeter(size)?(in|\()", r"^tweeterinmm") or ""
    size = None; lab = None
    mo = re.search(r"(\d)\s*[\"”]?\s*[xX]\s*(\d+)", title)
    if mo and typ != "tweeter": lab = f"{mo.group(1)}x{mo.group(2)}"
    else:
        mm_ = met2(woof if typ != "tweeter" else (tw or woof))
        lab = f"{mm_:g} mm" if mm_ else None
        ms = re.search(r"(\d+(?:\.\d+)?)\"", title)
        size = num(ms.group(1)) if ms and typ != "tweeter" else None
        if typ == "tweeter":
            mt = re.search(r"(\d+(?:\.\d+)?|\d/\d)\s*(?:\"|inch)", title)
            if mt: size = {"3/4": 0.75, "1/2": 0.5}.get(mt.group(1), num(mt.group(1)) if "/" not in mt.group(1) else None)
    rr = F(r"^recommended(amplifier|amp)power") or ""
    rms = None; notes = []
    if rr:
        try: rms = int(rr.split("-")[-1].strip())
        except ValueError: rms = num(rr)
        if "-" in rr: notes.append(f"Maker gives 'Recommended Amplifier Power' {rr} W RMS; upper bound entered as rms_w.")
    peak = num(F(r"^peakpower"))
    sens = num(F(r"^sensitivity"))
    fr = None
    m = re.search(r"([\d.]+)\s*(k?)\s*-\s*([\d.]+)\s*(k?)", F(r"^frequencyresponse", r"^effectivefrequencyrange") or "")
    if m: fr = [num(m.group(1)) * (1000 if m.group(2) else 1), num(m.group(3)) * (1000 if m.group(4) else 1)]
    depth = met2(F(r"^topmountdepth", r"^mountingdepth", r"^wooferbottommountdepth"))
    bdepth = met2(F(r"^bottommountdepth", r"^wooferbottommountdepth"))
    cut = met2(F(r"^(woofer)?mountinghole", r"^mountingcutout"))
    if bdepth: notes.append(f"Bottom-mount depth {bdepth} mm (maker); mounting_depth_mm = top-mount depth where printed.")
    re_dc = num(F(r"^dcresistance"))
    xo = {k: v for k, v in sp.items() if re.search(r"crossover|high pass|low pass|attenuation", k, re.I)}
    passive = {"as_printed": xo} if xo else None
    mag = F(r"^woofermagnet", r"^magnetmaterial", r"^tweetermagnet")
    extra = {k2: v for k2, v in (("tweeter_as_printed", tw), ("cone_material", F(r"^woofercone")), ("tweeter_dome", F(r"dome"))) if v}
    ftw = met2(F(r"^flushmount(ing)?tweeterhole"))
    if ftw: extra["tweeter_flush_cutout_mm"] = ftw
    z = num(F(r"^ratedimpedance", r"^impedance"))
    if z is None:
        mz = re.search(r"(\d)[- ]?Ohm", title, re.I); z = num(mz.group(1)) if mz else None
    r = rec(model, typ, size, lab, z, "SVC", rms, peak, sens, "1W/1m" if sens else None, fr,
            mag.lower() if mag else None, {"re_ohm": re_dc}, "unknown", depth_mm=depth, cutout_mm=cut, passive=passive,
            sources=[src(url, ["*"], doc="product page, specifications table")], notes=" ".join(notes), extra=extra)
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("kicker", "KICKER (Stillwater Designs)", "USA", "https://www.kicker.com",
     "R4 2026-11-23: robots.txt Allow / (only /cart/ and one script disallowed); product pages read 3 s apart. Numbers only.", out)
