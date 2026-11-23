// Sections of the app (B1_SHELL, R37, 2026-11-23): Subwoofer, Door speaker, Infinite baffle, Home speakers, Computer speakers.
// Pure data and rules (no DOM) so app/tests can check them. The UI (main.ts) shows the tabs, driver lists and presets given here.
import type { Driver } from "../engine/driver";
import type { DesignInputs } from "./model";
import { DOOR_TYPES, driverType, sizeOf } from "./driverlist";

export type SectionId = "subwoofer" | "door" | "ib" | "home" | "computer";
export interface SectionInfo {
  id: SectionId; label: string; explain: string;
  /** Tabs shown in this section, in order. */
  tabs: string[];
  /** Driver sizes offered in this section's driver lists (nominal inches); undefined = every driver (Subwoofer: as before B1). */
  sizeIn?: [number, number];
  /** Does this section design a box (3D box, box inputs, Boards)? Door speaker: no. */
  box: boolean;
  /** Item kind made in this section. */
  kind: "box" | "door" | "ib";
}
export const SECTIONS: SectionInfo[] = [
  { id: "subwoofer", label: "Subwoofer", explain: "Car subwoofer boxes: sealed, ported, passive radiator, transmission line, bandpass, free-form; fix an existing box; MDF boards.", tabs: ["design", "fix", "boards", "drivers", "parts", "system", "bom", "project", "help"], box: true, kind: "box" },
  { id: "door", label: "Door speaker", explain: "Speakers in the car doors (about 4 to 8 inch). No box: a door is not a box. Door mounting: to be decided. Shown: driver data, fit check, cone travel and high-pass, displacement limit.", tabs: ["door", "drivers", "parts", "system", "bom", "project", "help"], sizeIn: [4, 8], box: false, kind: "door" },
  { id: "ib", label: "Infinite baffle", explain: "Subwoofers on a sealed baffle, no box (as used and taught by PS Sound, UK): trunk IB (boot behind, cabin in front) or true IB (through the floor). Response, leak, excursion, subsonic, cabin pressure, baffle board.", tabs: ["ib", "boards", "drivers", "parts", "system", "bom", "project", "help"], sizeIn: [8, 40], box: false, kind: "ib" },
  { id: "home", label: "Home speakers", explain: "Bookshelf and floor-standing speaker boxes for the house (drivers about 4 to 12 inch): sealed, ported, passive radiator.", tabs: ["design", "boards", "drivers", "parts", "system", "bom", "project", "help"], sizeIn: [4, 12], box: true, kind: "box" },
  { id: "computer", label: "Computer speakers", explain: "Small near-field boxes for a desk (drivers about 2 to 5 inch): sealed, ported, passive radiator.", tabs: ["design", "boards", "drivers", "parts", "system", "bom", "project", "help"], sizeIn: [2, 5], box: true, kind: "box" },
];
export const SECTION_IDS = SECTIONS.map((s) => s.id);
export const sectionInfo = (id?: string): SectionInfo => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
export const isSection = (id: unknown): id is SectionId => typeof id === "string" && (SECTION_IDS as string[]).includes(id);
/** What the Section control says about sections (shown under it). */
export const SECTION_HELP = "A section is the kind of speaker you are working on. It decides which screens, drivers and boxes are shown. A project can hold items from several sections (for example a subwoofer box and door speakers).";

/** Box types offered in Design new for a section (undefined = all, as before B1). */
export function sectionTopologies(id: SectionId): string[] | undefined {
  return id === "home" || id === "computer" ? ["sealed", "vented", "pr"] : undefined;
}

/** Is this driver offered in the section's driver lists? Subwoofer: every driver (unchanged). Others: nominal size inside the
 * section's range; your own drivers without a size are kept; passive radiators only where boxes are designed. */
export function driverFitsSection(d: Driver, id: SectionId): boolean {
  const s = sectionInfo(id);
  if (!s.sizeIn) return true;
  if (d.kind === "passive") return false;
  // B3: typed car drivers go where they belong: door = midbass / midrange / coaxial / component sets / full range;
  // infinite baffle = subwoofers; home and computer boxes: any but tweeters
  const t = driverType(d);
  if (t && id === "door" && !DOOR_TYPES.includes(t)) return false;
  if (t && id === "ib" && t !== "subwoofer") return false;
  if (t === "tweeter") return false;
  const z = sizeOf(d);
  if (z === undefined) return !d.library;
  return z >= s.sizeIn[0] && z <= s.sizeIn[1];
}

/** Default drivers of the sections that are not car subwoofers (bundled driver-base library, CC BY 4.0). The subwoofer section
 * keeps the per-user default driver (settings defaultDriverId, R29). Door: none, the user picks. Infinite baffle (B2): the
 * Acoustic Elegance IB15AU PS Sound use and sell (data/drivers/acoustic-elegance-ib15au-4ohm.json, values from the PS Sound
 * shop page); no IB driver is in the bundled libraries. */
