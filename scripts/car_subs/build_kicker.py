#!/usr/bin/env python3
"""R2_SUBS_ALL: KICKER (Stillwater Designs) car subwoofers, all power levels.
T/S from https://www.kicker.com/app/tsparam/<model>.html (all model pages listed in the maker sitemap, read 2026-11-23),
power, coil, depth, cut-out and box ranges from the product pages that link to that T/S page (spec table).
Raw copies: references/raw/car_subs/kicker/ (ts_*.html, p_*.html). L7X/L7XS 10-18 in come from hp_subs_raw.
Models with a T/S page but no product page in the sitemap (older lines) keep rms/coil null: noted.
Usage: python3 -I build_kicker.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save
R = "/workspace/references/raw/car_subs/kicker/"
SERIES = [("52L7XS", "L7XS SoloX-S"), ("49L7X", "L7X SoloX"), ("48CWRT", "CompRT"), ("48CWR", "CompR"), ("52CVR", "CompVR"), ("52CVT", "CompVT"),
          ("43CVT", "CompVT"), ("50CVX", "CompVX"), ("50CWCD", "CompC DVC"), ("50CWCS", "CompC SVC"), ("44CWCD", "CompC DVC"), ("44CWCS", "CompC SVC"),
          ("50GOLD", "CompGold"), ("51CWQ", "CompQ"), ("42CWQ", "CompQ"), ("44L7S", "Solo-Baric L7S"), ("45L7R", "Solo-Baric L7R"), ("46L7T", "L7T"),
          ("41L7", "Solo-Baric L7"), ("43C", "Comp")]
TSK = {"Re": "re_ohm", "fs": "fs_hz", "Mms": "mms_g", "Bl": "bl_tm", "Qms": "qms", "Qes": "qes", "Qts": "qts", "Vas": "vas_l", "Sd": "sd_cm2",
       "Xmax": "xmax_mm", "Xmas": "xmax_mm", "Lm": "spl_db_1w1m"}


def ts(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = html.unescape(re.sub(r"<[^>]+>", "|", re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S)))
    parts = [p.strip() for p in re.split(r"\|+", t) if p.strip()]
    d = {}
    for i, p in enumerate(parts[:-1]):
        k = p.split(" ")[0] if p.startswith("Mmd") else p
        if k in TSK and TSK[k] not in d:
            try: d[TSK[k]] = float(parts[i + 1])
            except ValueError: pass
        if p == "Lnom" and "lnom" not in d:
            try: d["lnom"] = float(parts[i + 1])
            except ValueError: pass
    return d


def product_pages():
    out = {}
    for f in glob.glob(R + "p_*.html"):
        t = open(f, encoding="utf-8", errors="replace").read()
        pairs = [(html.unescape(re.sub(r"<[^>]+>", "", a)).strip(), html.unescape(re.sub(r"<[^>]+>", "", b)).strip())
                 for a, b in re.findall(r'class="specTitle">(.*?)</td>.*?class="specRecord">(.*?)</td>', t, re.S)]
        for m in set(re.findall(r"/app/tsparam/([A-Z0-9]+)\.html", t)):
            url = "https://www.kicker.com/" + os.path.basename(f)[2:-5]
            man = re.findall(r'href="(/(?:app|files)/manuals/[^"]+\.pdf)"', t)
            out[m] = (url, dict(pairs), man[0] if man else None)
    return out


def two(v):  # "5-3/4, 14.6" -> 14.6 (metric part as printed)
    if not v or "," not in v: return None
    try: return float(v.split(",")[-1])
    except ValueError: return None


pp = product_pages()
drivers = []
for f in sorted(glob.glob(R + "ts_*.html")):
    m = os.path.basename(f)[3:-5]
    if re.match(r"(49L7X(10|12|15|18)|52L7XS)", m): continue  # in hp_subs_raw
    pre, ser = next((p, s) for p, s in SERIES if m.startswith(p))
    rest = m[len(pre):]
    ohm = int(rest[-1]); sz = rest[:-1]
    size = {"67": 6.75}.get(sz, int(sz) if sz.isdigit() else None)
    d = ts(f)
    if not d.get("fs_hz"): print("no T/S", m); continue
    p = {k: v for k, v in d.items() if k != "lnom"}
    page = pp.get(m)
    srcs = [src(f"https://www.kicker.com/app/tsparam/{m}.html", ["params"], doc="KICKER Thiele/Small Parameters page")]
    rms = peak = depth = cut = None; coil = None; boxes = []; notes = []
    if page:
        url, sp0, man = page
        def k(x): return re.sub(r"[^a-z0-9]", "", x.lower())
        sp = {}
        for a, b in sp0.items():
            a2 = k(a)
            for key, pat in (("imp", "impedance"), ("rms", "amplifierpower"), ("rms", "amppower"), ("peak", "peakpower"), ("depth", "mountingdepth"),
                             ("cut", "mountingcutout"), ("cut", "mountingdiameter"), ("smin", "minsealed"), ("smin", "minimumsealed"),
                             ("smax", "maxsealed"), ("smax", "maximumsealed"), ("vmin", "minvented"), ("vmax", "maxvented")):
                if (pat in a2 if key in ("imp", "rms", "peak") else a2.startswith(pat)) and key not in sp: sp[key] = b
        def met(v):  # "5-3/4, 14.6" or ".8 (22.65)" -> metric part as printed
            if not v: return None
            m = re.search(r"\(([\d.]+)\)\s*$", v.strip()) or re.search(r",\s*([\d.]+)\s*$", v.strip())
            try: return float(m.group(1)) if m else None
            except ValueError: return None
        imp = sp.get("imp", "")
        coil = "DVC" if "DVC" in imp else ("SVC" if "SVC" in imp else None)
        rr = sp.get("rms", "")
        try: rms = int(rr.split("-")[-1].strip())
        except ValueError: rms = None
        if "-" in rr: notes.append(f"Maker gives a power range {rr} W RMS; upper bound entered as rms_w.")
        try: peak = int(sp.get("peak", "").strip())
        except ValueError: peak = None
        depth, cut = met(sp.get("depth")), met(sp.get("cut"))
        depth = round(depth * 10, 1) if depth else None; cut = round(cut * 10, 1) if cut else None
        for typ, a, b in (("sealed", "smin", "smax"), ("ported", "vmin", "vmax")):
            lo, hi = met(sp.get(a)), met(sp.get(b))
            if lo or hi:
                boxes.append({"type": typ, "volume_l": None, "volume_range_l": [lo, hi], "tuning_hz": None, "source": "maker product page " + url,
                              "note": "maker gives min and max box volume (litres as printed); no single value"})
        if not coil: notes.append(f"Product page gives impedance '{imp}' without SVC/DVC; coil type left null.")
        srcs.append(src(url, ["rms_w", "peak_w", "coil", "final_loads_ohm", "mounting_depth_mm", "cutout_mm", "recommended_boxes"], doc="product page, specifications table"))
        if man: notes.append(f"Owner's manual: https://www.kicker.com{man} (not read).")
    else:
        notes.append("No product page for this model in the maker sitemap (older line): power, coil type, depth and cut-out not published on the pages read; coil type left null.")
    notes.append("spl_db_1w1m = maker 'Lm' (SPL at 1 m for 1 W at Re)" + (f"; maker Lnom {d['lnom']} dB at nominal impedance." if d.get("lnom") else "."))
    notes.append("ts_basis not stated by the maker.")
    model = f"{ser} {size} ({m})"
    r = rec(model, size, coil, ohm if coil else ohm, rms, peak, p, "per_coil" if coil == "SVC" else "unknown", depth_mm=depth, cut_mm=cut,
            boxes=boxes, status="current" if page else "unknown", sources=srcs, notes=" ".join(notes))
    if not coil: r["final_loads_ohm"] = []; r["notes"] += f" Model code ends in {ohm} (nominal ohms per coil by KICKER's naming; coil count unknown)."
    drivers.append(r)
save("us", "kicker", "KICKER (Stillwater Designs)", "USA", "https://www.kicker.com",
     "R2 2026-11-23: robots.txt Allow / (only /cart/ and one script disallowed); T/S and product pages read 3 s apart, one at a time. Numbers only.",
     drivers, [], coverage="every subwoofer T/S page in the maker sitemap (CompC, CompQ, CompR, CompRT, CompVR, CompVT, CompVX, CompGold, L7, L7R, L7S, L7T, L7X 8 in) + hp_subs_raw L7X/L7XS; marine (KM) and midrange left out")
