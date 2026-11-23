# Builds data/hp_subs_raw/world/ground-zero.json. Values transcribed from Ground Zero owner's manuals / data sheets
# (PDF, read 2026-11-21, local copies in references/raw/hp_subs/world/ground_zero/) and the English product pages.
import os, sys
sys.path.insert(0, os.path.dirname(__file__)); from hp_common import *
U = "https://www.ground-zero-audio.com/wp-content/uploads/"
P = "https://www.ground-zero-audio.com/en/"
XNOTE = ("Ground Zero prints 'Xmax' as peak-to-peak: sheets for GZAW, GZPW 15XXmax and GZPW 18C label it 'p2p', and the GZPW 15NEO-SPL data sheet gives "
         "'linear excursion (one direction) 30 mm' where its product page shows 60 mm. xmax_mm here is the printed figure divided by 2 (calculated); printed value: ")
def src(doc, page=None, fields=("*",)):
    return {"fields": list(fields), "url": U + doc, "doc": doc, "page": page, "read_date": "2026-11-21", "tier": 1}
def psrc(slug, fields):
    return {"fields": fields, "url": P + slug + "/", "doc": "Ground Zero product page (English)", "page": None, "read_date": "2026-11-21", "tier": 1}
def vent(v, f3=None, fb=None, port=""):
    return {"type": "vented", "volume_l": v, "tuning_hz": fb, "source": f"maker manual: {port}{'; F3 ' + str(f3) + ' Hz' if f3 else ''}".strip()}
def gz(model, size, oh, rms, peak, slug, srcs, p, xp=None, xone=None, re_basis=None, md=None, co=None, boxes=(), notes="", coils=2):
    n = []
    if xp is not None:
        p["xmax_mm"] = xp / 2; n.append(XNOTE + f"{xp} mm.")
    if xone is not None:
        p["xmax_mm"] = xone; n.append(f"Xmax {xone} mm is printed as one-direction linear excursion.")
    if re_basis: n.append(f"Sheet prints Re with '({re_basis})'.")
    if peak: n.append(f"peak_w is the maker's SPL / short-term rating ({peak} W).")
    if notes: n.append(notes)
    return driver(model=model, size_in=size, coil="DVC", ohms_per_coil=oh, coils=coils, rms_w=rms, peak_w=peak,
                  ts_basis={"serial": "series", "parallel": "parallel"}.get(re_basis, "unknown"), mounting_depth_mm=md, cutout_mm=co,
                  recommended_boxes=list(boxes), status="current", sources=srcs, notes=" ".join(n), **p)
D = []
spl = "GZPW-SPL-Serie.pdf"
D.append(gz("GZPW 18SPL", 18, 1, 6000, 10000, "gzpw-18spl-2", [src(spl, 2), psrc("gzpw-18spl-2", ["rms_w", "peak_w"])],
    dict(fs_hz=34, qms=2.09, qes=0.21, qts=0.26, vas_l=87, spl_db_1w1m=95.1), xp=35, co=420,
    boxes=[{"type": "vented", "volume_l": 110, "tuning_hz": None, "source": "GZPW-SPL-Serie.pdf p4: 4 x 10 cm ports, L 20 cm, f -3 dB 47 Hz"}],
    notes="Sheet 'SPL dB/m' 95.1 taken as 1 W/1 m. DATA PROBLEM: Qts 0.26 printed, Qes and Qms give 0.19 (calculated). Mounting depth not printed (drawing only)."))
D.append(gz("GZPW 15SPL", 15, 1, 6000, 10000, "gzpw-15spl-2", [src(spl, 2), psrc("gzpw-15spl-2", ["rms_w", "peak_w", "mounting_depth_mm"])],
    dict(fs_hz=39.1, qms=10.95, qes=0.23, qts=0.23, vas_l=36.8, spl_db_1w1m=92.8), xp=35, co=360, md=272,
    boxes=[{"type": "vented", "volume_l": 70, "tuning_hz": None, "source": "GZPW-SPL-Serie.pdf p4: 2 x 10 cm ports, L 14 cm, f -3 dB 47 Hz"}],
    notes="Mounting depth 272 mm from the product page (German version, 'Einbautiefe')."))
