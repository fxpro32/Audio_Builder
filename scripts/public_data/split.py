#!/usr/bin/env python3
"""P1_PUBLIC_DATA (2026-11-23): keep retailer and supplier data out of the public (tracked) data, in a private overlay.
Spec: references/terms_check_public_release.md. Idempotent: run it again after any builder has rewritten a public file.

Public = data/<path> (tracked in git). Private overlay = data/private/<same path> (gitignored, the owner's machine only).
1. Moves (whole files) to the private overlay, same relative path:
   data/prices_au/*                      -> data/private/prices_au/
   data/parts_raw/_prices_au/*           -> data/private/parts_raw/_prices_au/
   data/boards/mdf_sheets_au.json, plywood_sheets_au.json -> data/private/boards/ (the single Mitre 10 record is dropped)
   data/parts_raw/<cat>/<brand>.json whose records come from a retailer listing (source tier "retailer": Frankies Auto
     Electrics and Sky High Car Audio listings of other brands) -> data/private/parts_raw/<cat>/<brand>.json
   data/car_subs_raw/*/vibe.json, data/hp_subs_raw/*/vibe.json (read past a bot block) -> data/private/<same path>
2. Price fields: a maker-tier parts_raw file that carries any price field is copied in full to data/private/parts_raw/<same
   path>, and the public file keeps every value except the price fields (every key containing "price", at any depth).
   data/car_drivers_raw/**: the price_au field is removed (the prices stay in data/private/prices_au/join_car_drivers.json,
   which scripts/import_car_drivers.mjs reads for the private bundle).
Then run the importers (scripts/import_parts.mjs, import_hp_subs.mjs, import_car_subs.mjs, import_car_drivers.mjs): each writes
the public bundle to data/... and, when private inputs exist, the full bundle to data/private/....
Usage: python3 -I scripts/public_data/split.py [dataDir]   (default /workspace/data)"""
import json, os, re, sys, glob, shutil

DATA = "/workspace/data"
PRIV = os.path.join(DATA, "private")
log = []


def set_data(d):
    global DATA, PRIV
    DATA = os.path.abspath(d); PRIV = os.path.join(DATA, "private")


def rel(p): return os.path.relpath(os.path.abspath(p), DATA)
def load(p): return json.load(open(p, encoding="utf-8"))
def dump(p, d):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(d, open(p, "w", encoding="utf-8"), indent=1, ensure_ascii=False)


def move(src):
    """Move one public file to the same relative path under data/private (a newer public file replaces the private one)."""
    dst = os.path.join(PRIV, rel(src))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.move(src, dst)
    log.append(f"moved {rel(src)} -> private/{rel(src)}")
    return dst


def has_price_key(o):
    if isinstance(o, dict): return any("price" in k.lower() or has_price_key(v) for k, v in o.items())
    if isinstance(o, list): return any(has_price_key(x) for x in o)
    return False


def has_price(o):
    """A price key, or a price name in a source's `fields` list."""
    if isinstance(o, dict): return any("price" in k.lower() or (k == "fields" and isinstance(v, list) and any(isinstance(x, str) and "price" in x.lower() for x in v)) or has_price(v) for k, v in o.items())
    if isinstance(o, list): return any(has_price(x) for x in o)
    return False


def strip_price(o):
    """Every key containing "price" removed, and "price..." names in a source's `fields` list (e.g. "price_aud")."""
    if isinstance(o, dict): return {k: ([x for x in v if not (isinstance(x, str) and "price" in x.lower())] if k == "fields" and isinstance(v, list) else strip_price(v))
                                    for k, v in o.items() if "price" not in k.lower()}
    if isinstance(o, list): return [strip_price(x) for x in o]
    return o


def is_retailer_file(d):
    tiers = {s.get("tier") for r in d.get("records", []) for s in r.get("sources", [])}
    return "retailer" in tiers


