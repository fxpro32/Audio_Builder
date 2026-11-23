#!/usr/bin/env python3
"""R2_SUBS_ALL: Ural (Russia) passive subwoofers, all power levels, from the product pages A6 read through a non-VPN connection on 2026-11-22
(references/raw/hp_subs/direct/ural/, parsed by A6's scripts/a6_ural_extract.py into _extract.json; no new requests). Same label reading
as A6 (scripts/a6_build/ural.py): rated power treated as RMS; Re and Sd not published. hp_subs_raw records kept.
Usage: python3 -I build_ural.py"""
import sys, re, json
sys.path.insert(0, "/workspace/scripts/car_subs")
from common import rec, src, save
X = json.load(open("/workspace/references/raw/hp_subs/direct/ural/_extract.json"))
URL = dict(l.split() for l in open("/workspace/scripts/a6_ural_pages.txt") if l.strip())
f = lambda s: None if s in (None, "") else (lambda v: int(v) if v.is_integer() else v)(float(s.replace(",", ".")))
HP = {"ultimatum-12", "ultimatum-15", "patriot-sport-12", "patriot-15-new", "arch-decibel-18"}
drivers = []
for k, v in X.items():
    s = v.get("spec") or {}
    if k in HP or not s.get("Fs, Гц"): continue
    g = lambda key: f(s.get(key))
    imp = s.get("Сопротивление, Ом", "")
    m = re.match(r"(\d+(?:[.,]\d+)?)\+", imp)
    coil, ohm = ("DVC", f(m.group(1))) if m else ("SVC", f(imp) if imp else None)
    size = f((re.match(r"(\d+)", s.get("Размер", "")) or [None, None])[1]) or f((re.search(r"(\d{2})\b", v.get("title", "")) or [None, None])[1])
    title = re.sub(r"^(Автомобильный )?[Сс]абвуфер\s*", "", v.get("title", "")).split(" купить")[0].strip()
    status = "discontinued" if k.startswith("arch-") else "current"
    drivers.append(rec(f"{title} ({k})", size, coil, ohm, g("Номинальная мощность"), g("Максимальная мощность"),
                       dict(fs_hz=g("Fs, Гц"), qms=g("Qms"), qes=g("Qes"), qts=g("Qts"), vas_l=g("Vas, л"), xmax_mm=g("Xmax (в одну сторону), мм"), mms_g=g("Mms"), bl_tm=g("Bl")),
                       depth_mm=g("Установочная глубина, мм"), cut_mm=g("Диаметр монтажного отверстия, мм"), status=status,
                       sources=[src(URL.get(k, "https://ural-auto.ru/"), doc="product page (read via a non-VPN connection by A6)", date="2026-11-22")],
                       notes="Labels as A6 read them: rated power ('Номинальная мощность') treated as RMS, max power as peak; Re and Sd not published; Cms printed without a unit (not used)."
                             + (" Page gives no rated power." if not g("Номинальная мощность") else "")))
save("world", "ural", "Ural (Урал / Ural Sound)", "Russia", "https://ural-auto.ru/",
     "R2 2026-11-23: re-used the pages A6 read through a non-VPN connection on 2026-11-22 (no new requests, non-VPN connection not used by R2). Numbers only.",
     drivers, [], coverage="all passive sub pages A6 saved (current + archive)")