D.append(gz("GZPW 12SPL", 12, 1, 3000, 6500, "gzpw-12spl-2", [src(spl, 2), psrc("gzpw-12spl-2", ["rms_w", "peak_w"])],
    dict(fs_hz=39.9, qms=5.46, qes=0.43, qts=0.40, vas_l=20.7, spl_db_1w1m=92.2), xp=35, co=285,
    boxes=[{"type": "vented", "volume_l": 50, "tuning_hz": None, "source": "GZPW-SPL-Serie.pdf p4: 2 x 10 cm ports, L 25 cm, f -3 dB 47 Hz"}],
    notes="DATA PROBLEM: manual Fs 39.9 Hz, product page Fs 36.9 Hz; manual value used."))
D.append(gz("GZPW 10SPL", 10, 1.6, 3000, 6500, "gzpw-10spl-2", [src("Manual_GZPW10SPL_REV.pdf", 2), psrc("gzpw-10spl-2", ["rms_w", "peak_w", "cutout_mm"])],
    dict(fs_hz=51.7, qms=4.73, qes=0.44, qts=0.40, vas_l=6.9, spl_db_1w1m=89.7), xp=30, co=235,
    boxes=[{"type": "vented", "volume_l": 50, "tuning_hz": None, "source": "Manual_GZPW10SPL_REV.pdf p2"}],
    notes="Manual impedance '2 x 1,6' ohm, so final loads are 0.8 or 3.2 ohm (calculated); none is exactly 2, 1 or 0.5 ohm, included for PM decision. Manual power line reads 'SPL Power W/RMS 6500 Watt SPL Power'; rms_w 3000 from the product page."))
D.append(gz("GZPW 15XXmax", 15, 1, 6000, None, "gzpw-15xxmax-2", [src("GZPW-15XXmax_OM_AWV2.1.pdf"), psrc("gzpw-15xxmax-2", ["rms_w", "spl_db_1w1m", "mounting_depth_mm", "cutout_mm"])],
    dict(fs_hz=31.6, re_ohm=2.12, qes=0.43, qts=0.40, vas_l=27.0, mms_g=642, spl_db_1w1m=84.3), xp=80, re_basis="serial", md=297, co=358,
    notes="Qms and Bl are blank on the sheet. Efficiency 84.3 dB from the product page."))
D.append(gz("GZPW 15Xmax", 15, 1, 6000, None, "gzpw-15xmax-2", [src("GZPW-15Xmax_OM_032017.pdf"), src("GZPW-15Xmax-2017.pdf", None, ["recommended_boxes"])],
    dict(fs_hz=33.3, re_ohm=2, qms=6.022, qes=0.477, qts=0.442, vas_l=22.81, le_mh=1.6, mms_g=709.6, bl_tm=23.4, spl_db_1w1m=85), xp=80, md=313, co=358,
    boxes=[vent(120, 32.6, None, "slot port 400 cm2, L-port 41 cm"), vent(140, 30, None, "slot port 400 cm2, L-port 41 cm"),
           {"type": "sealed", "volume_l": 40, "tuning_hz": None, "source": "GZPW-15Xmax-2017.pdf: Qtc 0.38 to 0.55 (two figures printed)"}],
    notes="Re 2 ohm on a 2 x 1 ohm DVC matches coils in series. Sheet 'SPL dB/m' 85."))
D.append(gz("GZPW 15NEO-SPL", 15, 1, 3000, 10000, "gzpw-15neo-spl-2", [src("GZPW-15NEO-SPL-datasheet_2018.pdf", 2)],
    dict(fs_hz=41.2, re_ohm=1.9, qms=3.87, qes=0.20, qts=0.19, vas_l=25.6, le_mh=0.61, mms_g=560.6, bl_tm=37.4, sd_cm2=829.58, spl_db_1w1m=91.4), xone=30, re_basis="serial", md=307, co=358,
    notes="Data sheet also gives Res 735.6 ohm, Rms 37.5 g/s, Cms 0.03 mm/N, recommended amp 2000 to 4000 W RMS, max 10000 W (competition)."))
D.append(gz("GZNW 15Xmax", 15, 1, 4000, None, "gznw-15xmax-2", [src("GZNW-15Xmax_OM_012017.pdf"), src("GZNW-15Xmax-2017.pdf", None, ["recommended_boxes"])],
    dict(fs_hz=29.5, re_ohm=2, qms=5.13, qes=0.352, qts=0.33, vas_l=35.72, le_mh=2.179, mms_g=575.2, bl_tm=25.9, spl_db_1w1m=87), xp=80, md=285, co=358,
    boxes=[vent(80, 30, None, "slot port 400 cm2, L-port 94 cm"), vent(100, 28, None, "slot port 400 cm2, L-port 94 cm"),
           {"type": "sealed", "volume_l": 40, "tuning_hz": None, "source": "GZNW-15Xmax-2017.pdf: Qtc 0.45"}],
    notes="Re 2 ohm on a 2 x 1 ohm DVC matches coils in series."))
