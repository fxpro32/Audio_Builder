// Air constants. research_c §1: rho*c^2 differs ~2 % between common choices, so it is a setting and is printed on every result.
export interface Air { rho: number; c: number; label: string }
export const AIR_20C: Air = { rho: 1.204, c: 343.2, label: "20 °C (rho 1.204 kg/m³, c 343.2 m/s)" };
export const AIR_PRESETS: Air[] = [
  AIR_20C,
  { rho: 1.18, c: 343, label: "rho 1.18, c 343 (common calculators)" },
  { rho: 1.184, c: 346.1, label: "25 °C (rho 1.184, c 346.1; Wikipedia T/S page)" },
];
export const P_REF = 20e-6;
