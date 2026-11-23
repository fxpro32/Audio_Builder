# Builds data/hp_subs_raw/world/kicx.json from Kicx product pages (kicx.ru), read 2026-11-21.
import glob, os, re, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
D = "/workspace/references/raw/hp_subs/world/kicx/pages/"
NAMES = {"gorilla_bass_gb15m": "Gorilla Bass GB15M", "headshot_dm18_1_1": "HeadShot DM18 (1+1)", "headshot_dm18_2_2": "HeadShot DM18 (2+2)",
 "headshot_q312_11": "HeadShot Q312 (1+1)", "headshot_q312_22": "HeadShot Q312 (2+2)", "headshot_q315_11": "HeadShot Q315 (1+1)",
 "headshot_q315_22": "HeadShot Q315 (2+2)", "headshot_q412s_11": "HeadShot Q412S (1+1)", "headshot_q412s_22": "HeadShot Q412S (2+2)",
 "headshot_q415s_11": "HeadShot Q415S (1+1)", "headshot_q415s_22": "HeadShot Q415S (2+2)"}
def table(path):
    L = [l.strip() for l in open(path, encoding="utf-8")]
    t = {}
    for i in range(1, len(L) - 1):
        if L[i] == "-" and L[i-1] and L[i+1]: t.setdefault(L[i-1], L[i+1])
    return t
out = []
for slug, name in NAMES.items():
    t = table(D + slug + ".txt")
    g = lambda k: next((v for kk, v in t.items() if kk.startswith(k)), None)
    imp = g("Сопротивление / Импеданс")
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)", imp or "")
    if m: coil, oh, n = "DVC", num(m.group(1)), 2
    else: coil, oh, n = "SVC", num(imp), 1
    fs_txt = g("Резонансная частота")
    notes = ["Values from the maker's product page specification table (Russian labels translated: Номинальная мощность = rated (RMS) power, Максимальная = max power, Чувствительность дБ/Вт/м = sensitivity 1 W/1 m, Сопротивление DC Re, Эффективная площадь Sd, Силовой фактор B*I = Bl, Масса подвижной системы = Mms)."]
    if fs_txt and "после разминки" in fs_txt:
        notes.append(f"Fs printed as '{fs_txt}' (second figure = after break-in); fs_hz holds the first (new) figure.")
    re_ = num(g("Сопротивление DC"))
    if coil == "DVC" and re_ and oh and abs(re_ - 2*oh) <= 0.5*oh:
        notes.append(f"Re {re_} ohm on a {oh}+{oh} ohm DVC matches the two coils in series (inference, page does not state the T/S basis).")
    dd = num(g("Диаметр диффузора")); mag = g("Диаметр магнита"); cms = g("Гибкость"); rmsm = g("Механическое сопротивление")
    extra = [f"cone diameter Dd {dd} mm" if dd else None, f"Cms {cms} mm/N" if cms else None, f"Rms (mechanical) {rmsm}" if rmsm else None,
             f"magnet diameter {mag} mm" if mag else None, f"voice coil {g('Диаметр звуковой катушки')} in" if g('Диаметр звуковой катушки') else None,
             "article " + re.sub(r".*Артикул:\s*", "", next((l for l in open(D+slug+".txt", encoding="utf-8") if "Артикул" in l), "")).strip()]
    notes.append("Other page values: " + "; ".join(x for x in extra if x) + ". No Xmax/mounting depth unless listed.")
    out.append(driver(model=name, size_in=num(g("Размер")), coil=coil, ohms_per_coil=oh, coils=n,
        rms_w=num(g("Номинальная мощность")), peak_w=num(g("Максимальная мощность")),
        fs_hz=num(fs_txt), re_ohm=re_, qms=num(g("Механическая добротность")), qes=num(g("Электрическая добротность")),
        qts=num(g("Полная добротность")), vas_l=num(g("Эквивалентный объём")), sd_cm2=num(g("Эффективная площадь")),
        xmax_mm=num(g("Макс. отклонение")), mms_g=num(g("Масса подвижной")), bl_tm=num(g("Силовой фактор")),
        spl_db_1w1m=num(g("Чувствительность")), status="current",
        sources=[{"fields": ["*"], "url": f"https://kicx.ru/katalog/sabvufery/otkrytogo_tipa/{slug}/", "doc": "Kicx product page, Технические характеристики table", "page": None, "read_date": "2026-11-21", "tier": 1}],
        notes=" ".join(notes)))
save("kicx", "Kicx", "Russia", "https://kicx.ru/",
     "kicx.ru robots.txt has groups only for Googlebot and Yandex (shop/admin paths); no website terms of use found on pages read. Product pages read one at a time, 3 s apart, 2026-11-21. Numbers only. Russian maker: no EU database right; facts per model from the maker's own pages.",
     out, extra={"excluded_notes": "Other Kicx open-type subs listed at https://kicx.ru/katalog/sabvufery/otkrytogo_tipa/ are below 2000 W rated power (Gorilla Bass E12/E15 1200 W, HeadShot 10/12/15 1000 to 1500 W, GT, STQ, LL12, Terza, Sound Civilization). 'status: current' = listed in the maker's shop catalogue on 2026-11-21."})
