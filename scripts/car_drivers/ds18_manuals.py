"""R4B_DRIVERS_MORE (2026-11-23): read DS18 owner's manual spec tables (PDF text from scripts/pdf_text.mjs, saved next to each PDF in
references/raw/car_drivers/ds18/manuals/). Two layouts are read:
 A) one line per field: 'Label / Spanish label ....... [Abbrev ....] value'
 B) a block of dotted labels followed by the same number of value lines, in order (only accepted when the counts are equal).
manual_kv(pdf_name, sku) returns {'main': {label: value}} (the shape build_ds18.kv() returns) or None when the manual is image-only,
covers several models in columns, does not name the SKU, or the layout is not one of the two above. Untrusted text: parsed only."""
import re, os

MAN = "/workspace/references/raw/car_drivers/ds18/manuals/"
DOTS = re.compile(r"(?:\.\s*){4,}")


def _lines(pdf):
    p = MAN + pdf[:-4] + ".txt"
    if not os.path.exists(p): return None
    return open(p, encoding="utf-8", errors="replace").read().split("\n")


def _norm(s): return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def manual_kv(pdf, sku):
    L = _lines(pdf)
    if not L or sum(len(x) for x in L) < 400: return None, "image-only or empty text"
    text = "\n".join(L)
    if _norm(sku) and _norm(sku) not in _norm(text) and _norm(sku) not in _norm(pdf): return None, "manual does not name the SKU"
    d = {}
    # layout A
    for x in L:
        if not DOTS.search(x): continue
        parts = DOTS.split(x)
        lab, val = parts[0].strip(), parts[-1].strip()
        if not val or not lab: continue
        if len(parts) == 3 and re.match(r"^[A-Za-z][A-Za-z-]{1,5}$", parts[1].strip()) and lab.lower().startswith("mechanical mass"):
            val = parts[1].strip() + " " + val  # 'Mechanical Mass .. Mms .. 8.3g' -> 'Mms 8.3g' as on the product pages
        d.setdefault(lab, val)
    if len(d) >= 6:
        return {"main": d}, "layout A"
    # layout B (label block, then value block) was tried on 17 manuals 2026-11-23 and the value order did not follow the label order
    # (e.g. 'Nominal Diameter' -> '62Hz-6.3 KHz'), so it is NOT used; those manuals stay unread (would need a visual read).
    return None, "layout B (label block + value block, order not reliable): not used"
    # layout B: per page, dotted labels without values, then values
    pages, cur = [], []
    for x in L:
        if x.startswith("=== page"): pages.append(cur); cur = []
        else: cur.append(x)
    pages.append(cur)
    for pg in pages:
        labs = [i for i, x in enumerate(pg) if DOTS.search(x) and not DOTS.split(x)[-1].strip()]
        if len(labs) < 8: continue
        vals = [x.strip() for x in pg[labs[-1] + 1:] if x.strip()]
        labels = [DOTS.split(pg[i])[0].strip() for i in labs]
        if len(vals) != len(labels): return None, f"layout B: {len(labels)} labels, {len(vals)} values (not aligned, not used)"
        vals = vals[:len(labels)]
        # the first value of the block must look like a size or measurement (sanity on alignment)
        d = {}
        for lab, v in zip(labels, vals):
            if lab.lower().startswith("mechanical mass") and not v.lower().startswith("mms"): v = "Mms " + v
            for a in ("Vas", "Fs", "Qms", "Qes", "Qts", "Re", "Le", "Sd", "BL", "X-max"):
                if lab.endswith(" " + a): lab = lab[: -len(a)].strip(); break
            d.setdefault(lab, v)
        return {"main": d}, f"layout B ({len(labels)} labels)"
    return None, "no spec table found"
