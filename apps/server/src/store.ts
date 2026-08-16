import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { devicesFile } from "./config";

export type Device = {
  id: string;
  name: string;
  token: string;
  createdAt: number;
  lastSeenAt: number;
};

type StoreShape = { devices: Device[] };

async function readStore(): Promise<StoreShape> {
  const f = Bun.file(devicesFile());
  if (!(await f.exists())) return { devices: [] };
  return (await f.json()) as StoreShape;
}

async function writeStore(s: StoreShape): Promise<void> {
  const p = devicesFile();
  await mkdir(dirname(p), { recursive: true });
  await Bun.write(p, JSON.stringify(s, null, 2));
}

export async function listDevices(): Promise<Device[]> {
  return (await readStore()).devices;
}

export async function addDevice(name: string): Promise<Device> {
  const s = await readStore();
  const now = Date.now();
  const device: Device = {
    id: randomBytes(8).toString("hex"),
    name,
    token: randomBytes(32).toString("base64url"),
    createdAt: now,
    lastSeenAt: now,
  };
  s.devices.push(device);
  await writeStore(s);
  return device;
}

export async function revokeDevice(id: string): Promise<void> {
  const s = await readStore();
  s.devices = s.devices.filter((d) => d.id !== id);
  await writeStore(s);
}

export async function findByToken(token: string): Promise<Device | undefined> {
  const s = await readStore();
  return s.devices.find((d) => d.token === token);
}

export async function touchDevice(id: string): Promise<void> {
  const s = await readStore();
  const d = s.devices.find((x) => x.id === id);
  if (!d) return;
  d.lastSeenAt = Date.now();
  await writeStore(s);
}
