// Fixture for tests/system.test.ts (B4_SYSTEM_UI): a copy of the full system of tests/diagram.test.ts (B6A), kept in a non-test
// file so importing it does not run the diagram tests twice.
import type { ProjectDoc } from "../src/ui/projectv2";
const item = (id: string, kind: string, name: string, data: any = {}, links: any[] = [], section = "electrical") => ({ id, section, kind, name, data, links: links.map((l) => ({ from: id, ...l })) });

/** Battery, 250 A ANL at the battery, 0 AWG main run, fused distribution block, capacitor, 2 amps, DSP, head unit, sub box,
 * door speakers, chassis ground. */
export function fullSystem(): ProjectDoc {
  return { format: 2, name: "b6a_full", title: "B6A full system", section: "subwoofer", saved: "2026-11-23T08:00:00.000Z", items: [
    item("bat", "battery", "Battery", { alternatorA: 150, vehicleLoadA: 40 }, [{ to: "anl", kind: "power" }]),
    item("anl", "fuseholder", "Main fuse ANL", { ratingA: 250, distanceMm: 150, type: "ANL" }, [{ to: "db", kind: "power", cableItemId: "c_main" }]),
    item("c_main", "cable", "0 AWG power", { lengthM: 3.5, size: "1/0", material: "copper" }),
    item("db", "distribution", "Fused distribution", { fused: true }, [{ to: "cap", kind: "power", cableItemId: "c_b1" }, { to: "amp2", kind: "power", cableItemId: "c_b2" }, { to: "dsp", kind: "power", cableItemId: "c_b3" }]),
    item("c_b1", "cable", "4 AWG to cap", { lengthM: 0.5, size: "4" }),
    item("c_b2", "cable", "8 AWG to amp 2", { lengthM: 0.6, size: "8" }),
    item("c_b3", "cable", "10 AWG to DSP", { lengthM: 0.6, size: "10" }),
    item("cap", "capacitor", "1 F capacitor", { farads: 1, prechargeOhm: 1000 }, [{ to: "amp1", kind: "power" }]),
    item("amp1", "amplifier", "Mono amp", { rmsW: 1000, class: "D", minLoadOhm: 1, channels: 1 }, [
      { to: "gnd", kind: "ground", cableItemId: "c_g1" }, { to: "box-1", kind: "speaker", cableItemId: "c_s1", fromPort: "SPK" }]),
    item("amp2", "amplifier", "4ch amp", { rmsW: 300, class: "AB", minLoadOhm: 2, channels: 4 }, [
      { to: "gnd", kind: "ground", cableItemId: "c_g2" }, { to: "doors", kind: "speaker", cableItemId: "c_s2", fromPort: "CH1" }]),
    item("c_g1", "cable", "4 AWG ground 1", { lengthM: 0.4, size: "4" }),
    item("c_g2", "cable", "8 AWG ground 2", { lengthM: 0.4, size: "8" }),
    item("c_s1", "cable", "12 AWG sub wire", { lengthM: 3, size: "12" }),
    item("c_s2", "cable", "14 AWG door wire", { lengthM: 2, size: "14" }),
    item("gnd", "other", "Chassis ground", { role: "ground" }),
    item("hu", "other", "Head unit", { role: "headunit" }, [{ to: "dsp", kind: "signal", fromPort: "RCA out" }, { to: "amp1", kind: "remote" }, { to: "amp2", kind: "remote" }, { to: "dsp", kind: "remote" }]),
    item("dsp", "dsp", "DSP 8ch", { iMaxA: 2 }, [{ to: "amp1", kind: "signal", fromPort: "out 7/8" }, { to: "amp2", kind: "signal", fromPort: "out 1-4" }, { to: "gnd", kind: "ground" }]),
    item("box-1", "box", "Sub box", { drivers: 1, power: { watts: 1000, impedance: 2 } }, [], "subwoofer"),
    item("doors", "door", "Front doors", { driverId: "door4", count: 2, loadOhm: 4 }, [], "door"),
  ] as any };
}
