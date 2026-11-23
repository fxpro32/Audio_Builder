#!/usr/bin/env python3
"""P1_PUBLIC_DATA (2026-11-23): writes data/boards/generic_sheets.json, the public board list for the Boards tab and the BOM.
Generic sheet sizes and thicknesses commonly sold in Australia (sizes such as 2400 x 1200, 1800 x 900, 1200 x 600 mm MDF and
2400 x 1200 / 2440 x 1220 mm plywood, seen at several Australian suppliers in the private supplier catalogue), with NO prices, NO
supplier names and NO product links. Same record schema as the private supplier catalogues
(data/private/boards/mdf_sheets_au.json and plywood_sheets_au.json), which the server serves instead when they exist.
The server sends the MDF records (category standard / moisture_resistant) for /api/boards and the plywood records for
/api/boards/plywood. Deterministic. Usage: python3 -I scripts/public_data/make_generic_sheets.py [dataDir]"""
import json, os, sys

DATA = sys.argv[1] if len(sys.argv) > 1 else "/workspace/data"
SUP = "Generic size"
NOTE = "generic size, no price: check what your local supplier sells"
rows = []
def add(cat, label, sizes, thicks):
    for L, W in sizes:
        for t in thicks:
            rows.append({"supplier": SUP, "product": f"{label} {L} x {W} x {t} mm", "item": "", "category": cat, "lengthMm": L, "widthMm": W,
                         "thicknessMm": t, "priceAud": None, "priceDate": None, "url": None, "note": NOTE})
add("standard", "MDF", [(2400, 1200), (1800, 900), (1200, 600)], [12, 16, 18, 25])
add("moisture_resistant", "MDF moisture resistant", [(2400, 1200)], [16, 18, 25])
add("birch plywood", "Birch plywood", [(2440, 1220), (1200, 600)], [12, 15, 18, 24])
add("marine plywood", "Marine plywood", [(2400, 1200), (2440, 1220)], [12, 15, 18, 25])
add("structural plywood", "Structural plywood", [(2400, 1200)], [12, 15, 17, 19, 25])
add("hoop pine plywood", "Hoop pine plywood", [(2400, 1200)], [12, 18])
add("non-structural plywood", "Non-structural plywood", [(2400, 1200)], [12, 18])
add("exterior plywood", "Exterior plywood", [(2440, 1220)], [12, 18])
out = {
    "description": "Generic MDF and plywood sheet sizes and thicknesses commonly sold in Australia, for laying out panels. No prices and no suppliers: the public repository does not include supplier catalogues. Check the sizes and thicknesses your local supplier sells (plywood thickness is often a little off the label, for example 18.5 mm hoop pine). Sizes in mm (lengthMm >= widthMm).",
    "generic": True,
    "kerfMmDefault": 3.2,
    "kerfNote": "3.2 mm = typical full-kerf table saw or panel saw blade; track saw blades are often about 2.2 mm. Use your own blade width when known.",
    "edgeTrimMmDefault": 5,
    "edgeTrimNote": "Allowance per factory edge to clean up a damaged or out-of-square edge before laying out parts. MDF makers allow about 2 mm per m on length, width and squareness, so a 2400 mm edge may be up to about 5 mm off. 5 mm is a judgement default, not a standard figure; 0 = use factory edges as-is.",
    "grainNote": "Plywood is stiffer along the face grain (the sheet's length). For long baffles or panels, lay the long side along the sheet length where possible.",
    "sources": [],
    "sheets": rows,
}
p = os.path.join(DATA, "boards", "generic_sheets.json")
os.makedirs(os.path.dirname(p), exist_ok=True)
json.dump(out, open(p, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"wrote {p}: {len(rows)} generic sheets")
