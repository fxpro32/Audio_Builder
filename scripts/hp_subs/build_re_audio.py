#!/usr/bin/env python3
"""A2: RE Audio (Santa Fe Springs, CA) XXX v2 records. T/S from the maker 'INFO' sheets (reaudio.com/THIELESPDF/xxxNNv2_info*.pdf, linked from
http://reaudio.com/info/ThieleSmall.php); coil configuration and vented boxes from the maker's BassBox box-design PDFs on the XXX v2 page. Read 2026-11-21."""
import sys; sys.path.insert(0, "/workspace/scripts/hp_subs")
from rec import rec, box, src, save
B = "http://reaudio.com/"
rows = {12: (dict(re_ohm=1.7431, fs_hz=24.5366, qes=0.3151, qms=6.5034, qts=0.3005, le_mh=2.0124, sd_cm2=483.05, vas_l=34.9421, bl_tm=18.4497, mms_g=399.1306), "xxx12v2_info.pdf", (12.75, 0.24), (2.317, 30.74)),
        15: (dict(re_ohm=1.7156, fs_hz=21.5210, qes=0.3799, qms=6.4006, qts=0.3586, le_mh=2.0173, sd_cm2=829.58, vas_l=108.6620, bl_tm=17.3341, mms_g=492.0586), "xxx15v2_info%20(1).pdf", (13.5, 0.27), (2.753, 30.51)),
        18: (dict(re_ohm=1.8805, fs_hz=28.9352, qes=0.8015, qms=5.4033, qts=0.6980, le_mh=2.0774, sd_cm2=1256.64, vas_l=96.4004, bl_tm=17.3291, mms_g=704.0347), "xxx18v2_info%20(1).pdf", (14.75, 0.3), (3.931, 30.84))}
d = []
for size, (p, info, (depth, disp), (vb, fb)) in rows.items():
    vent = f"products/BOX%20V2%20PDF/XXX%20{size}%20VENTED(1).pdf"
    d.append(rec(f"XXX v2 {size} D4 (XXX{size}D2/4 v2)", size, "DVC", 4, 2000, None, p, "parallel", depth_in=depth, disp_cuft=disp, status="current",
        boxes=[box("ported", vb, fb, "maker box design " + B + vent, note="maker BassBox file, design 'VENTED(1)'; net Vb as printed")],
        sources=[src(B + "THIELESPDF/" + info, ["params"], doc="maker INFO sheet (T/S)"), src(B + vent, ["ts_basis", "recommended_boxes"], doc="maker box design PDF (BassBox 6 export)", page=1),
                 src(B + "products/woofers_xxx.php", ["rms_w", "mounting_depth_mm", "displacement_l", "coil"], doc="XXX v2 series page")],
        notes=("The INFO sheet is titled 'XXX%sD2/4 v2' and gives one T/S set; the maker's own box files use the same values as 'XXX %s D4' with 'Dual voice coils = parallel' (2 ohm). "
               "So the set is entered for the D4 model wired in parallel. A D2 version exists (dual 2 ohm, 1 or 4 ohm final) but no separate T/S was found. Sd converted from mm2. "
               "Box files print Xmax 2.3 in (58 mm), implausible beside the sheet, not entered. Peak not published. Cut-out not published.") % (size, size)))
save("re-audio", "RE Audio", "http://reaudio.com",
     "Static PHP site (no robots restrictions found on pages used); 6 pages/PDFs read 4-5 s apart. Copyright notice only. MX v2 (1700 W), XX v2 (1500 W), SXX v2 (1200 W) excluded.",
     d, [{"model": "XXX v2 12/15/18 D2", "rms_w": 2000, "url": B + "products/woofers_xxx.php", "note": "Dual 2 ohm variant; maker publishes one shared 'D2/4' T/S sheet, entered under D4 (see notes there)."}])
