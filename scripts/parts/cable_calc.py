#!/usr/bin/env python3
"""R3: reference implementation of the cable calculator maths (R41) and the worked examples in
references/research_i_car_electronics.md section B. Pure functions; constants from data/parts_raw/_reference/cable_constants.json.
The app (B4_CABLE) should port these functions, not call this script."""
import json, math
C = json.load(open("/workspace/data/parts_raw/_reference/cable_constants.json"))
AWG = {r["awg"]: r for r in C["awg_table"]}
SIZES = ["18", "16", "14", "12", "10", "8", "6", "4", "2", "1", "1/0", "2/0", "3/0", "4/0"]
ANL = [35, 40, 50, 60, 80, 100, 125, 150, 175, 200, 225, 250, 300, 325, 350, 400, 500]  # common ANL ratings (Narva sells 80-250; others list 35-500)
ETA_DESIGN = {"D": 0.50, "BD": 0.50, "AD": 0.50, "AB": 0.45}  # P_rated / (13.8 V x I_max_sine) from Rockford maker data (min to median); see doc B3

def r_per_m(area_mm2, mat="copper", T=50.0):
    c = C["conductors"]["cca_10pct" if mat == "cca" else "copper"]
    return c["rho20_ohm_mm2_per_m"] * (1 + c["alpha_per_C"] * (T - 20)) / area_mm2

def ampacity(awg, location="outside", mat="copper", bundled=2):
    r = AWG[awg]; a = r["abyc_105C_outside_engine_a"] if location == "outside" else r["abyc_105C_inside_engine_a"]
    f = 1.0 if bundled <= 2 else (0.70 if bundled == 3 else (0.60 if bundled <= 6 else 0.50))
    m = 1.0 if mat == "copper" else math.sqrt(C["conductors"]["copper"]["rho20_ohm_mm2_per_m"] / C["conductors"]["cca_10pct"]["rho20_ohm_mm2_per_m"])
    return a * f * m

def amp_current(p_total_w, cls="D", v=13.8, i_max_maker=None, fuse_maker=None):
    """Design (peak) current of one amplifier: maker max draw if published, else maker fuse, else P/(eta_design*V)."""
    if i_max_maker: return i_max_maker, "maker max current draw"
    if fuse_maker: return fuse_maker, "maker fuse rating (upper bound)"
    return p_total_w / (ETA_DESIGN.get(cls, 0.50) * v), f"P/(eta {ETA_DESIGN.get(cls, 0.50)} x {v} V)"

def next_fuse(i): return next(f for f in ANL if f >= i)

def size_power_run(i_design, fuse_a, len_power_m, len_ground_m, v=13.8, drop_pct=3.0, mat="copper", location="outside", T=50.0, extra_drop_v=0.0):
    """Smallest AWG that (1) has ampacity >= fuse (fuse protects the wire) and (2) keeps I x R(power + ground) + extra <= drop."""
    allowed = v * drop_pct / 100
    for g in SIZES:
        a = AWG[g]["area_mm2"]; R = r_per_m(a, mat, T) * (len_power_m + len_ground_m); vd = i_design * R + extra_drop_v
        if ampacity(g, location, mat) >= fuse_a and vd <= allowed:
            return {"awg": g, "area_mm2": a, "ampacity_a": round(ampacity(g, location, mat), 1), "loop_mohm": round(R * 1000, 2), "drop_v": round(vd, 3), "allowed_v": round(allowed, 3)}
    return None

def drop(awg, i, length_m, mat="copper", T=50.0): return i * r_per_m(AWG[awg]["area_mm2"], mat, T) * length_m

def speaker(awg, length_m, z_ohm, r_out=0.0, mat="copper", T=20.0):
    R = 2 * length_m * r_per_m(AWG[awg]["area_mm2"], mat, T)
    return {"awg": awg, "loop_ohm": round(R, 4), "pct_of_z": round(100 * R / z_ohm, 2), "level_loss_db": round(20 * math.log10(z_ohm / (z_ohm + R)), 3),
            "power_lost_in_wire_pct": round(100 * R / (z_ohm + R), 2), "system_damping_factor_if_amp_rout": (round(z_ohm / (r_out + R), 1) if r_out + R > 0 else None)}

def speaker_min_awg(length_m, z_ohm, frac=0.05, mat="copper"):
    for g in SIZES:
        if 2 * length_m * r_per_m(AWG[g]["area_mm2"], mat, 20) <= frac * z_ohm: return g

if __name__ == "__main__":
    print("E1 single sub amp: Rockford T1500-1bdCP (maker: 1500 W RMS, max 200 A @13.8 V sine, avg 100 A music, fuse 200 A, power wire 4 AWG)")
    I, how = amp_current(1500, "BD", i_max_maker=200); F = next_fuse(200)
    print("  I_design", I, how, "| fuse", F)
    for g in ("4", "2", "1/0"):
        print(f"  {g} AWG Cu, 5.0 m power + 0.5 m ground @50C: drop at 200 A = {drop(g, 200, 5.5):.2f} V, at 100 A music avg = {drop(g, 100, 5.5):.2f} V, ABYC 105C ampacity {ampacity(g):.0f} A")
    print("  calculator result (3 % of 13.8 V):", size_power_run(I, F, 5.0, 0.5))
    print("  same, CCA:", size_power_run(I, F, 5.0, 0.5, mat="cca"))
    print("E2 no maker current: 1000 W class D mono + 4 x 100 W class AB, P/(eta V)")
    i1, h1 = amp_current(1000, "D"); i2, h2 = amp_current(400, "AB"); print(f"  amp1 {i1:.0f} A ({h1}), amp2 {i2:.0f} A ({h2}), total {i1+i2:.0f} A")
    Ft = next_fuse(i1 + i2); main = size_power_run(i1 + i2, Ft, 5.0, 0.0, drop_pct=2.0); print("  main fuse", Ft, "| main run 5 m (budget 2 % of 13.8 V):", main)
    for name, ii, gl in (("amp1", i1, 0.5), ("amp2", i2, 0.5)):
        fb = next_fuse(ii); br = size_power_run(ii, fb, 0.5, gl, drop_pct=3.0, extra_drop_v=(i1 + i2) * main["loop_mohm"] / 1000)
        print(f"  branch {name}: fuse {fb} A, 0.5 m branch + 0.5 m ground:", br)
    print("E3 speaker cable, 4 m run each way to a 2 ohm sub load (copper, 20 C)")
    for g in ("16", "14", "12", "10"): print("  ", speaker(g, 4.0, 2.0, r_out=0.02))
    print("  smallest AWG for <= 5 % of Z:", speaker_min_awg(4.0, 2.0), "| for a 4 ohm door speaker 5 m:", speaker_min_awg(5.0, 4.0))
