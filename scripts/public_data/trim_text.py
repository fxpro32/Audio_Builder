#!/usr/bin/env python3
"""P1_PUBLIC_DATA (2026-11-23): text trims in the public driver data (references/terms_check_public_release.md section 4), applied
to the data files in place; idempotent. The builders were changed the same way, so a rebuild keeps the trims:
scripts/a6_build/reiss.py, scripts/car_drivers/build_gladen.py, scripts/car_drivers/build_ct_sounds.py, scripts/hp_subs/build_dd.py,
scripts/car_subs/build_dd.py.
- Reiss Audio: the quoted product-page sentence ("page text: '...'") is removed from the notes (numbers only).
- Gladen: stray page text after "Ja" in the "Bi-Amping-fähig" field is removed.
- CT Sounds: the "What's Included" box-contents list is dropped.
- DD Audio terms_note: the wrong "terms cover orders only" statement is replaced by the real clause, quoted neutrally.
Usage: python3 -I scripts/public_data/trim_text.py [dataDir]   (default /workspace/data)"""
import json, re, sys, glob, os

DATA = sys.argv[1] if len(sys.argv) > 1 else "/workspace/data"
DD_QUOTE = ('Terms and Conditions https://ddaudio.com/terms-and-conditions/ (read 2026-11-23) say: '
            '"You may use the content of this site only for the purpose of shopping on this site or placing an order on this site and for no other purpose. '
            'No materials from this site may be copied, reproduced, modified, republished, uploaded, posted, transmitted, or distributed in any form or by any means without our prior written permission." '
            'Only numeric specifications and source links are recorded here; no text or images.')
DD_HP = "WordPress site. robots.txt disallows only /wp-admin/. " + DD_QUOTE + " Pages read 5 s apart. Numbers only."
DD_R2 = "R2 2026-11-23: robots.txt disallows only /wp-admin/; see the terms quote in the hp_subs_raw note. Pages A2 had saved re-used; the other current and archive subwoofer pages read 4 s apart. Numbers only."
PAGE_TEXT = re.compile(r"; page text: '.*?'\. (?=Catalogue |Not in the catalogue)", re.S)


def load(p): return json.load(open(p))
def dump(p, d): json.dump(d, open(p, "w"), indent=1, ensure_ascii=False)


changed = {}
for p in glob.glob(f"{DATA}/hp_subs_raw/*/reiss-audio.json") + glob.glob(f"{DATA}/car_subs_raw/*/reiss-audio.json"):
    d = load(p); n = 0
    for rec in d.get("no_ts_published", []) + d.get("drivers", []):
        new = PAGE_TEXT.sub(". ", rec.get("note") or "")
        if new != (rec.get("note") or ""): rec["note"] = new; n += 1
    left = json.dumps(d).count("page text")
    if n: dump(p, d)
    changed[p] = f"{n} notes trimmed, 'page text' left: {left}"
for p in glob.glob(f"{DATA}/car_drivers_raw/*/gladen.json"):
    d = load(p); n = 0
    for r in d.get("drivers", []):
        ap = ((r.get("passive_crossover") or {}).get("as_printed") or {})
        for k, v in list(ap.items()):
            if isinstance(v, str) and re.search(r"\bMatching products\b", v):
                ap[k] = re.split(r"\s*Matching products\b", v)[0]; n += 1
    if n: dump(p, d)
    changed[p] = f"{n} fields trimmed"
for p in glob.glob(f"{DATA}/car_drivers_raw/*/ct-sounds.json"):
    d = load(p); n = 0
    for r in d.get("drivers", []):
        ap = ((r.get("passive_crossover") or {}).get("as_printed") or {})
        for k in list(ap):
            if re.match(r"(?i)what.s included", k): del ap[k]; n += 1
    if n: dump(p, d)
    changed[p] = f"{n} lists dropped"
for p in glob.glob(f"{DATA}/hp_subs_raw/*/dd-audio.json"):
    d = load(p)
    if d.get("terms_note") != DD_HP: d["terms_note"] = DD_HP; dump(p, d); changed[p] = "terms_note corrected"
for p in glob.glob(f"{DATA}/car_subs_raw/*/dd-audio.json"):
    d = load(p); want = DD_R2 + " | hp_subs_raw terms note: " + DD_HP
    if d.get("terms_note") != want: d["terms_note"] = want; dump(p, d); changed[p] = "terms_note corrected"
for k, v in changed.items(): print(os.path.relpath(k, DATA), ":", v)
