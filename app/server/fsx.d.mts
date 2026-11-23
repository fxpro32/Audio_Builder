import type path from "node:path";
export function insideDir(base: string, p: string, pathApi?: typeof path | typeof path.win32 | typeof path.posix): boolean;
export function isWindowsReservedName(name: string): boolean;
export function safeId(id: string, platform?: string): boolean;
export function renameRetry(src: string, dest: string, opts?: { platform?: string; fsApi?: any; tries?: number; waitMs?: number }): void;
