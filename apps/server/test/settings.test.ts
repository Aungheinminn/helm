import { TEST_DATA_DIR } from "./env";
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { getSettings, updateSettings } from "../src/settings";

describe("settings", () => {
  test("partial updates keep other fields and survive a reload from disk", async () => {
    await updateSettings({ keepAwakeAtLaunch: true });
    expect(getSettings().keepAwakeAtLaunch).toBe(true);
    const onDisk = await Bun.file(join(TEST_DATA_DIR, "settings.json")).json();
    expect(onDisk.keepAwakeAtLaunch).toBe(true);
    await updateSettings({ keepAwakeAtLaunch: false });
    expect(getSettings()).toEqual({ keepAwakeAtLaunch: false });
  });
});