D.append(gz("GZNW 38NEO-SPL", 15, 1, 2500, 5000, "gznw-38neo-spl-2", [src("GZNW-38NEO-SPL_OM_052020.pdf")],
    dict(fs_hz=31.6, re_ohm=1.91, qms=5.55, qes=0.18, qts=0.18, vas_l=34.9, le_mh=2.56, mms_g=667, bl_tm=37.7, spl_db_1w1m=89.8), xp=60, md=300, co=358,
    notes="DATA PROBLEM: the product page shows different values (Fs 25.8 Hz, Qts 0.111, Vas 50.8 L, Xmax 64 mm); the owner's manual values are used."))
D.append(gz("GZNW 18SPL-Xflex", 18, 1, 3000, 6500, "gznw-18spl-xflex-2", [src("GZNW-18SPL-Xflex_OM_042019.pdf")],
    dict(fs_hz=26, re_ohm=2.0, qms=5.582, qes=0.582, qts=0.527, vas_l=159.2, le_mh=0.69, mms_g=404.4, bl_tm=15.13, spl_db_1w1m=89), xp=70, md=286, co=425,
    boxes=[vent(200, 28, None, "port 80 x 250 mm, L 13 cm"), vent(120, 28, None, "port 80 x 250 mm, L 44 cm"),
           {"type": "bandpass", "volume_l": None, "tuning_hz": None, "source": "GZNW-18SPL-Xflex_OM_042019.pdf: 4th order, 70 L sealed + 100 L vented, port 140 x 250 mm, L 30 cm"}]))
D.append(gz("GZNW 15SPL-Xflex", 15, 1, 3000, 5500, "gznw-15spl-xflex-2", [src("GZNW-15SPL-Xflex_OM_062018.pdf", 2)],
    dict(fs_hz=30.2, re_ohm=2, qms=5.506, qes=0.540, qts=0.492, vas_l=59.1, le_mh=1.41, mms_g=403.77, bl_tm=17.0, spl_db_1w1m=87), xp=70, md=260, co=358,
    boxes=[vent(100, 31, None, "port 1 x 160 mm, L 26 cm"),
           {"type": "bandpass", "volume_l": None, "tuning_hz": 42, "source": "GZNW-15SPL-Xflex_OM_062018.pdf p3: 4th order, 50 L sealed + 80 L vented, port 160 mm L 30 cm, bandwidth 28 to 66 Hz"},
           {"type": "sealed", "volume_l": 55, "tuning_hz": None, "source": "GZNW-15SPL-Xflex_OM_062018.pdf p3: 50 to 60 L net, Qtc 0.72, F3 43 Hz"}],
    notes="Manual: recommended amp power 1500 to 5500 W RMS at 2 ohm (0.5 ohm)."))
D.append(gz("GZNW 12Xmax", 12, 1, 3000, None, "gznw-12xmax-2", [src("GZNW-12Xmax_OM_052019.pdf"), src("GZNW-12Xmax-2019.pdf", None, ["recommended_boxes"])],
    dict(fs_hz=35.6, re_ohm=1.8, qms=6.815, qes=0.67, qts=0.61, vas_l=13.59, le_mh=1.28, mms_g=427, bl_tm=16, spl_db_1w1m=83), xp=60, md=250, co=282,
    boxes=[vent(60, 31.6, None, "slot port 240 cm2, L-port 67 cm"), vent(80, 26, None, "slot port 240 cm2, L-port 67 cm"),
           vent(80, 29, None, "aeroport 16 cm, total length 38 cm"), vent(100, 27, None, "aeroport 16 cm, total length 38 cm"),
           {"type": "sealed", "volume_l": 25, "tuning_hz": None, "source": "GZNW-12Xmax-2019.pdf: Qtc 0.76, F3 41 Hz"},
           {"type": "sealed", "volume_l": 45, "tuning_hz": None, "source": "GZNW-12Xmax-2019.pdf: Qtc 0.70, F3 41 Hz"},
           {"type": "bandpass", "volume_l": None, "tuning_hz": None, "source": "GZNW-12Xmax-2019.pdf: 4th order V1 25 L, V2 40 L, bandwidth 29 to 75 Hz"}],
    notes="Sheet 'SPL dB/m' 83."))
