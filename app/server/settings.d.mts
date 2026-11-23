// Types for settings.mjs (used by app/tests/settings.test.ts).
export type Tab = "design" | "fix" | "drivers" | "help" | "boards" | "door" | "ib" | "project";
export type Section = "subwoofer" | "door" | "ib" | "home" | "computer";
export interface Settings { defaultDriverId?: string; defaultProject?: string; defaultTab?: Tab; defaultSection?: Section }
export type SettingsResult = { ok: true; settings: Settings } | { ok: false; code: number; error: string };
export const SETTINGS_KEYS: string[];
export const TABS: Tab[];
export const SECTIONS: Section[];
export function settingsFile(dataDir: string): string;
export function readSettings(dataDir: string): Settings;
export function validateSettings(current: Settings, patch: unknown, driverExists: (id: string) => boolean, projectExists?: (name: string) => boolean): SettingsResult;
export function writeSettings(dataDir: string, patch: unknown, driverExists: (id: string) => boolean, projectExists?: (name: string) => boolean): SettingsResult;
