import "./env";
import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { devicesFile } from "../src/config";
import { addDevice, findByToken, listDevices, revokeDevice, touchDevice } from "../src/store";

type OnDisk = { devices: { id: string; lastSeenAt: number }[] };
const readDisk = async () => (await Bun.file(devicesFile()).json()) as OnDisk;

describe("device store", () => {
  afterEach(() => setSystemTime());

  test("concurrent pairings are all kept, in memory and on disk", async () => {
    const before = (await listDevices()).length;
    const added = await Promise.all(
      Array.from({ length: 10 }, (_, i) => addDevice(`phone-${i}`)),
    );
    expect((await listDevices()).length).toBe(before + 10);
    const onDisk = await readDisk();
    for (const d of added) expect(onDisk.devices.some((x) => x.id === d.id)).toBe(true);
  });

  test("tokens and ids are unique", async () => {
    const devices = await listDevices();
    expect(new Set(devices.map((d) => d.token)).size).toBe(devices.length);
    expect(new Set(devices.map((d) => d.id)).size).toBe(devices.length);
  });

  test("findByToken finds the right device and nothing for unknown tokens", async () => {
    const d = await addDevice("lookup");
    expect((await findByToken(d.token))?.id).toBe(d.id);
    expect(await findByToken("nope")).toBeUndefined();
    expect(await findByToken("")).toBeUndefined();
  });

  test("revoking removes the device and its token stops working", async () => {
    const d = await addDevice("to-revoke");
    await revokeDevice(d.id);
    expect(await findByToken(d.token)).toBeUndefined();
    expect((await readDisk()).devices.some((x) => x.id === d.id)).toBe(false);
  });

  test("touch updates lastSeenAt in memory but only writes to disk once a minute", async () => {
    const t0 = Date.now();
    setSystemTime(new Date(t0));
    const d = await addDevice("toucher");

    setSystemTime(new Date(t0 + 10_000));
    await touchDevice(d.id);
    expect((await findByToken(d.token))?.lastSeenAt).toBe(t0 + 10_000);
    expect((await readDisk()).devices.find((x) => x.id === d.id)?.lastSeenAt).toBe(t0);

    setSystemTime(new Date(t0 + 61_000));
    await touchDevice(d.id);
    expect((await readDisk()).devices.find((x) => x.id === d.id)?.lastSeenAt).toBe(t0 + 61_000);
  });

  test("a device checking in every few seconds still gets saved about once a minute", async () => {
    const t0 = Date.now();
    setSystemTime(new Date(t0));
    const d = await addDevice("frequent");
    const savedValues = new Set<number>();
    for (let t = 5_000; t <= 150_000; t += 5_000) {
      setSystemTime(new Date(t0 + t));
      await touchDevice(d.id);
      const onDisk = (await readDisk()).devices.find((x) => x.id === d.id)?.lastSeenAt;
      if (onDisk) savedValues.add(onDisk);
    }
    // 150s of check-ins: creation + saves at ~60s and ~120s.
    expect(savedValues.size).toBe(3);
    expect(Math.max(...savedValues)).toBeGreaterThanOrEqual(t0 + 120_000);
  });

  test("touching an unknown device is a no-op", async () => {
    await expect(touchDevice("missing")).resolves.toBeUndefined();
  });
});