D.append(gz("GZNW 38SPL-D2", 15, 2, 3500, 7000, "gznw-38spl-d2-2", [src("GZNW-38SPL-D1-D2_OM_052020.pdf")],
    dict(fs_hz=36.5, re_ohm=3.2, qms=3.82, qes=0.72, qts=0.61, vas_l=63, mms_g=278.4, bl_tm=16.8, spl_db_1w1m=88.2), xp=80, re_basis="serial", md=269, co=358,
    boxes=[vent(95, 35, 44, "2 x 10 cm ports")], notes="Product page Vas 63.3 L."))
D.append(gz("GZNW 38SPL-D1", 15, 1, 3500, 7000, "gznw-38spl-d1-2", [src("GZNW-38SPL-D1-D2_OM_052020.pdf")],
    dict(fs_hz=36.0, re_ohm=1.73, qms=5.34, qes=0.57, qts=0.52, vas_l=54, mms_g=344.2, bl_tm=15.3, spl_db_1w1m=88.5), xp=80, re_basis="serial", md=269, co=358,
    boxes=[vent(95, 39, 44, "2 x 10 cm ports")]))
D.append(gz("GZNW 30SPL-D2", 12, 2, 3000, 6000, "gznw-30spl-d2-2", [src("GZNW-30SPL-D1-D2_OM_052020.pdf")],
    dict(fs_hz=41.3, re_ohm=3.2, qms=3.61, qes=0.63, qts=0.54, vas_l=25.0, mms_g=219.9, bl_tm=17.0, spl_db_1w1m=86.3), xp=70, re_basis="serial", md=237, co=281,
    boxes=[vent(60, 37, 47, "10 cm port")]))
D.append(gz("GZNW 30SPL-D1", 12, 1, 3000, 6000, "gznw-30spl-d1-2", [src("GZNW-30SPL-D1-D2_OM_052020.pdf")],
    dict(fs_hz=38.6, re_ohm=1.72, qms=4.40, qes=0.42, qts=0.38, vas_l=23.6, mms_g=269.5, bl_tm=16.3, spl_db_1w1m=87.5), xp=70, re_basis="serial", md=237, co=281,
    boxes=[vent(60, 39, 47, "10 cm port")]))
D.append(gz("GZNW 12SPL-Xflex", 12, 1, 2500, 4500, "gznw-12spl-xflex-2", [src("GZNW-12SPL-Xflex_OM_122017.pdf")],
    dict(fs_hz=33.9, re_ohm=2, qms=4.43, qes=0.39, qts=0.361, vas_l=27.26, le_mh=1.28, mms_g=289.86, bl_tm=18, spl_db_1w1m=87), xp=60, md=226, co=284,
    boxes=[vent(80, 35, None, "port 1 x 160 mm, L 29 cm"),
           {"type": "bandpass", "volume_l": None, "tuning_hz": 55, "source": "GZNW-12SPL-Xflex_OM_122017.pdf: 4th order 30 L sealed + 50 L vented, port 160 mm L 28 cm, bandwidth 36 to 82 Hz"},
           {"type": "sealed", "volume_l": 25, "tuning_hz": None, "source": "GZNW-12SPL-Xflex_OM_122017.pdf: Qtc 0.62, F3 60 Hz"}]))
D.append(gz("GZNW 12X-D2", 12, 2, 2000, 3500, "gznw-12x-d2", [src("GZNW-12X-D2_OM_AWV4.0.pdf")],
    dict(fs_hz=21.8, re_ohm=1.04, qms=7.76, qes=0.32, qts=0.41, vas_l=35, mms_g=438.35, bl_tm=14.3, spl_db_1w1m=83), xp=62, re_basis="parallel", md=210, co=282,
    boxes=[vent(60, 32, None, "port 40 x 250 mm, L 257 mm")],
    notes="DATA PROBLEM: manual Qts 0.41, but Qes 0.32 and Qms 7.76 give 0.307 (calculated) and the product page prints Qts 0.33."))
D.append(gz("GZNW 15NEO-EXTREME", 15, 1, 3000, 6000, "gznw-15neo-extreme", [src("GZNW-15NEO-EXTREME_OM_AWV3.0-V2.pdf")],
    dict(fs_hz=36.6, re_ohm=1.82, qms=5.55, qes=0.18, qts=0.17, vas_l=35, mms_g=657, bl_tm=41.2, spl_db_1w1m=91), xp=65, re_basis="serial", md=300, co=358))
