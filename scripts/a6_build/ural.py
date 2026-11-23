# (local copies references/raw/hp_subs/direct/ural/, parsed by scripts/a6_ural_extract.py -> _extract.json).
import json
RD = "2026-11-22"
C = "https://ural-auto.ru/catalog/"
X = json.load(open("/workspace/references/raw/hp_subs/direct/ural/_extract.json"))
def f(s): return None if s is None else float(s.replace(",", "."))
LAB = ("Labels translated: Номинальная мощность = rated power (treated as RMS, as for the other Russian makers), Максимальная мощность = maximum power, "
       "Сопротивление '1+1'/'2+2 Ом' = dual 1/2 ohm coils, Установочная глубина = mounting depth, Диаметр монтажного отверстия = cut-out, "
       "Чувствительность = sensitivity (test condition not stated, so not put in spl fields). Re and Sd are not published; Cms printed without a unit (not used). ")
def rec(key, model, size, ohm, url, status, extra=""):
    s = X[key]["spec"]
    g = lambda k: f(s.get(k))
    return {"model": model, "size_in": size, "coil": "DVC", "ohms_per_coil": ohm, "coils": 2,
            "rms_w": int(g("Номинальная мощность")), "peak_w": int(g("Максимальная мощность")),
            "final_loads_ohm": [ohm / 2, ohm * 2], "ts_basis": "unknown",
            "params": {"fs_hz": g("Fs, Гц"), "re_ohm": None, "qms": g("Qms"), "qes": g("Qes"), "qts": g("Qts"), "vas_l": g("Vas, л"),
                       "sd_cm2": None, "xmax_mm": g("Xmax (в одну сторону), мм"), "mms_g": g("Mms"), "bl_tm": g("Bl"), "le_mh": None,
                       "spl_db_1w1m": None, "spl_db_2v83": None},
            "mounting_depth_mm": g("Установочная глубина, мм"), "cutout_mm": g("Диаметр монтажного отверстия, мм"), "displacement_l": None,
            "recommended_boxes": [], "status": status,
            "sources": [{"fields": ["*"], "url": url, "doc": "product page, Технические характеристики + Параметры Тиля-Смолла", "page": None, "read_date": RD, "tier": 1}],
            "notes": LAB + f"Sensitivity {s.get('Чувствительность, дБ')} dB, outer diameter {s.get('Внешний диаметр, мм')} mm, voice coil {s.get('Звуковая катушка, дюймы')} in, Cms printed '{s.get('Cms')}'. " + extra}
drivers = [
 rec("ultimatum-12", "Ultimatum 12 (УЛЬТИМАТУМ 12)", 12, 1, C + "subwoofers/passive-sub/sabvufer-ural-ultimatum-12/", "current",
     "Ural news page calls the series 'real RMS 4 000 W' (https://ural-auto.ru/info/news/novinki-ot-kompanii-ural-moshhnejshie-sabvufery-serii-ultimatum/). Page shows 'Нет в наличии' (out of stock). CHECK: Re implied by the printed Qes, Bl, fs, Mms is about 2.7 ohm, high for 1+1 ohm coils (about 2 ohm expected in series); one printed value may be off."),
 rec("ultimatum-15", "Ultimatum 15 (УЛЬТИМАТУМ 15)", 15, 1, C + "subwoofers/passive-sub/sabvufer-ural-ultimatum-15/", "current",
     "Ural news page calls the series 'real RMS 4 000 W'. Page shows 'Нет в наличии' (out of stock)."),
 rec("patriot-sport-12", "Patriot Sport 12 (ПАТРИОТ СПОРТ 12)", 12, 2, C + "subwoofers/passive-sub/avtomobilnyy-sabvufer-ural-patriot-sport-12/", "current",
     "Page gives Qts but not Qes or Qms, and no Re or Xmax."),
 rec("patriot-15-new", "Patriot Sport 15 (ПАТРИОТ СПОРТ 15)", 15, 2, C + "subwoofers/passive-sub/avtomobilnyy-sabvufer-ural-patriot-15/", "current",
     "URL slug says 'patriot-15' but the page title is ПАТРИОТ СПОРТ 15. Page gives Qts but not Qes or Qms, and no Re or Xmax."),
 rec("arch-decibel-18", "Decibel 18", 18, 1, C + "archive/archive-subwoofers/archive-passivnie-no-korpus/decibel-18/", "discontinued",
     "In the maker's model archive, marked 'Снято с продажи' (discontinued)."),
]
out = {"brand": "Ural (Урал / Ural Sound)", "country": "Russia", "brand_url": "https://ural-auto.ru/",
 "terms_note": "ural-auto.ru refused the container's connections; read on 2026-11-22 through a non-VPN connection (direct route), plain curl.exe output to stdout only, nothing written on a non-VPN connection, at least 6 s between requests (sitemap, 2 category pages, 26 product/news pages, 2 Cyclone URLs). Numbers only. Russian maker: facts per model from the maker's own pages. Local copies (audit only): references/raw/hp_subs/direct/ural/.",
 "drivers": drivers,
 "no_ts_published": [
  {"model": "Cyclone 12 / Cyclone 15 (Циклон, dual coil)", "rms_w": 2000, "url": "https://ural-auto.ru/info/news/absolyutno-novaya-seriya-sabvuferov-cyclone-ciklon/",
   "note": "Only the maker's news page remains: it describes a 3 in four-layer dual voice coil 'с настоящим RMS 2000 Вт' (with a real RMS of 2000 W). The product links (http://www.ural-auto.ru/shop/subwoofers/subwoofers-30-cm/cyclone-12/ and .../subwoofers-38-cm/cyclone-15/) now redirect to the passive-sub category, so no specs or T/S; coil impedance not stated on the maker page. Discontinued (inferred from removal). Read 2026-11-22."}],
 "excluded_notes": "Below 2000 W rated (maker pages read 2026-11-22, https://ural-auto.ru/catalog/subwoofers/passive-sub/): Patriot 12/15 Grom 1500 W, Patriot 12/15 900 W, Bulava 12/15 V.2 900 W, TT 12/15 500 W, Molot 12 300 W, Molniya 12 300 W; archive Pobeda 12/15/18 1200 W, Bulava 18 900 W. AK-12 M, Avangard 12, Warhead Grand 12 pages list no power figure (small lines). Archive Patriot 18 page has no specs. Active and underseat subs not checked."}
json.dump(out, open("/workspace/data/hp_subs_raw/world/ural.json", "w"), indent=1, ensure_ascii=False)
print("ural.json:", len(drivers), "drivers")