def split_parts_file(f):
    """One data/parts_raw/<cat>/<brand>.json: retailer file -> moved private; maker file with prices -> full copy private,
    prices stripped in public. Returns "moved" | "split" | "kept". Used by scripts/parts/common.py write() after every build."""
    d = load(f)
    if is_retailer_file(d): move(f); return "moved"
    if has_price(d):
        pf = os.path.join(PRIV, rel(f))
        # a public file with real price values (fresh from a builder) replaces the private copy; one that only names a price
        # field in a source's `fields` list (already split earlier) leaves the private copy alone
        if has_price_key(d) or not os.path.exists(pf): dump(pf, d)
        dump(f, strip_price(d)); return "split"
    return "kept"


def drop_mitre10(pf):
    """The single Mitre 10 board record is dropped (its terms were unreadable and its robots.txt blocks AI crawlers)."""
    b = load(pf); n0 = len(b.get("sheets", []))
    b["sheets"] = [s for s in b.get("sheets", []) if not re.match(r"(?i)mitre ?10", s.get("supplier", ""))]
    if isinstance(b.get("sources"), list): b["sources"] = [s for s in b["sources"] if not re.search(r"(?i)mitre ?10", json.dumps(s))]
    if len(b["sheets"]) != n0: dump(pf, b); log.append(f"{rel(pf)}: {n0 - len(b['sheets'])} Mitre 10 record(s) dropped")


def main():
    # 1. whole folders / files
    for f in sorted(glob.glob(f"{DATA}/prices_au/*")) + sorted(glob.glob(f"{DATA}/parts_raw/_prices_au/*")):
        if os.path.isfile(f): move(f)
    for d in (f"{DATA}/prices_au", f"{DATA}/parts_raw/_prices_au"):
        if os.path.isdir(d) and not os.listdir(d): os.rmdir(d)
    for name in ("mdf_sheets_au.json", "plywood_sheets_au.json"):
        f = f"{DATA}/boards/{name}"
        if os.path.exists(f): move(f)
        if os.path.exists(f"{PRIV}/boards/{name}"): drop_mitre10(f"{PRIV}/boards/{name}")
    for f in sorted(glob.glob(f"{DATA}/car_subs_raw/*/vibe.json") + glob.glob(f"{DATA}/hp_subs_raw/*/vibe.json")): move(f)
    # 2. parts_raw: retailer files move, maker files keep a full private copy and lose their price fields in public
    c = {"moved": 0, "split": 0, "kept": 0}
    for f in sorted(glob.glob(f"{DATA}/parts_raw/*/*.json")):
        if "/_" in f.replace(DATA, ""): continue
        c[split_parts_file(f)] += 1
    log.append(f"parts_raw: {c['moved']} retailer files moved, {c['split']} maker files split (full copy private, prices stripped in public), {c['kept']} maker files already without prices")
    # 3. car_drivers_raw: price_au removed (prices live in data/private/prices_au/join_car_drivers.json)
    jf = f"{PRIV}/prices_au/join_car_drivers.json"
    join = load(jf).get("records", {}) if os.path.exists(jf) else {}
    n_files = n_rec = mism = 0
    for f in sorted(glob.glob(f"{DATA}/car_drivers_raw/*/*.json")):
        d = load(f); ch = False; r_ = os.path.relpath(f, f"{DATA}/car_drivers_raw")
        for r in d.get("drivers", []):
            if "price_au" in r:
                if r["price_au"] and join.get(f"{r_}#{r.get('model')}") != r["price_au"]: mism += 1
                del r["price_au"]; ch = True; n_rec += 1
        if ch: dump(f, d); n_files += 1
    log.append(f"car_drivers_raw: price_au removed from {n_rec} records in {n_files} files; records whose price_au differed from the private join file: {mism}")
    for l in log: print(l)


if __name__ == "__main__":
    set_data(sys.argv[1] if len(sys.argv) > 1 else "/workspace/data")
    main()
