# Builds data/hp_subs_raw/world/dl-audio.json from dl-audio.ru product pages ("Характеристики" block), read 2026-11-21.
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
D = "/workspace/references/raw/hp_subs/world/dl_audio/pages/"
NAMES = {"legend-12": "Legend 12", "legend-15": "Legend 15", "phoenix-sport-12": "Phoenix Sport 12", "phoenix-sport-15": "Phoenix Sport 15"}
out = []
for slug, name in NAMES.items():
    L = [l.strip() for l in open(D + slug + ".txt", encoding="utf-8")]
    i = L.index("Характеристики"); j = L.index("Видео", i)
    blk = L[i:j]; t = {blk[k]: blk[k+1] for k in range(len(blk) - 1)}
    imp = t.get("Номинальное сопротивление", "")
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)", imp)
    coil, oh, nc = ("DVC", num(m.group(1)), 2) if m else ("SVC", num(imp), 1)
    size = num(t.get("Номинальный диаметр"))
    out.append(driver(model=name, size_in=round(size / 25.4) if size else None, coil=coil, ohms_per_coil=oh, coils=nc,
        rms_w=num(t.get("Номинальная мощность")), fs_hz=num(t.get("Fs")), qts=num(t.get("Qts")), vas_l=num(t.get("VAS")),
        mounting_depth_mm=num(t.get("Посадочная глубина")), cutout_mm=num(t.get("Диаметр монтажного отверстия")), status="current",
        sources=[{"fields": ["*"], "url": f"https://dl-audio.ru/subwoofers/{slug}/", "doc": "DL Audio product page, Характеристики block", "page": None, "read_date": "2026-11-21", "tier": 1}],
        notes=(f"Page lists only Fs, Qts, Vas of the T/S set. Labels translated: Номинальная мощность = rated power (treated as RMS), Номинальное сопротивление = nominal impedance '{imp}', "
               f"Средняя чувствительность = average sensitivity {t.get('Средняя чувствительность')} (test condition not stated, so not put in spl fields), Посадочная глубина = mounting depth, Диаметр монтажного отверстия = cut-out. "
               f"Nominal diameter {t.get('Номинальный диаметр')}, outer diameter {t.get('Внешний диаметр')}, bolt circle {t.get('Расстояние по крепежу')}, voice coil {t.get('Диаметр звуковой катушки')}. "
               "Page offers box drawings (sealed, slot-vented, pipe-vented) as images; not transcribed. Only the 1+1 ohm version is listed.")))
save("dl-audio", "DL Audio", "Russia", "https://dl-audio.ru/",
     "Site footer links privacy policies only (Политика обработки персональных данных, Политика конфиденциальности); no terms of use found. Pages read one at a time, 3 s apart, 2026-11-21. Numbers only.",
     out, extra={"excluded_notes": "All other current DL Audio subs (Anaconda, Barracuda, Gryphon Lite/Pro, Phoenix Black Bass, Phoenix Bass Machine max 1700 W, Piranha, Raven max 1200 W) are below 2000 W per their product pages read 2026-11-21. Archive (https://dl-audio.ru/archive/subwoofers/) lists Phoenix 8/10/12/15; Phoenix 15 is 1500 W."})
