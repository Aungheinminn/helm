import { readFileSync } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { config } from "./config";

export type Settings = { keepAwakeAtLaunch: boolean };

const DEFAULTS: Settings = { keepAwakeAtLaunch: false };
const settingsFile = () => join(config.dataDir, "settings.json");

let current: Settings | null = null;

export function getSettings(): Settings {
  if (current) return current;
  try {
    current = { ...DEFAULTS, ...JSON.parse(readFileSync(settingsFile(), "utf8")) };
  } catch {
    current = { ...DEFAULTS };
  }
  return current!;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...getSettings(), ...patch };
  const p = settingsFile();
  await mkdir(dirname(p), { recursive: true });
  await Bun.write(`${p}.tmp`, JSON.stringify(next, null, 2));
  await rename(`${p}.tmp`, p);
  current = next;
  return next;
}
