import { describe, expect, test } from "bun:test";
import {
  isLoopbackAddress,
  parseBattery,
  parseBrightness,
  parseLsof,
  parseVolume,
} from "../src/parse";

describe("parseVolume", () => {
  test("reads level and mute state", () => {
    expect(
      parseVolume("output volume:38, input volume:62, alert volume:49, output muted:false"),
    ).toEqual({ level: 38, muted: false });
  });

  test("reports muted", () => {
    expect(parseVolume("output volume:20, input volume:50, alert volume:100, output muted:true"))
      .toEqual({ level: 20, muted: true });
  });

  test("outputs without software volume give a null level", () => {
    expect(
      parseVolume(
        "output volume:missing value, input volume:50, alert volume:100, output muted:missing value",
      ),
    ).toEqual({ level: null, muted: false });
  });

  test("empty output (osascript failed) is not adjustable", () => {
    expect(parseVolume("")).toEqual({ level: null, muted: false });
  });
});

describe("parseBattery", () => {
  test("discharging with time left", () => {
    const raw = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=21495907)\t47%; discharging; 3:49 remaining present: true`;
    expect(parseBattery(raw)).toEqual({
      percent: 47,
      state: "discharging",
      onAC: false,
      timeRemaining: "3:49",
    });
  });

  test("charging on AC", () => {
    const raw = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=21495907)\t56%; charging; 1:12 remaining present: true`;
    expect(parseBattery(raw)).toEqual({
      percent: 56,
      state: "charging",
      onAC: true,
      timeRemaining: "1:12",
    });
  });

  test("no estimate yet", () => {
    const raw = `Now drawing from 'Battery Power'
 -InternalBattery-0 (id=1)\t80%; discharging; (no estimate) present: true`;
    expect(parseBattery(raw)?.timeRemaining).toBeNull();
  });

  test("0:00 remaining is treated as unknown", () => {
    const raw = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining present: true`;
    expect(parseBattery(raw)).toEqual({
      percent: 100,
      state: "charged",
      onAC: true,
      timeRemaining: null,
    });
  });

  test("plugged in but not charging", () => {
    const raw = `Now drawing from 'AC Power'
 -InternalBattery-0 (id=1)\t80%; AC attached; not charging present: true`;
    expect(parseBattery(raw)).toMatchObject({ percent: 80, state: "AC attached", onAC: true });
  });

  test("desktop Mac with no battery", () => {
    expect(parseBattery("Now drawing from 'AC Power'\n")).toBeNull();
  });
});

describe("parseLsof", () => {
  const raw = `COMMAND     PID        USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node      12345 aungheinmin   23u  IPv4 0x1234567890abcdef      0t0  TCP 127.0.0.1:3000 (LISTEN)
bun       23456 aungheinmin   12u  IPv6 0x2234567890abcdef      0t0  TCP *:8787 (LISTEN)
rapportd    501 aungheinmin    8u  IPv6 0x3234567890abcdef      0t0  TCP [::1]:49152 (LISTEN)
broken line
`;

  test("parses listening rows and skips the header and junk", () => {
    expect(parseLsof(raw)).toEqual([
      { command: "node", pid: 12345, user: "aungheinmin", port: 3000, address: "127.0.0.1:3000" },
      { command: "bun", pid: 23456, user: "aungheinmin", port: 8787, address: "*:8787" },
      { command: "rapportd", pid: 501, user: "aungheinmin", port: 49152, address: "[::1]:49152" },
    ]);
  });

  test("empty output gives no rows", () => {
    expect(parseLsof("")).toEqual([]);
  });
});

describe("isLoopbackAddress", () => {
  test.each([
    ["127.0.0.1:3000", true],
    ["[::1]:3000", true],
    ["*:8787", true],
    ["0.0.0.0:5173", true],
    ["[::]:5173", true],
    ["192.168.31.182:8787", false],
    ["[fe80::1]:3000", false],
  ])("%s → %p", (addr, expected) => {
    expect(isLoopbackAddress(addr)).toBe(expected);
  });
});

describe("parseBrightness", () => {
  test.each([
    ["0.4851813018321991\n", 49],
    ["1", 100],
    ["0", 0],
  ])("%p → %p%", (raw, expected) => {
    expect(parseBrightness(raw)).toBe(expected);
  });

  test.each([["none"], [""], ["1.5"], ["-0.1"], ["NaN"]])(
    "%p means no software brightness",
    (raw) => {
      expect(parseBrightness(raw)).toBeNull();
    },
  );
});
