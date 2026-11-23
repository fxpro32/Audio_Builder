#!/usr/bin/env python3
"""R2B_SUBS_MORE (2026-11-23): Kicx (Russia) all open-type subwoofers (all power levels) from the maker's product pages.
Category https://kicx.ru/katalog/sabvufery/otkrytogo_tipa/ (27 products, one page); the 11 HeadShot Q/DM and Gorilla GB15M pages
come from hp_subs_raw (A3); the other 16 pages were read as text 3 s apart (references/raw/car_subs/kicx/pages/).
Table parsing as A3 (scripts/hp_world_build/kicx.py): label line, '-', value line. Usage: python3 -I build_kicx.py"""
import sys, re, os
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save, num
D = "/workspace/references/raw/car_subs/kicx/pages/"
B = "https://kicx.ru/katalog/sabvufery/otkrytogo_tipa/"


def table(path):
    L = [l.strip() for l in open(path, encoding="utf-8")]
    t = {}
    for i in range(1, len(L) - 1):
        if L[i] == "-" and L[i - 1] and L[i + 1]: t.setdefault(L[i - 1], L[i + 1])
    return L, t


drivers = []
for f in sorted(os.listdir(D)):
    if not f.endswith(".txt"): continue
    slug = f[:-4]
    L, t = table(D + f)
    g = lambda k: next((v for kk, v in t.items() if kk.startswith(k)), None)
    name = next((l.split(" - ")[0].strip() for l in L if "KICX" in l and " - " in l), slug)
    imp = g("Сопротивление / Импеданс")
    m = re.match(r"(\d+(?:[.,]\d+)?)\s*\+\s*(\d+(?:[.,]\d+)?)", imp or "")
    coil, oh = ("DVC", num(m.group(1))) if m else ("SVC", num(imp))
    fs_txt = g("Резонансная частота")
    notes = ["Values from the maker's product page specification table (Russian labels: Номинальная мощность = rated (RMS) power, Максимальная = max power, Чувствительность дБ/Вт/м = sensitivity 1 W/1 m, Сопротивление DC = Re, Эффективная площадь = Sd, Силовой фактор B*I = Bl, Масса подвижной системы = Mms)."]
    if fs_txt and "после" in fs_txt:
        notes.append(f"Fs printed as '{fs_txt}' (second figure = after break-in); fs_hz holds the first figure.")
    re_ = num(g("Сопротивление DC"))
    if coil == "DVC" and re_ and oh and abs(re_ - 2 * oh) <= 0.5 * oh:
        notes.append(f"Re {re_} ohm on a {oh}+{oh} ohm DVC matches the two coils in series (inference; the page does not state the T/S basis).")
    extra = [f"cone diameter Dd {g('Диаметр диффузора')} mm" if g('Диаметр диффузора') else None, f"Cms {g('Гибкость')} mm/N" if g('Гибкость') else None,
             f"Rms (mechanical) {g('Механическое сопротивление')}" if g('Механическое сопротивление') else None]
    notes.append("Other page values: " + "; ".join(x for x in extra if x) + ".")
    p = dict(fs_hz=num(fs_txt), re_ohm=re_, qms=num(g("Механическая добротность")), qes=num(g("Электрическая добротность")),
             qts=num(g("Полная добротность")), vas_l=num(g("Эквивалентный объём")), sd_cm2=num(g("Эффективная площадь")),
             xmax_mm=num(g("Макс. отклонение")), mms_g=num(g("Масса подвижной")), bl_tm=num(g("Силовой фактор")), spl_db_1w1m=num(g("Чувствительность")))
    basis = "series" if coil == "DVC" and "series" in notes[-2] else ("per_coil" if coil == "SVC" else "unknown")
    drivers.append(rec(name, num(g("Размер")), coil, oh, num(g("Номинальная мощность")), num(g("Максимальная мощность")), p,
                       "unknown", status="current", sources=[src(B + slug + "/", doc="Kicx product page, Технические характеристики table")],
                       notes=" ".join(notes)))
save("world", "kicx", "Kicx", "Russia", "https://kicx.ru/",
     "R2B 2026-11-23: category page and 16 product pages read one at a time, 3 s apart; robots.txt groups only for Googlebot/Yandex (shop/admin paths). Numbers only.",
     drivers, coverage="every open-type subwoofer in the maker's catalogue https://kicx.ru/katalog/sabvufery/otkrytogo_tipa/ (all power levels, 27 products)")
