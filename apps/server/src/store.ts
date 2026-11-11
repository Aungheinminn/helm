import { mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { devicesFile } from "./config";
import { tokensEqual } from "./util/tokens";

export type Device = {
  id: string;
  name: string;
  token: string;
  createdAt: number;
  lastSeenAt: number;
};

type StoreShape = { devices: Device[] };

// lastSeenAt is shown as "last active" in the tray, so minute resolution is plenty
// and avoids rewriting the file on every polled request.
const TOUCH_PERSIST_INTERVAL_MS = 60_000;

let cache: StoreShape | null = null;
let loading: Promise<StoreShape> | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<StoreShape> {
  if (cache) return cache;
  loading ??= (async () => {
    const f = Bun.file(devicesFile());
    cache = (await f.exists()) ? ((await f.json()) as StoreShape) : { devices: [] };
    return cache;
  })();
  return loading;
}

function persist(): Promise<void> {
  const next = writeChain.then(async () => {
    const p = devicesFile();
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    await Bun.write(tmp, JSON.stringify(cache, null, 2));
    await rename(tmp, p);
  });
  writeChain = next.catch((e) => console.error("failed to persist devices", e));
  return next;
}

export async function listDevices(): Promise<Device[]> {
  return (await load()).devices;
}

export async function addDevice(name: string): Promise<Device> {
  const s = await load();
  const now = Date.now();
  const device: Device = {
    id: randomBytes(8).toString("hex"),
    name,
    token: randomBytes(32).toString("base64url"),
    createdAt: now,
    lastSeenAt: now,
  };
  s.devices.push(device);
  await persist();
  return device;
}

export async function revokeDevice(id: string): Promise<void> {
  const s = await load();
  s.devices = s.devices.filter((d) => d.id !== id);
  await persist();
}

export async function findByToken(token: string): Promise<Device | undefined> {
  const s = await load();
  return s.devices.find((d) => tokensEqual(d.token, token));
}

export async function touchDevice(id: string): Promise<void> {
  const s = await load();
  const d = s.devices.find((x) => x.id === id);
  if (!d) return;
  const now = Date.now();
  const stale = now - d.lastSeenAt >= TOUCH_PERSIST_INTERVAL_MS;
  d.lastSeenAt = now;
  if (stale) await persist();
}
