#!/usr/bin/env python3
"""R4_CAR_DRIVERS: Focal (France) car speakers: component kits, coaxials, tweeters, woofers, midranges.
Fit and rating values from the product page 'Specifications' list (focal.com/products/<slug>), T/S from the maker
Technical Sheet PDFs linked on that page (dam.focal-naim.com FT_*.pdf: woofer sheet 'Technical Sheet', 'Technical Sheet - Tweeter',
'Technical Sheet - Midrange'). Read 2026-11-23, 3 s apart. Raw: references/raw/car_drivers/focal/. Marine (WM/KM), home, amps,
subwoofers (R2) and interfaces are left out. Pages without a specification list (older models) are listed in no_specs_published.
Usage: python3 -I build_focal.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_drivers")
from common import rec, src, save, text_of, num
R = "/workspace/references/raw/car_drivers/focal/"
U = "https://www.focal.com/products/"
name_of = {}
for fn in ("list_pdf.txt", "list_pdf_2.txt"):
    for l in open(R + fn):
        if l.strip(): u, n = l.split(); name_of[u] = n  # _2 list (collisions) wins


def _block(L):
    d = {}
    pats = {"rms": r"^Nominal power\s*([\d.,]+)\s*W", "peak": r"^Maximum power\s*([\d.,]+)\s*W", "sens": r"^Sensitivity\s*([\d.,]+)\s*dB",
            "z": r"^Nom\. impedance\s*([\d.,]+)", "fr": r"^Frequency response\s*(.+)$", "re_ohm": r"^(?:Rdc|DC resistance)\s*([\d.,]+)",
            "fs_hz": r"^Fs\s*([\d.,]+)\s*Hz", "fs_khz": r"^Fs\s*([\d.,]+)\s*[kK]Hz", "mms_g": r"^Mms\s*([\d.,]+)\s*g", "vas_l": r"^Vas\s*([\d.,]+)\s*(?:l|I|L|liters?)\b",
            "qts": r"^Qts\s*([\d.,]+)", "qes": r"^Qes\s*([\d.,]+)", "qms": r"^Qms\s*([\d.,]+)", "bl_tm": r"^B ?x ?l\s*([\d.,]+)", "sd_cm2": r"^Sd\s*([\d.,]+)\s*cm",
            "xmax_mm": r"^Xmax\s*([\d.,]+)\s*mm", "le_mh": r"^Le\s*([\d.,]+)\s*mH", "cone": r"^(?:Cone|Dome)\s+([A-Za-z].*)$"}
    for k, p in pats.items():
        for l in L:
            m = re.search(p, l)
            if m:
                v = m.group(1).strip()
                if k in ("fs_hz", "fs_khz") and re.fullmatch(r"[1-9]\d{0,2},\d{3}", v): v = v.replace(",", "")  # thousands comma (1,350Hz)
                d[k] = v; break
    if "fs_khz" in d and "fs_hz" not in d: d["fs_hz"] = str(num(d["fs_khz"]) * 1000)
    return d


def sheet(path):
    """Returns the woofer-like block and the tweeter-like block of one Technical Sheet (a sheet can hold both drivers)."""
    if not os.path.exists(path): return None
    t = open(path, encoding="utf-8", errors="replace").read()
    L = [l.strip() for l in t.splitlines() if l.strip()]
    starts = [i for i, l in enumerate(L) if re.match(r"^(Rdc|DC resistance)\b", l)] or [0]
    blocks = []
    for n, i in enumerate(starts):
        j = starts[n + 1] if n + 1 < len(starts) else len(L)
        blocks.append(_block(L[max(0, i - 2):j]))
    head = _block(L)  # first-match values (ratings sit above the parameter blocks)
    for b in blocks:
        for k in ("rms", "peak", "sens", "z", "fr", "cone"):
            b.setdefault(k, head.get(k))
    fsv = lambda b: num(b.get("fs_hz")) or 0
    wb = [b for b in blocks if fsv(b) and fsv(b) < 800]
    tb = [b for b in blocks if fsv(b) >= 800]
    title = next((l for l in L if re.search(r"(Woofer|woofer|Tweeter|tweeter|speaker|Midrange|midrange|Coaxial|coaxial)$", l) and len(l) < 40), None)
    dm = re.search(r"www\.focal\.com - \w+ - (\d\d/\d\d/\d{4})", t)
    w = max(wb, key=lambda b: num(b.get("sd_cm2")) or 0) if wb else (blocks[0] if not tb else None)
    out = dict(w or {}); out["title"] = title; out["date"] = dm.group(1) if dm else None
    out["_tweeter_block"] = tb[0] if tb else None
    out["_has_woofer"] = bool(wb) or not tb
    return out


def g(t, label):
    m = re.search(r"\|" + label + r" ?:\|([^|]+)", t)
    return m.group(1).strip() if m else None


def mm1(s):
    if not s: return None
    m = re.search(r"([\d.,]+)\s*(?:x\s*([\d.,]+)\s*)?mm", s.replace(",", "."))
    if not m: return None
    return [num(m.group(1)), num(m.group(2))] if m.group(2) else num(m.group(1))


def fr(s):
    if not s: return None
    s = s.replace(" ", "")
    m = re.search(r"([\d.,]+)(k?)Hz?-([\d.,]+)(k?)Hz", s)
    if not m: return None
    return [num(m.group(1)) * (1000 if m.group(2) else 1), num(m.group(3)) * (1000 if m.group(4) else 1)]


TYPEMAP = [("separate", "component_set"), ("separated", "component_set"), ("separate ways", "component_set"), ("coaxial", "coaxial"),
           ("center", "coaxial"), ("central", "coaxial"), ("coxial", "coaxial"), ("tweeter", "tweeter"), ("woofer", "midbass"), ("medium", "midrange")]
out, nospec = [], []
for l in open(R + "list.txt"):
    if not l.strip(): continue
    url, fn = l.split(); slug = fn[:-5]
    if re.match(r"^(3-km|35wm|65-km|6wm|8wm|tbm|hilov3|surround-be|sw-1000-be|fsp-8)$", slug): continue
    path = R + fn
    if not os.path.exists(path): continue
    raw = open(path, encoding="utf-8", errors="replace").read(); t = text_of(path)
    title = re.search(r"<title>\s*(.*?)\s*(?:\||-|–)", raw, re.S)
    name = html.unescape(title.group(1)).strip() if title else slug.upper()
    pt = (g(t, "Product type") or "").lower()
    links = {}
    for m in re.finditer(r'<a[^>]+href="(https://dam\.focal-naim\.com[^"]+\.pdf)"[^>]*>(.*?)</a>', raw, re.S):
        lab = re.sub(r"\s+", " ", re.sub("<[^>]+>", "", m.group(2))).strip()
        if lab.startswith("Technical Sheet"):
            role = "tweeter" if "Tweeter" in lab else ("mid" if "Midrange" in lab else "woofer")
            links.setdefault(role, []).append(m.group(1))
    sheets = {r: [sheet(R + name_of[u][:-4] + ".txt") for u in us if u in name_of] for r, us in links.items()}
    sheets = {r: [s for s in v if s] for r, v in sheets.items()}
    typ = next((v for k, v in TYPEMAP if k in pt), None)
    typ = {"ifr-130-2": "midbass", "ifr-165-2": "midbass", "ifr-a165-41-ibus": "midbass", "pc-710": "coaxial", "is-rni-690": "midbass",
           "165-w-rc": "midbass", "hda-165-982013": "midbass", "ic-ford-690": "coaxial"}.get(slug, typ)
    if typ is None:
        # no product type on page: infer from the sheet title if there is one sheet
        allsh = [s for v in sheets.values() for s in v]
        ttl = (allsh[0].get("title") or "").lower() if allsh else ""
        typ = "tweeter" if "tweeter" in ttl else ("midbass" if "woofer" in ttl else ("coaxial" if "coaxial" in ttl else None))
        if typ is None:
            nospec.append({"model": name, "type": "midbass" if "-165" in slug or "-130" in slug else "component_set", "url": url,
                           "note": "Product page has no specification list or technical sheet (older model); not read further."}); continue
    # woofer sheet: for a separate kit, the sheet whose title says Woofer; collisions resolved by name_of
    nontw = [x for x in sheets.get("woofer", []) + sheets.get("mid", []) if x.get("_has_woofer") and x.get("fs_hz")]
    nontw.sort(key=lambda x: num(x.get("sd_cm2")) or 0)
    wsh = nontw[-1] if nontw else None
    msh = nontw[0] if len(nontw) >= 2 and typ in ("component_set", "coaxial") else None
    twb = [x for x in sheets.get("tweeter", []) if x] + [x["_tweeter_block"] for x in sheets.get("woofer", []) if x.get("_tweeter_block")]
    tsh = None
    if typ in ("component_set", "coaxial"):
        tsh = next((x.get("_tweeter_block") or x for x in twb if (x.get("_tweeter_block") or x).get("fs_hz")), None)
    if typ == "tweeter":
        allw = sheets.get("tweeter", []) + sheets.get("woofer", [])
        wsh = next((x["_tweeter_block"] if x.get("_tweeter_block") else x for x in allw), None)
    if typ == "midrange": wsh = nontw[0] if nontw else None
    p = {}
    if wsh:
        p = {k: num(wsh.get(k)) for k in ("re_ohm", "fs_hz", "mms_g", "vas_l", "qts", "qes", "qms", "bl_tm", "sd_cm2", "xmax_mm", "le_mh")}
    rms = num(g(t, "Nominal power")); peak = num(g(t, "Maximum power"))
    if rms is None and wsh: rms = num(wsh.get("rms"))
    if peak is None and wsh: peak = num(wsh.get("peak"))
    sens = num(g(t, "Sensitivity")) or (num(wsh.get("sens")) if wsh else None)
    z = num(g(t, "Nominal Impedance")) or (num(wsh.get("z")) if wsh else None)
    fr_txt = g(t, r"Frequency response \(\+/- 3dB\)") or g(t, "Frequency response")
    frq = fr(fr_txt) or (fr(wsh.get("fr")) if wsh else None)
    if frq and frq[0] is not None and frq[0] < 20:
        notes0 = [f"Frequency response printed as '{fr_txt}' (lower limit unit looks wrong); not stored."]; frq = None
    else: notes0 = []
    cut = mm1(g(t, "Cut-Out diameter")); depth = mm1(g(t, r"Depth behind surface \(Mounting depth\)") or g(t, "Mounting depth"))
    magnet = (g(t, "Motor") or "").lower() or None
    xo = g(t, "Filter"); xof = g(t, "Crossover frequency") or g(t, "Cut-off frequency")
    notes = notes0 + ["Sensitivity printed without a drive reference (V or W) on the page; basis unknown."]
    srcs = [src(url, ["rms_w", "peak_w", "sensitivity_db", "impedance_ohm", "freq_range_hz", "cutout_mm", "mounting_depth_mm", "magnet"], doc="product page, Specifications")]
    for r_, us in links.items():
        for u in us: srcs.append(src(u, ["params"] if r_ == ("woofer" if typ not in ("tweeter", "midrange") else ("tweeter" if typ == "tweeter" else "mid")) else ["tweeter_part" if r_ == "tweeter" else "mid_part"], doc=f"Technical Sheet ({r_})"))
    if wsh and typ in ("component_set", "coaxial"): notes.append("T/S are those of the kit's woofer (maker Technical Sheet).")
    if wsh and wsh.get("date"): notes.append(f"Technical sheet dated {wsh['date']}.")
    if re.match(r"^(is|ic|icc|icr|ifr|ifp)-", slug) and not re.match(r"^(isu|icu)-", slug): notes.append("Vehicle-specific Focal Inside kit (fits the named vehicle brand).")
    passive = None
    if typ == "component_set":
        passive = {"type_as_printed": xo, "crossover_hz_as_printed": xof, "note": "from product page 'Filter'"} if (xo or xof) else None
    extra = {}
    if tsh: extra["tweeter_part"] = {k: num(tsh.get(k)) for k in ("fs_hz", "re_ohm", "sens", "z")} | {"dome": tsh.get("cone"), "rms_w": num(tsh.get("rms"))}
    if msh: extra["midrange_part"] = {k: num(msh.get(k)) for k in ("fs_hz", "re_ohm", "qts", "vas_l", "sd_cm2", "sens", "z")}
    cone = g(t, "Membrane") or (wsh.get("cone") if wsh else None)
    if cone: extra["cone_material"] = cone
    # size from slug numbers (Focal naming: 100 = 10 cm, 130 = 13 cm, 165 = 16.5 cm, 200 = 20 cm, 570 = 5x7, 690 = 6x9)
    m = re.search(r"(?<!\d)(100|130|155|165|170|180|200|570|690|710)(?!\d)", slug)
    sz, lab = None, None
    if m:
        c = int(m.group(1)); lab = {570: "5x7", 690: "6x9", 710: "7x10"}.get(c)
        if not lab: sz = {100: 4, 130: 5.25, 155: 6, 165: 6.5, 170: 6.75, 180: 7, 200: 8}[c]; lab = f"{c / 10:g} cm"
    if typ == "tweeter": sz, lab = None, "tweeter"
    r = rec(f"{name} ({slug})", typ, sz, lab, z, "SVC", rms, peak, sens, "unknown" if sens else None, frq, magnet, p, "per_coil",
            depth_mm=depth, cutout_mm=cut, passive=passive, sources=srcs, notes=" ".join(notes), extra=extra)
    r["focal_product_type"] = pt or None
    out.append(r)
from collections import Counter
print(Counter(r["type"] for r in out), "no specs:", len(nospec))
TERMS = ("R4 2026-11-23: robots.txt disallows only '/*query=*'; product pages and technical sheet PDFs read 3 s apart, one at a time. "
         "Numbers only; sheets and graphs not copied into the dataset.")
save("focal", "Focal (Focal-JMlab)", "France", "https://www.focal.com", TERMS, out, nospec)