D.append(gz("GZNW 15X-D2", 15, 2, 2500, 4000, "gznw-15x-d2", [src("GZNW-15X-D2_OM_AWV4.1.pdf")],
    dict(fs_hz=35.2, re_ohm=4.02, qms=9.05, qes=0.57, qts=0.54, le_mh=2.73, vas_l=28, mms_g=513.65, bl_tm=28.29, sd_cm2=706.86, spl_db_1w1m=85), xp=62, re_basis="serial", md=250, co=360,
    boxes=[vent(116, 31, None, "port 215 x 130 mm, L 400 mm")]))
D.append(gz("GZPW 15NEO-XSPL", 15, 1, 6500, 25000, "gzpw-15neo-xspl-2", [src("GZPW-15NEO-XSPL_OM_AWV4.1.pdf")],
    dict(fs_hz=31, re_ohm=1.8, qms=3.179, qes=0.154, qts=0.147, le_mh=2.212, vas_l=25.90, mms_g=754.01, bl_tm=44.42, sd_cm2=829.6, spl_db_1w1m=90), xp=60, re_basis="serial", md=325, co=360,
    notes="SPL rating 25000 W is for 3 s. Product page prints the Vas figure (26 L) on its Qts row."))
D.append(gz("GZPW 15XMAX-II", 15, 1, 6000, None, "gzpw-15xmax-ii-2", [src("GZPW-15XMAX-II_OM_AWV4.0.pdf")],
    dict(fs_hz=30, re_ohm=1.95, qms=6.21, qes=0.445, qts=0.415, le_mh=1.345, vas_l=27.2, mms_g=712.2, bl_tm=24.242, sd_cm2=697.46, spl_db_1w1m=85), xp=80, re_basis="serial", md=310, co=360,
    boxes=[vent(116, 31, None, "port 242 x 130 mm, L 450 mm")]))
D.append(gz("GZNW 30XMAX-II", 12, 1, 3000, None, "gznw-30xmax-ii-2", [src("GZNW-30XMAX-II_OM_AWV4.0.pdf")],
    dict(fs_hz=35.6, re_ohm=1.8, qms=6.82, qes=0.67, qts=0.61, le_mh=1.28, vas_l=13.6, mms_g=427, bl_tm=16, sd_cm2=444.88, spl_db_1w1m=83), xp=60, re_basis="serial", md=250, co=282,
    boxes=[vent(80, 26, None, "slot port 240 x 100 mm, L 670 mm"), vent(100, 27, None, "round port 16 cm, L 380 mm")]))
D.append(gz("GZNW 38XMAX-II", 15, 1, 4000, None, "gznw-38xmax-ii-2", [src("GZNW-38XMAX-II_OM_AWV4.0.pdf")],
    dict(fs_hz=31, re_ohm=2.4, qms=8.43, qes=0.54, qts=0.50, le_mh=1.869, vas_l=26.2, mms_g=695.9, bl_tm=24.6, sd_cm2=697.46, spl_db_1w1m=84), xp=60, re_basis="serial", md=300, co=360,
    boxes=[vent(116, 31, None, "port 242 x 130 mm, L 400 mm")], notes="Product page prints Xmax 62 mm and Qts 0.51; manual values used."))
D.append(gz("GZNW 38NEO-XSPL", 15, 1, 6000, 25000, "gznw-38neo-xspl-2", [src("GZNW-38NEO-XSPL_OM_AWV4.0.pdf")],
    dict(fs_hz=31, re_ohm=1.5, qms=5.847, qes=0.164, qts=0.160, le_mh=2.437, vas_l=24.5, mms_g=1049.11, bl_tm=43.893, sd_cm2=829.6, spl_db_1w1m=89), xp=80, re_basis="serial", md=315, co=360,
    notes="SPL rating 25000 W is for 3 s."))
D.append(gz("GZNW 38C", 15, 1, 6000, 25000, "gznw-38c", [src("GZNW-38C_OM_AWV4.0.pdf")],
    dict(fs_hz=33, re_ohm=1.5, qms=10.23, qes=0.39, qts=0.38, le_mh=2.441, vas_l=23, mms_g=992, bl_tm=27.9, sd_cm2=829.6, spl_db_1w1m=86), xp=80, re_basis="serial", md=290, co=360,
    boxes=[vent(116, 33, None, "port 242 x 130 mm, L 400 mm")], notes="SPL rating 25000 W is for 3 s."))
