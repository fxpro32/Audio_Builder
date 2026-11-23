#!/usr/bin/env python3
"""R2_SUBS_ALL: Audiotec Fischer (Germany) brands HELIX, BRAX, MATCH: car subwoofer drivers.
T/S from the maker data sheets (audiotec-fischer.de/media/pdf/.../Datenblatt-*.pdf, one per coil variant) and, where no sheet was
linked, from the product page 'Technical data' table. Depth and cut-out from the product page table. Read 2026-11-23.
Raw: references/raw/car_subs/audiotec/. Enclosures (IK E...), active subs and kits left out. Usage: python3 -I build_audiotec.py"""
import sys, re, glob, os, html
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, box, src, save
R = "/workspace/references/raw/car_subs/audiotec/"
pdfurl = {l.split()[1]: l.split()[0] for l in open(R + "list_pdf.txt") if l.strip()}
pageurl = {l.split()[1]: l.split()[0] for l in open(R + "list.txt") if l.strip()}


def n(s):
    if s is None: return None
    v = float(s.replace(",", "."))
    return int(v) if v.is_integer() else v


def ptext(f):
    t = open(f, encoding="utf-8", errors="replace").read()
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S | re.I)
    t = html.unescape(re.sub(r"<[^>]+>", "|", t)); t = re.sub(r"\s+", " ", t); return re.sub(r"(\s*\|\s*)+", "|", t)


def parse(t, page):
    """t: '|'-joined text (PDF lines or page cells). Returns dict of values."""
    tm = "– / +1 TM" in t
    t = re.sub(r"\|– / \+1 TM / \+2 TM / \+3 TM\|([\d.,]+)( ?[A-Za-z]*)[^|]*", r" \1\2", t)
    g = lambda pat: (re.search(pat, t) or [None, None])[1]
    d = {}
    pw = re.search(r"RMS\|Max\.\|([\d.,]+) W\|([\d.,]+) W", t) or re.search(r"RMS / max\.\|(?:P\|)?([\d.,]+) / ([\d.,]+) Watt", t)
    if pw: d["rms"], d["peak"] = n(pw.group(1).replace(".", "")), n(pw.group(2).replace(".", ""))
    z = re.search(r"\|Z\|?\s*(?:(\d) x )?([\d.,]+) Ω", t)
    if z: d["coils"], d["ohm"] = int(z.group(1) or 1), n(z.group(2))
    re_ = re.search(r"\|Re\|?\s*(?:\d x )?([\d.,]+) Ω", t)
    d["re_ohm"] = n(re_.group(1)) if re_ else None
    for k, pat in (("fs_hz", r"\|Fs\|?\s*([\d.,]+) Hz"), ("qms", r"\|Qms\|?\s*([\d.,]+)"), ("qes", r"\|Qes\|?\s*([\d.,]+)"), ("qts", r"\|Qts\|?\s*([\d.,]+)"),
                   ("vas_l", r"\|Vas\|?\s*([\d.,]+) L"), ("bl_tm", r"\|B\*I\|?\s*([\d.,]+) Tm"), ("sd_cm2", r"\|Sd\|?\s*([\d.,]+) cm"), ("mms_g", r"\|Mms\|?\s*([\d.,]+) g"),
                   ("xmax_mm", r"Xmax\|?\s*\+/- ([\d.,]+) mm"), ("spl_db_2v83", r"([\d.,]+) dB @ 2,?\.?83 ?V"), ("spl_db_1w1m", r"([\d.,]+) dB @ 1 ?W")):
        m = re.search(pat, t)
        d[k] = n(m.group(1)) if m else None
    sb = re.search(r"Sealed box\|(?:Geschlossenes Gehäuse\|)?Net volume\|(?:Nettovolumen\|)?([\d.,]+) L", t)
    vb = re.search(r"Vented box\|(?:Bassreflex[^|]*\|)?Net volume\|(?:Nettovolumen\|)?([\d.,]+) L", t)
    fb = re.search(r"Port tuning frequency\|(?:[^|]*\|)?(?:Fb\|)?\s*(?:Fb )?([\d.,]+) Hz", t)
    d["boxes"] = ([box("sealed", None, None, "maker data sheet / page", litres=n(sb.group(1)), note="net volume")] if sb else []) + \
                 ([box("ported", None, n(fb.group(1)) if fb else None, "maker data sheet / page", litres=n(vb.group(1)), note="net volume")] if vb else [])
    d["tm"] = tm
    return d


drivers, done = [], set()
pages = {}
for f in sorted(glob.glob(R + "*_*.html")):
    pt = ptext(f)
    dep = re.search(r"Installation depth\|(?:[^|]*\|)?([\d.,]+) mm", pt); cut = re.search(r"Installation diameter\|(?:ø\|)?([\d.,]+) mm", pt)
    pages[os.path.basename(f)] = (pt, n(dep.group(1)) if dep else None, n(cut.group(1)) if cut else None)
