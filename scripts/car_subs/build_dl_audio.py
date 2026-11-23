# R2_SUBS_ALL copy of A3's scripts/hp_world_build/dl_audio.py: all model pages of the subwoofer list (A3's 4 saved + R2's pages read 2026-11-23,
# references/raw/car_subs/dl-audio/pages/); writes data/car_subs_raw/world/dl-audio.json. Original: Builds data/hp_subs_raw/world/dl-audio.json from dl-audio.ru product pages ("Характеристики" block), read 2026-11-21.
import os, re, sys
sys.path.insert(0, '/workspace/scripts/hp_world_build'); from hp_common import num, driver
sys.path.insert(0, '/workspace/scripts/car_subs'); import common as C
D2 = '/workspace/references/raw/car_subs/dl-audio/pages/'
D = "/workspace/references/raw/hp_subs/world/dl_audio/pages/"
NAMES = {"legend-12": "Legend 12", "legend-15": "Legend 15", "phoenix-sport-12": "Phoenix Sport 12", "phoenix-sport-15": "Phoenix Sport 15"}
NAMES.update({l.strip(): l.strip().replace("-", " ").title() for l in open("/workspace/references/raw/car_subs/dl-audio/slugs.txt") if l.strip()})
out = []
for slug, name in NAMES.items():
    path = D + slug + ".txt" if os.path.exists(D + slug + ".txt") else D2 + slug + ".txt"
    if not os.path.exists(path): continue
    L = [l.strip() for l in open(path, encoding="utf-8")]
    if "Характеристики" not in L: print("no spec block", slug); continue
    i = L.index("Характеристики"); j = L.index("Видео", i) if "Видео" in L[i:] else len(L)
    blk = L[i:j]; t = {blk[k]: blk[k+1] for k in range(len(blk) - 1)}
    imp = t.get("Номинальное сопротивление", "")
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)", imp)
    coil, oh, nc = ("DVC", num(m.group(1)), 2) if m else ("SVC", num(imp), 1)
    size = num(t.get("Номинальный диаметр"))
    out.append(driver(model=name, size_in=round(size / 25.4) if size else None, coil=coil, ohms_per_coil=oh, coils=nc,
        rms_w=num(t.get("Номинальная мощность")), fs_hz=num(t.get("Fs")), qts=num(t.get("Qts")), vas_l=num(t.get("VAS")),
        mounting_depth_mm=num(t.get("Посадочная глубина")), cutout_mm=num(t.get("Диаметр монтажного отверстия")), status="current",
        sources=[{"fields": ["*"], "url": f"https://dl-audio.ru/subwoofers/{slug}/", "doc": "DL Audio product page, Характеристики block", "page": None, "read_date": ("2026-11-23" if path.startswith(D2) else "2026-11-21"), "tier": 1}],
        notes=(f"Page lists only Fs, Qts, Vas of the T/S set. Labels translated: Номинальная мощность = rated power (treated as RMS), Номинальное сопротивление = nominal impedance '{imp}', "
               f"Средняя чувствительность = average sensitivity {t.get('Средняя чувствительность')} (test condition not stated, so not put in spl fields), Посадочная глубина = mounting depth, Диаметр монтажного отверстия = cut-out. "
               f"Nominal diameter {t.get('Номинальный диаметр')}, outer diameter {t.get('Внешний диаметр')}, bolt circle {t.get('Расстояние по крепежу')}, voice coil {t.get('Диаметр звуковой катушки')}. "
               "Page offers box drawings as images; not transcribed.")))
for r in out:
    if r["size_in"] == 6: r["size_in"] = 6.5  # 165 mm class
C.save("world", "dl-audio", "DL Audio", "Russia", "https://dl-audio.ru/",
     "R2 2026-11-23: A3's 4 saved pages plus the other model pages of https://dl-audio.ru/subwoofers/ read one at a time 3 s apart. Site shows privacy policies only. Numbers only.",
     out, [], coverage="every model page in the maker's subwoofer list (SE box versions left out)")