D.append(gz("GZPW 15C", 15, 1, 6500, 25000, "gzpw-15c-2", [src("GZPW-15C_OM_AWV4.0.pdf")],
    dict(fs_hz=31, re_ohm=1.95, qms=6.683, qes=0.551, qts=0.509, le_mh=1.297, vas_l=28.18, mms_g=858.5, bl_tm=27.522, sd_cm2=829.6, spl_db_1w1m=86), xp=60, re_basis="serial", md=300, co=360,
    boxes=[vent(116, 31, None, "port 242 x 130 mm, L 400 mm")], notes="SPL rating 25000 W is for 3 s."))
D.append(gz("GZPW 18C", 18, 1, 6000, None, "gzpw-18c", [src("GZPW-18C_TechnicalData_EN.pdf", 1), src("GZPW-18C_OM_AWV4.0_.pdf", None, ["recommended_boxes"])],
    dict(fs_hz=34, re_ohm=1.51, qes=0.39, qts=0.38, vas_l=29.44, mms_g=1344, bl_tm=34.25, le_mh=2.51, sd_cm2=1195, spl_db_1w1m=88), xp=80, md=310, co=428,
    boxes=[vent(120, 34, None, "port 470 x 50 mm or 3 x 100 mm round, L 300 mm")], notes="Technical data sheet TD1.0 04/2026; Qms not printed. Voice coil 75 mm."))
D.append(gz("GZAW 15-2.5KD2", 15, 2, 2500, None, "gzaw-15-2-5kd2", [src("GZAW-15-2.5KD2_OM_AWV3.0.pdf"), psrc("gzaw-15-2-5kd2", ["spl_db_1w1m", "cutout_mm", "mounting_depth_mm"])],
    dict(fs_hz=28, qms=4.91, qes=0.32, qts=0.30, vas_l=59.79, mms_g=471, bl_tm=31.53, spl_db_1w1m=88), xp=30, md=246, co=357,
    notes="Manual does not print Re. Efficiency 88 dB from the product page."))
D.append(gz("GZAW 12-2.5KD2", 12, 2, 2500, None, "gzaw-12-2-5kd2", [src("GZAW-12-2.5KD2_OM_AWV3.0.pdf"), psrc("gzaw-12-2-5kd2", ["qts", "spl_db_1w1m"])],
    dict(fs_hz=29.4, vas_l=36.40, bl_tm=31.84, qts=0.22, spl_db_1w1m=87), xp=30, md=217, co=282,
    notes="Manual prints only Fs, Vas, Bl and Xmax of the T/S set; Qts 0.22 from the product page."))
NO_TS = [
    {"model": "GZPW 18SPL-EXTREME", "rms_w": 7000, "url": P + "gzpw-18spl-extreme-2/", "note": "Product page: 2 x 1 ohm, 7000/15000 W, Xmax 35 mm (printed, peak-to-peak by GZ convention), cut-out 420 mm; manual link is the GZPW SPL series manual, which has no Extreme column."},
    {"model": "GZPW 15SPL-EXTREME", "rms_w": 7000, "url": P + "gzpw-15spl-extreme-2/", "note": "Product page: 2 x 1 ohm, 7000/15000 W, efficiency 92 dB, Xmax 35 mm printed; no T/S on the page or in the linked series manual."},
    {"model": "GZPW 12SPL-EXTREME", "rms_w": 4000, "url": P + "gzpw-12spl-extreme-2/", "note": "Product page: 2 x 1 ohm, 4000/8000 W, efficiency 91.5 dB, Xmax 35 mm printed, cut-out 285 mm; no T/S published."},
]
save("ground-zero", "Ground Zero", "Germany", "https://www.ground-zero-audio.com/",
     "robots.txt (https://www.ground-zero-audio.com/robots.txt) disallows only /wp-admin/; site 'Terms and Conditions' is a shop T&C page (not read in full). Pages and manuals read one at a time, 3 s apart, 2026-11-21; numbers only. EU maker: database right risk only for a substantial part of a protected database; we take per-model facts from the maker's own manuals, cited.",
     D, no_ts=NO_TS, extra={"excluded_notes": "Ground Zero subs below 2000 W RMS per product pages read 2026-11-21: GZHW (max 1500 W), GZRW (max 1200 W), GZIW (max 600 W), GZCW (max 800 W), GZPW 10SQ/SQX, GZNW 25C (1500 W). GZNW 12X-D2 is exactly 2000 W."})
