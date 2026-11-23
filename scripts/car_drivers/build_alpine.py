#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Alpine (Alps Alpine, Japan; US site alpine-usa.com) car speakers from the product pages' 'Tech Specs' list
(Label:|value), slugs from the maker sitemap (alpine-usa.com/uploads/sitemap.xml), read 2026-11-23 3 s apart. Alpine prints
size, power, frequency response, sensitivity and on some models impedance, mounting depth and materials; no T/S (R2 found the
'Tech Sheet' PDF links dead). Raw: references/raw/car_drivers/alpine/. Usage: python3 -I build_alpine.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/alpine/"
urls = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}
def frac(v):
    """'5 1/4”' -> 5.25, '3/4”' -> 0.75, '6.5”' -> 6.5 (inches as printed)."""
    m = re.search(r"(?:(\d+)\s+)?(\d+)/(\d+)\s*[\"”]", v or "")
    if m: return round((int(m.group(1)) if m.group(1) else 0) + int(m.group(2)) / int(m.group(3)), 3)
    m = re.search(r"([\d.]+)\s*[\"”]", v or "")
    return num(m.group(1)) if m else None


out = []
for fn, url in sorted(urls.items()):
    p = R + fn
    if not os.path.exists(p): continue
    t = text_of(p)
    i = t.find("Tech Specs|")
    if i < 0: print("no specs", fn); continue
    toks = [x.strip() for x in t[i + 11:i + 3000].split("|")]
    d = {}; key = None
    for x in toks:
        if not x or x == "Arrow": continue
        if len(x) > 80: break
        if x.endswith(":"): key = x[:-1]; d[key] = ""; continue
        m = re.match(r"^([A-Z][A-Za-z /()\-]{2,40}):\s*(.+)$", x)
        if m: d[m.group(1)] = m.group(2); key = None; continue
        if key and not d[key]: d[key] = x
    name = re.search(r"\|Products\|([^|]+)\|", t)
    raw = open(p, encoding="utf-8", errors="replace").read()
    import html as _h
    ti = re.search(r'og:title" content="([^"]*)"', raw)
    title = _h.unescape(ti.group(1)).strip() if ti else fn
    slug = fn[:-5]
    sc = re.search(r"(?:speakers-|tweeters-|speaker-set-|upgrade-)([a-z0-9.]+(?:-[a-z0-9.]+)?)$", slug) or re.search(r"^(?:alpine-status-)?([a-z0-9.\-]+?)-(?:car-)?speakers", slug) or re.search(r"^([a-z0-9]+(?:-[a-z0-9]+)?)-g-", slug)
    code = sc.group(1).upper() if sc else slug.upper(); tl = (title + " " + slug + " " + " ".join(d.values())).lower()
    if "tweeter" in title.lower() and not (d.get("Woofer Size") or d.get("Speaker Size")): typ = "tweeter"
    elif "30mc" in slug: typ = "midrange"
    elif "component" in tl or slug.endswith("c-speakers") or re.search(r"\d+c(\.2)?-|65c|69c|40c|80c|cs-speakers", slug): typ = "component_set"
    elif "midrange" in tl and "component" not in tl and "30mc" in slug: typ = "component_set"
    elif re.search(r"-40m-t|mid", slug): typ = "midrange"
    else: typ = "coaxial"
    ws = d.get("Woofer Size") or d.get("Speaker Size") or ""
    mo = re.search(r"(\d)\s*[\"”]?\s*x\s*(\d+)", ws + " " + title)
    size = None; lab = None
    if mo: lab = f"{mo.group(1)}x{mo.group(2)}"
    else:
        size = frac(ws) if ws else frac(title)
    if typ == "tweeter":
        size = frac(d.get("Tweeter Size", "")) or frac(title); lab = "tweeter"
    pw = d.get("Power Handling", "")
    mr = re.search(r"(\d+)\s*W\s*RMS", pw); mp = re.search(r"(\d+)\s*W\s*(?:Peak|Max)", pw, re.I)
    fr = None
    mf = re.search(r"([\d.]+)\s*(k?)Hz\s*[-–]\s*([\d.]+)\s*(k?)Hz", d.get("Frequency Response", "") or d.get("Frequency response", ""))
    if mf: fr = [num(mf.group(1)) * (1000 if mf.group(2) else 1), num(mf.group(3)) * (1000 if mf.group(4) else 1)]
    sens = num(d.get("Sensitivity"))
    dep = d.get("Mounting Depth"); depth = None
    if dep:
        mm = re.search(r"([\d.]+)\s*mm", dep); mi = re.search(r"([\d.]+)\s*[\"”]", dep)
        depth = num(mm.group(1)) if mm else (round(num(mi.group(1)) * 25.4, 1) if mi else None)
    z = num(d.get("Impedance") or d.get("Nominal Impedance"))
    extra = {k: v for k, v in (("tweeter_size_as_printed", d.get("Tweeter Size")), ("cone_material", d.get("Cone Material")),
                               ("magnet_as_printed", d.get("Magnet Material") or d.get("Magnet Type")), ("title", title)) if v}
    notes = ["Sensitivity printed without a drive reference; basis unknown."] if sens else []
    if dep and depth and "mm" not in dep: notes.append(f"Mounting depth converted from '{dep}'.")
    if re.search(r"tesla|jeep|spv", slug): notes.append("Vehicle-specific model.")
    model = f"Alpine {code} ({title})"
    r = rec(model, typ, size, lab, z, "SVC", num(mr.group(1)) if mr else None, num(mp.group(1)) if mp else None, sens, "unknown" if sens else None, fr,
            (d.get("Magnet Material") or "").lower() or None, {}, "unknown", depth_mm=depth,
            sources=[src(url, ["*"], doc="product page, Tech Specs")], notes=" ".join(notes), extra=extra)
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out))
save("alpine", "Alpine (Alps Alpine)", "Japan", "https://www.alpine-usa.com", "R4 2026-11-23: robots.txt 'Allow: /'; product pages read 3 s apart. Numbers only.", out)
