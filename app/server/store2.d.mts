// Types for store2.mjs (used by app/tests/projectv2.test.ts). B1_SHELL.
export const SAFE: RegExp;
export const FEATURES: string[];
export function isV2(o: unknown): boolean;
export function deletedDir(dataDir: string): string;
export function backupBeforeV2(dataDir: string, file: string, name: string, incoming: unknown): string | null;
export function moveToDeleted(dataDir: string, p: string, label: string): string | null;
export function writeToDeleted(dataDir: string, label: string, obj: unknown): string;
export function projectSummary(p: any): { name: string; title: string; format: 1 | 2; section: string; items: number; saved?: string };
export function itemSummary(it: any): { id: string; name: string; section: string; kind: string; saved?: string };
export const LOGO_NAMES: string[];
export function findLogo(dataDir: string): string | null;