def page_for(model):
    key = re.sub(r"[^a-z0-9]", "", model.lower())
    for name, v in sorted(pages.items(), key=lambda kv: -len(kv[0])):
        base = re.sub(r"[^a-z0-9]", "", name.split("_", 1)[1][:-5].replace("-sub", "").replace("matrix-", ""))
        if key.startswith(base) or base.startswith(key) or base in key: return name, v
    return None, (None, None, None)
items = []
for f in sorted(glob.glob(R + "pdf_*.txt")):
    t = "|" + "|".join(l.strip() for l in open(f, encoding="utf-8", errors="replace") if l.strip()) + "|"
    m = re.search(r"\|((?:IK|IQ|K) ?[A-Z0-9]+-(?:DVC|SVC)\d|PP \d+W-Q|PP-\d+W-Q|MATRIX ML\d+[- ]SUB|ML\d+ SUB)\|", t, re.I)
    model = m.group(1) if m else os.path.basename(f)[15:-4]
    brand = "HELIX" if "HELIX" in f else ("BRAX" if "BRAX" in f else "MATCH")
    items.append((brand, model, t, pdfurl.get(os.path.basename(f)[:-4] + ".pdf"), "data sheet PDF"))
for name, (pt, dep, cut) in pages.items():  # page table only where no sheet covered the page's own variant
    if "Technical data|Power" not in pt: continue
    key = re.sub(r"[^a-z0-9]", "", name.split("_", 1)[1][:-5].replace("matrix-", "").replace("-sub", "").replace("-dvc2", ""))
    if any(key in re.sub(r"[^a-z0-9]", "", k.lower()) for k in pdfurl): continue  # covered by its data sheet(s)
    pt = pt[pt.find("Technical data|Power"):]
    model = {"brax_matrix-ml10-sub.html": "MATRIX ML10 SUB", "match_pp-8w-q.html": "PP 8W-Q", "match_pp-10w-q.html": "PP 10W-Q"}.get(name, name.split("_", 1)[1][:-5].upper())
    if any(re.sub(r"\W", "", model.lower()) == re.sub(r"\W", "", it[1].lower()) for it in items): continue
    brand = name.split("_")[0].upper()
    items.append((brand, model, pt, pageurl[name], "product page, Technical data table"))
for brand, model, t, url, doc in items:
    d = parse(t, None)
    if not d.get("fs_hz"): print("no T/S", brand, model); continue
    name, (pt, dep, cut) = page_for(model.replace("MATRIX ", ""))
    sz = re.search(r"[WS](\d+)|ML(\d+)|PP[ -](\d+)W", model)
    size = int(next(x for x in sz.groups() if x)) if sz else None
    coils = d.get("coils"); coil = {1: "SVC", 2: "DVC", 4: "QVC"}.get(coils)
    p = {k: d.get(k) for k in ("fs_hz", "re_ohm", "qms", "qes", "qts", "vas_l", "sd_cm2", "xmax_mm", "mms_g", "bl_tm", "spl_db_1w1m", "spl_db_2v83")}
    srcs = [src(url, doc=doc)]
    if name and pageurl.get(name) != url: srcs.append(src(pageurl[name], ["mounting_depth_mm", "cutout_mm"], doc="product page, Technical data table"))
    drivers.append(rec(f"{brand} {model}", size, coil, d.get("ohm"), d.get("rms"), d.get("peak"), p, "per_coil" if coil == "SVC" else "unknown",
                       depth_mm=dep, cut_mm=cut, boxes=d["boxes"], status="current", sources=srcs,
                       notes=("Re printed per coil ('2 x' value); ts_basis not stated. " if coil == "DVC" else "") + "Decimal commas as printed converted to points. Xmax printed '+/-' (one-way)."
                             + ("" if dep else " Mounting depth / cut-out not matched to a product page.")
                             + (" Maker gives values without and with 1 to 3 add-on tuning masses (TM); the values without added mass are entered." if d.get("tm") else "")))
save("world", "audiotec-fischer", "Audiotec Fischer (HELIX, BRAX, MATCH)", "Germany", "https://www.audiotec-fischer.de",
     "R2 2026-11-23: robots.txt disallows only account/checkout/listing paths. 15 product pages and 19 data sheets read 3 s apart. EU maker: per-model facts only. Numbers only.",
     drivers, [], coverage="all subwoofer drivers in the HELIX, BRAX and MATCH subwoofer categories (IK S/W, IQ W, K 12W, BRAX ML8/ML10 SUB, MATCH PP 8W-Q/10W-Q); enclosures and active subs left out")
