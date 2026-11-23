"""R2B_SUBS_MORE (2026-11-23): Audio System (Germany) newest owner's manuals whose PDFs have no text layer: T/S READ FROM IMAGE.
Local copies references/raw/car_subs/audio-system/<file>.pdf (fetched by R2), English 'Specifications' + 'Dimensions' tables rendered
and cropped with scripts/car_subs/pdf_crop.mjs (references/raw/car_subs/audio-system/png/crop_<file>.png), read by eye by R2B_SUBS_MORE.
Double-check per row: printed Qts vs Qms*Qes/(Qms+Qes) (printed by build_audio_system.py).
Power printed per coil ('2x 300 W RMS', '2x 500 W Musik'): rms_w / peak_w hold the totals (2 x printed), noted. Re and impedance printed
per coil ('2x 1.8', '2x 2'): re_ohm = per-coil value, ts_basis unknown (the sheet does not say how the coils were wired for the T/S).
'Mounting diameter' (b) taken as the cut-out, 'Mounting depth' (d) as mounting depth.
Row: model, file, size_in, rms per coil, music per coil, SPL 2.83 V, Re per coil, Z per coil, Fs, Xmax, Qms, Qes, Qts, Mms, Vas, Bl, Sd, cut mm, depth mm."""
ROWS = [
 ("R08 EVO3", "manual-R08-EVO3-20260803.pdf", 8, 150, 250, 86.9, 1.8, 2, 41.0, 16, 4.65, 0.58, 0.51, 71.83, 11.53, 5.94, 198.56, 170, 108),
 ("R10 EVO3", "manual-R10-EVO3-20260803.pdf", 10, 200, 350, 86.7, 1.8, 2, 31.5, 22, 5.56, 0.53, 0.49, 142.60, 25.68, 7.27, 320.47, 232, 130),
 ("R12 EVO3", "manual-R12-EVO3-20260804.pdf", 12, 300, 500, 86.6, 1.8, 2, 32.96, 22, 7.84, 0.87, 0.78, 225.88, 35.86, 7.34, 498.76, 282, 149),
 ("R15 EVO3", "manual-R15-EVO3-20260804.pdf", 15, 350, 600, 88.6, 1.8, 2, 24.17, 25, 6.32, 0.60, 0.55, 339.11, 118.40, 9.23, 814.33, 351, 170),
 ("HX08 FLAT EVO4", "manual-HX08-FLAT-EVO4-20260817.pdf", 8, 150, 300, 83.0, 1.9, 2, 34.2, 10, 9.91, 0.82, 0.76, 132.81, 12.76, 11.45, 235.06, 192, 72),
 ("HX10 FLAT EVO4", "manual-HX10-FLAT-EVO4-20260817.pdf", 10, 250, 500, 85.0, 2.1, 2, 31.9, 12.5, 4.86, 0.66, 0.58, 256.47, 19.84, 18.03, 380.13, 236, 82),
 ("HX12 FLAT EVO4", "manual-HX12-FLAT-EVO4-20260817.pdf", 12, 300, 600, 87.0, 2.1, 2, 26.8, 12.5, 5.98, 0.48, 0.44, 266.5, 56.87, 19.62, 551.56, 286, 89.2),
 ("CARBON06 EVO", "manual-Carbon06-EVO-20251110.pdf", 6.5, 80, 120, 86.7, 2.1, 2, 52.5, 10, 3.13, 0.45, 0.36, 46.52, 3.65, 3.91, 128.6, 145, 100),
 ("CARBON06 QC EVO", "manual-Carbon06-QC-EVO-20251112.pdf", 6.5, 40, 60, 86.5, 2.1, 2, 50.2, 10, 4.44, 0.40, 0.36, 53.46, 3.74, 6.08, 128.6, 145, 100, "QVC", "Sheet prints Re '4x 2.1' and impedance '4x 2' (four coils) but power '2x 40 W RMS / 2x 60 W Musik'; rms_w/peak_w = 2 x printed as for the other rows (UNVERIFIED for a four-coil driver)."),
 ("CARBON08 EVO", "manual-Carbon08-EVO-20251112.pdf", 8, 100, 140, 88, 2.1, 2, 43.11, 12, 3.14, 0.45, 0.39, 60.77, 14.17, 4.85, 210.87, 180, 89),
 ("CARBON10 EVO", "manual-Carbon10-EVO-20251210.pdf", 10, 125, 175, 85.5, 2.1, 2, 33, 14, 5.14, 0.45, 0.39, 90.77, 28.17, 9.85, 314, 227, 114),
 ("CARBON12 EVO", "manual-Carbon12-EVO-20251210.pdf", 12, 150, 200, 88, 2.1, 2, 27, 14, 5.64, 0.50, 0.45, 134, 56, 11.85, 490, 278, 129),
 ("R10 EVO", "R10-EVO-manual.pdf", 10, 200, 350, 89.9, 3.45, 4, 34.5, 21.5, 6.30, 0.56, 0.52, 122, 24.5, 14.06, 370, None, None, "DVC", "Older (2020) sheet layout: the dimension values were not legible in the crop and are left empty."),
 ("R12 FLAT EVO", "R12-FLAT-EVO-manual.pdf", 12, 400, 575, 90.9, 3.4, 4, 34.2, 15, 6.59, 0.56, 0.52, 162, 45.6, 14.5, 510, None, None, "SVC", "Single coil: power printed '400 W RMS / 575 W Music' (not per coil), Re 3.4, Zn 4. Dimension values not legible in the crop, left empty."),
 ("X06 EVO", "X06-EVO-manual.pdf", 6.5, 150, 250, 88.6, 1.9, 2, 56, 18, 4.40, 0.38, 0.35, 51, 3.9, 14.6, 150, None, None, "DVC", "Dimension values not legible in the crop, left empty."),
 ("X08 EVO", "X08-EVO-manual.pdf", 8, 200, 350, 88.9, 1.9, 2, 40.4, 19, 4.58, 0.39, 0.36, 79.3, 14.5, 15.7, 205, None, None, "DVC", "Dimension values not legible in the crop, left empty."),
]

NOT_USED = "R-10-FLAT-EVO.pdf is a CAR&HIFI magazine test page (no data sheet): left listed without T/S."
