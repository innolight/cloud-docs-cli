import { mkdir, access } from "node:fs/promises";
import { constants } from "node:fs";

const ILLEGAL = /[:,?/\\<>"|*\x00-\x1f]/g;

export function sanitize(name: string, fallback: string): string {
  let s = name.replace(ILLEGAL, "").replace(/\s+/g, "-").trim();
  s = s.replace(/[-. ]+$/g, "");
  if (s.length > 180) s = s.slice(0, 180).trimEnd();
  if (!s) s = fallback;
  return s;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
