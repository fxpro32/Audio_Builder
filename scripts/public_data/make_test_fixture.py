#!/usr/bin/env python3
"""P1_PUBLIC_DATA (2026-11-23): writes app/tests/fixtures/board_catalogues.json, a small SYNTHETIC board catalogue for the tests
(nest, bom, plywood), committed so the tests pass on a fresh clone without the private supplier catalogues.
Same schema as data/private/boards/mdf_sheets_au.json and plywood_sheets_au.json. Suppliers are "Supplier A/B/C"; prices are made
up by a formula (area m2 x thickness mm x a factor per supplier), not real prices. The layout keeps the cases the tests need:
one supplier selling 18 mm MDF only as 3600 x 1200; "comparison only" sheets (birch 18 mm); hoop pine at 12.5 / 18.5 mm next to
12 / 18 mm; 19 mm structural; every plywood material present. Densities: the maker figures already in app/src/engine/boardmat.ts.
Deterministic. Usage: python3 -I scripts/public_data/make_test_fixture.py"""
import json, os

K = {"Supplier A": 1.6, "Supplier B": 1.45, "Supplier C": 1.7}
CMP = "comparison only (synthetic test record)"
def recs(sup, cat, label, sizes, thicks, note=""):
    out = []
    for L, W in sizes:
        for t in thicks:
            out.append({"supplier": sup, "product": f"{label} {L}x{W}x{t}mm (test)", "item": "", "category": cat, "lengthMm": L, "widthMm": W, "thicknessMm": t,
                        "priceAud": round(L * W / 1e6 * t * K[sup], 2), "priceDate": "2026-11-23", "url": None, "note": ("synthetic test value, not a real price" + (f"; {note}" if note else ""))})
    return out

mdf = (recs("Supplier A", "standard", "MDF", [(2400, 1200), (1200, 600), (900, 600)], [12, 16, 18, 25])
       + recs("Supplier A", "moisture_resistant", "MDF MR", [(2400, 1200)], [16, 18])
       + recs("Supplier B", "standard", "MDF", [(3600, 1200)], [16, 18, 25]) + recs("Supplier B", "standard", "MDF", [(2400, 1200)], [12, 16])
       + recs("Supplier C", "standard", "MDF", [(1800, 900), (2700, 1200)], [16, 18], CMP))
ply = (recs("Supplier A", "birch plywood", "Birch", [(2440, 1220)], [12, 18, 24]) + recs("Supplier A", "birch plywood", "Birch", [(1200, 600)], [18])
       + recs("Supplier C", "birch plywood", "Birch", [(2440, 1220)], [18], CMP)
       + recs("Supplier A", "marine plywood", "Marine", [(2400, 1200)], [12, 18, 25]) + recs("Supplier B", "marine plywood", "Marine", [(2440, 1220)], [18])
       + recs("Supplier B", "hoop pine plywood", "Hoop pine", [(2400, 1200)], [12, 12.5, 18, 18.5, 19])
       + recs("Supplier A", "structural plywood", "Structural", [(2400, 1200)], [12, 17, 19, 25])
       + recs("Supplier B", "non-structural plywood", "Non-structural", [(2400, 1200)], [12, 18])
       + recs("Supplier A", "exterior plywood", "Exterior", [(2440, 1220)], [12, 18])
       + recs("Supplier B", "formwork plywood", "Formwork", [(2400, 1200)], [17])
       + recs("Supplier A", "decorative plywood", "Decorative", [(1200, 600)], [12]))
common = {"kerfMmDefault": 3.2, "kerfNote": "test", "edgeTrimMmDefault": 5, "edgeTrimNote": "test", "sources": []}
out = {
    "note": "SYNTHETIC test catalogue (scripts/public_data/make_test_fixture.py): made-up suppliers and formula prices, not real data.",
    "mdf": {"description": "synthetic MDF test catalogue", **common, "sheets": mdf},
    "plywood": {"description": "synthetic plywood test catalogue", **common, "grainNote": "test",
                "densityKgM3": [
                    {"type": "birch plywood", "kgM3": 680, "source": "https://www.metsagroup.com/globalassets/metsa-wood/dop-documents/dop_metsa_wood_birch_plywood_muf_2019-12-2_en.pdf"},
                    {"type": "hoop pine plywood (incl. hoop pine marine)", "kgM3": 600, "source": "https://harmenk.squarespace.com/s/Hoop-Pine-B_B-Data-Sheet.pdf"},
                    {"type": "radiata pine structural / non-structural plywood", "kgM3": 550, "source": "https://borg.bynder.com/asset/b69e0712-31e2-469b-b28b-17f1eb78b40a/STRUCTAply-Technical-Statement.pdf"},
                    {"type": "hardwood marine (BS 1088) and other imported hardwood plywood", "kgM3": None, "source": "UNVERIFIED"},
                    {"type": "MDF (comparison)", "kgM3": 740, "source": "https://media.bunnings.com.au/api/public/content/498eddb35e654b6ba662402e9906420e"}],
                "sheets": ply},
}
p = "/workspace/app/tests/fixtures/board_catalogues.json"
os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump(out, open(p, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"wrote {p}: {len(mdf)} MDF + {len(ply)} plywood synthetic sheets")
