"""R2B_SUBS_MORE (2026-11-23): Fi Car Audio Xv5 and Alpha v2 T/S READ FROM IMAGES (spec-sheet PNGs on the product pages,
https://cdn11.bigcommerce.com/s-geo8vxzs7m/images/stencil/original/image-manager/<file>; local copies references/raw/car_subs/fi/img/).
Read by eye by agent R2B_SUBS_MORE at full resolution (1545 x 2000 px, large print). Double-check per row (scripts/car_subs/build_fi_lower.py
prints it): Qts vs Qms*Qes/(Qms+Qes), and Vas vs rho*c^2*Sd^2*Cms with Sd from the printed diameter D.
Cut-out (B) and mounting depth (D) from the series dimensions image (xv5-dimensions..., alpha-v2-series-dimensions...).
Columns: model, size, coil option (ohm per coil), image file, page slug, rms (image badge), D mm, Re, Fs, Zmax, Bl, Qms, Qes, Qts, Vas L, Le10k mH,
eta0 %, SPL dB, Mms g, Cms (printed), Xmax mm, Xmech mm, displacement cu ft, cut-out mm, depth mm."""
IMG = "https://cdn11.bigcommerce.com/s-geo8vxzs7m/images/stencil/original/image-manager/"
ROWS = [
 ("Xv5 8 D1", 8, 1, "xv5-8-1791493581466.png", "xv5-series-8", 500, 158.8, 2.124, 38.01, 15.41, 11.464, 4.447, 0.7104, 0.6126, 7.306, 0.5471, 0.06278, 80.08, 119.2, "0.000133", 16, 24, 0.08, 184.15, 156.7),
 ("Xv5 8 D2", 8, 2, "xv5-8-1791493581466.png", "xv5-series-8", 500, 158.8, 4.116, 36.02, 37.26, 16.55, 4.924, 0.6115, 0.5439, 6.411, 1.257, 0.05494, 79.5, 150.4, "0.000117", 16, 24, 0.08, 184.15, 156.7),
 ("Xv5 10 D1", 10, 1, "xv5-10.png", "xv5-series-10", 1500, 203.2, 1.958, 39.2, 20.88, 18.73, 4.417, 0.457, 0.4142, 8.334, 0.7867, 0.1402, 83.57, 240.6, "5.6x10^-5", 23, 34, 0.16, 236.7, 167),
 ("Xv5 10 D2", 10, 2, "xv5-10.png", "xv5-series-10", 1500, 203.2, 3.685, 37.05, 47.81, 26.76, 4.991, 0.4168, 0.3847, 7.631, 1.805, 0.1207, 82.92, 291, "5.2x10^-5", 23, 34, 0.16, 236.7, 167),
 ("Xv5 12 D1", 12, 1, "xv5-12.png", "xv5-series-12-subwoofer", 1500, 241.3, 1.995, 38.43, 16.9, 20.35, 4.845, 0.6486, 0.572, 12.22, 0.704, 0.04129, 84.97, 280.2, "4.2x10^-5", 23, 34, 0.17, 279.4, 180.5),
 ("Xv5 12 D2", 12, 2, "xv5-12.png", "xv5-series-12-subwoofer", 1500, 241.3, 3.719, 36.34, 45.79, 26.33, 4.802, 0.4244, 0.39, 17.56, 1.585, 0.1893, 84.87, 320.8, "6.2x10^-5", 23, 34, 0.17, 279.4, 180.5),
 ("Xv5 15 D1", 15, 1, "xv5-15.png", "xv5-series-15-subwoofer", 1500, 311.1, 2.024, 33.82, 22.21, 20.51, 4.796, 0.4809, 0.4371, 64.74, 0.7471, 0.3757, 87.85, 334.5, "8x10^-5", 29, 34.5, 0.21, 355.6, 212.1),
 ("Xv5 15 D2", 15, 2, "xv5-15.png", "xv5-series-15-subwoofer", 1500, 311.1, 3.777, 31.68, 50.26, 26.13, 5.196, 0.4223, 0.3906, 61.67, 1.682, 0.3638, 87.71, 378.8, "7.6x10^-5", 29, 34.5, 0.21, 355.6, 212.1),
 ("Alpha v2 10 D2", 10, 2, "alpha-v2-series-10-1791495655311.png", "alpha-series-v2-10", 1000, 203.2, 3.83, 35.34, 55.18, 25.44, 4.218, 0.3146, 0.2928, 12.17, 1.35, 0.1769, 84.58, 232.9, "8.2x10^-5 mm/N (unit as printed)", 13, 19.5, 0.14, 236.7, 144),
 ("Alpha v2 10 D4", 10, 4, "alpha-v2-series-10-1791495655311.png", "alpha-series-v2-10", 1000, 203.2, 7.511, 36.15, 98.72, 32.09, 3.671, 0.3023, 0.2793, 14.37, 1.446, 0.2322, 85.76, 188.8, "9.7x10^-5 mm/N (unit as printed)", 13, 19.5, 0.14, 236.7, 144),
 ("Alpha v2 15 D2", 15, 2, "alpha-v2-series-15-1791495861919.png", "alpha-series-v2-15", 1000, 311.1, 3.856, 28.09, 49.62, 25.07, 4.805, 0.4049, 0.3735, 82.32, 1.311, 0.4298, 88.43, 316.6, "0.000101 mm/N (unit as printed)", 13, 19.5, 0.195, 355.6, 187.8),
 ("Alpha v2 15 D4", 15, 4, "alpha-v2-series-15-1791495861919.png", "alpha-series-v2-15", 1000, 311.1, 7.205, 31.86, 88.81, 32.72, 4.645, 0.4101, 0.3769, 66.48, 1.376, 0.5, 89.09, 304.8, "8.2x10^-5 mm/N (unit as printed)", 13, 19.5, 0.195, 355.6, 187.8),
]
# Listed without T/S: (model, page slug, rms, cut-out mm, depth mm, note)
LISTED = [
 ("Xv5 18 (D1/D2)", "xv5-series-18-subwoofer", 1500, 428.6, 251.7, "The 18 in page shows the series feature/dimension image only; no T/S image (2026-11-23)."),
 ("Alpha v2 12 (D2/D4)", "alpha-series-v2-12", 1000, 279.4, 154.6, "The 12 in page shows the Alpha V2 10 in T/S image (identical file to the 10 in page), so no 12 in T/S were taken (maker page error)."),
]