export const SECTION_DEFAULT_DRIVER: Partial<Record<SectionId, string>> = {
  ib: "acoustic-elegance-ib15au-4ohm",             // Acoustic Elegance IB15AU 4 ohm, 15 in, fs 20.41 Hz, Qts 0.62
  home: "lib-driverbase-dayton-rs180-8-8ohm",      // Dayton Audio RS180-8, 7 in (180 mm frame) woofer
  computer: "lib-driverbase-dayton-nd105-4-4ohm",  // Dayton Audio ND105-4, 4 in (105 mm frame) woofer
};

export interface Preset { id: string; label: string; note: string; design: Partial<DesignInputs>; watts: number; drivers?: number; bass?: string; like?: string }
/** Starting points for the home and computer sections (outside sizes in mm), from the reference products and the presets
 * proposed in references/research_h_ib_door_home_pc.md 3.1-3.2 (B2_SECTIONS; B1's first sizes before). Applying a preset
 * scales the box to the volume the driver needs keeping the preset's proportions (Keep the volume with no side edited); the
 * floor-standing one keeps its height (locked) unless the box would come out shallower than 0.8 x its width (engine/homebox.ts
 * keepDepth: then the height gives way). These are starting shapes, not a standard. */
export const PRESETS: Partial<Record<SectionId, Preset[]>> = {
  home: [
    { id: "bookshelf-sealed", label: "Small bookshelf, sealed", note: "190 × 310 × 220 mm outside, 18 mm MDF, Qtc 0.707, 50 W", watts: 50, bass: "about 65-80 Hz (±3 dB) for a 4-5.25 in woofer", like: "BBC LS3/5A (310 × 190 × 160 mm, about 5 L inside, sealed)",
      design: { kind: "sealed", topology: "sealed", target: "qtc", qtc: 0.707, maxW: 190, maxH: 310, maxD: 220, t: 18, wedge: false, bracesL: 0.2 } },
    { id: "bookshelf-ported", label: "Bookshelf, ported", note: "200 × 335 × 285 mm outside, 18 mm MDF, round port, QB3/SBB4, 50 W", watts: 50, bass: "about 50 Hz (±3 dB) for a 6.5 in woofer", like: "Wharfedale Diamond 12.2 (335 × 200 × 285 mm, 11.8 L) and KEF LS50 Meta (302 × 200 × 280.5 mm)",
      design: { kind: "vented", topology: "vented", target: "qb3", maxW: 200, maxH: 335, maxD: 285, t: 18, wedge: false, portShape: "round", portD: 50, portCount: 1, bracesL: 0.3 } },
    { id: "floor-ported", label: "Floor-standing, ported, 2 drivers", note: "200 × 1000 × 340 mm outside, 2 drivers, 18 mm MDF, round port, QB3/SBB4, 50 W per driver; the height is kept while the box stays at least 0.8 × as deep as wide", watts: 50, drivers: 2, bass: "about 40-45 Hz (±3 dB) for 2 × 5.25-6.5 in", like: "Wharfedale Diamond 12.3 / 12.4 (925-1100 × 180-200 × 320-350 mm, 26.6-40.8 L)",
      design: { kind: "vented", topology: "vented", target: "qb3", maxW: 200, maxH: 1000, maxD: 340, t: 18, wedge: false, portShape: "round", portD: 70, portCount: 1, bracesL: 1, lockH: true } },
  ],
  computer: [
    { id: "desktop-sealed", label: "Desktop, sealed", note: "125 × 185 × 150 mm outside, 12 mm MDF, Qtc 0.707, 15 W", watts: 15, bass: "about 60-75 Hz for a 3-4 in woofer", like: "Genelec 8010A (181 × 121 × 115 mm, reflex) in size",
      design: { kind: "sealed", topology: "sealed", target: "qtc", qtc: 0.707, maxW: 125, maxH: 185, maxD: 150, t: 12, wedge: false, bracesL: 0 } },
    { id: "desktop-ported", label: "Desktop, ported", note: "150 × 245 × 140 mm outside, 12 mm MDF, round port, QB3/SBB4, 15 W", watts: 15, bass: "about 60 Hz (±3 dB) for a 4-4.5 in woofer", like: "Genelec 8020D (242 × 148 × 142 mm) and JBL 104 (247 × 153 × 124 mm)",
      design: { kind: "vented", topology: "vented", target: "qb3", maxW: 150, maxH: 245, maxD: 140, t: 12, wedge: false, portShape: "round", portD: 35, portCount: 1, bracesL: 0 } },
  ],
};
