# read through a non-VPN connection (references/raw/hp_subs/direct/reiss-audio/, _extract.json by scripts/a6_reiss_extract.py).
import json
X = json.load(open("/workspace/references/raw/hp_subs/direct/reiss-audio/_extract.json"))
P = "https://www.reissaudio.com.tr/product/"
CAT = "https://www.reissaudio.com.tr/wp-content/uploads/2026/07/Reissaudio-Online.pdf"
# model slug, catalogue RMS (None = not in catalogue), catalogue impedance, catalogue PDF page (pdf.js page index)
ROWS = [("rs-range18", 5000, "D1/D2", 5), ("rs-range15", 4000, "D1/D2", 5), ("rs-range12", 3500, "D1/D2", 5),
        ("rs-thunder15", 4000, "D1/D2", 6), ("rs-thunder12", 2500, "D2/D4", 6), ("rs-skull15", 3000, "D1/D2", 7), ("rs-skull12", 2500, "D1/D2", 7),
        ("rs-vq15", 3500, "D1/D2", 8), ("rs-vq12", 3000, "D1/D2", 8), ("rs-vl15", 3000, "D1/D2", 9), ("rs-vl12", 2500, "D1/D2", 9),
        ("rs-kj15-v2", 2000, "D2/D4", 11), ("rs-kj15", 2000, "D2/D4", 11), ("rs-kj12-v2", 2000, "D2/D4", 11), ("rs-kj12", 2000, "D2/D4", 11),
        ("rs-qx15", 2200, "D2/D4", 17), ("rs-kx15", None, None, None), ("rs-kx12", None, None, None), ("rs-elite15", None, None, None), ("rs-elite18", None, None, None),
        ("rs-rich12", None, None, None), ("rs-rich15", None, None, None), ("rs-rich18", None, None, None),
        ("rs-spl21", None, None, None), ("rs-spl33", None, None, None)]
no_ts = []
for slug, crms, cz, cpg in ROWS:
    s = X[slug]["spec"]; prms = int(s["RMS Power"].split()[0]); pmax = s.get("Max Power")
    note = f"Product page: RMS {s['RMS Power']}, max {pmax}, impedance '{s.get('Impedance')}', size {s.get('Size')}, sensitivity {s.get('Sensitivity')}, frequency response {s.get('Frequency Response')}"
    note += ". "  # P1_PUBLIC_DATA: the product page's marketing sentence is no longer quoted (numbers only)
    if crms is not None:
        note += f"Catalogue {CAT} (pdf page {cpg}): RMS {crms} W, impedance '{cz} Ω' ({'dual 1 ohm or dual 2 ohm versions' if cz=='D1/D2' else 'dual 2 ohm or dual 4 ohm versions'}). "
    else:
        note += "Not in the catalogue PDF; page values only. "
    rms = prms
    if crms is not None and crms != prms:
        rms = None
        note += f"CONFLICT: page {prms} W RMS vs catalogue {crms} W RMS (both maker documents), so rms_w left null. "
    note += "No T/S published (page or catalogue). Read through a non-VPN connection 2026-11-22."
    no_ts.append({"model": s.get("Model", slug.upper()), "rms_w": rms, "url": P + slug + "/", "note": note})
out = {"brand": "Reiss Audio", "country": "Turkey", "brand_url": "https://www.reissaudio.com.tr/",
 "terms_note": "reissaudio.com.tr blocks the container's VPN exit; read on 2026-11-22 through a non-VPN connection (direct route), plain curl.exe output to stdout only, nothing written on a non-VPN connection, at least 6 s between requests: home, subwoofer category (3 pages) and its RMS filter lists, 32 product pages, the 20-page catalogue PDF (19.1 MB). Numbers only. Local copies (audit only): references/raw/hp_subs/direct/reiss-audio/.",
 "drivers": [], "no_ts_published": no_ts,
 "excluded_notes": "Reiss publishes no T/S parameters on its product pages or in its catalogue (" + CAT + "), so every qualifying sub is listed without specs. Below 2000 W RMS (pages and catalogue read 2026-11-22): QX12 1750 W, KM15 1750 W, KM12 1500 W, RX15 1500 W, RX12 Ultra 1200 W on the page / 1500 W in the catalogue, BQ12 1200 W, TX12 1200 W, and the smaller RX, BQ, HK, UX, HS, SL, AK, Volt, Hazelnut and OEM lines (category https://www.reissaudio.com.tr/product-category/subwoofer/, RMS filter 'Up to 500 W' to '1001-2000 W')."}
json.dump(out, open("/workspace/data/hp_subs_raw/world/reiss-audio.json", "w"), indent=1, ensure_ascii=False)
print("reiss-audio.json:", len(no_ts), "no_ts;", [ (x['model'], x['rms_w']) for x in no_ts])
