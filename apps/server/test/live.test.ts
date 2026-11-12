import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { refresh, registerTopic, subscribe } from "../src/live";

const tick = (ms = 0) => Bun.sleep(ms);
// Long enough that the timer never fires during a test; refresh() drives runs.
const NEVER = 60_000;

let calls: number;
let value: unknown;
let delayMs: number;
let unsubs: (() => void)[];

const sub = (got: string[]) => {
  const off = subscribe("apps", (_, json) => got.push(json));
  unsubs.push(off);
  return off;
};

beforeEach(() => {
  calls = 0;
  value = { v: 1 };
  delayMs = 0;
  unsubs = [];
  registerTopic("apps", NEVER, async () => {
    calls++;
    if (delayMs) await Bun.sleep(delayMs);
    if (value instanceof Error) throw value;
    return value;
  });
});

afterEach(() => unsubs.forEach((u) => u()));

describe("live hub", () => {
  test("never collects without subscribers", async () => {
    refresh("apps");
    await tick(20);
    expect(calls).toBe(0);
  });

  test("first subscriber triggers an immediate collect", async () => {
    const got: string[] = [];
    sub(got);
    await tick();
    expect(calls).toBe(1);
    expect(got).toEqual(['{"v":1}']);
  });

  test("a second subscriber shares the run instead of starting another", async () => {
    const a: string[] = [];
    const b: string[] = [];
    sub(a);
    sub(b);
    await tick();
    expect(calls).toBe(1);
    expect(a).toEqual(['{"v":1}']);
    expect(b).toEqual(['{"v":1}']);
  });

  test("a late subscriber gets the cached value without a new collect", async () => {
    sub([]);
    await tick();
    const late: string[] = [];
    sub(late);
    expect(late).toEqual(['{"v":1}']);
    expect(calls).toBe(1);
  });

  test("unchanged results are not re-sent", async () => {
    const got: string[] = [];
    sub(got);
    await tick();
    refresh("apps");
    await tick();
    expect(calls).toBe(2);
    expect(got.length).toBe(1);
  });

  test("changed results are pushed to every subscriber", async () => {
    const a: string[] = [];
    const b: string[] = [];
    sub(a);
    sub(b);
    await tick();
    value = { v: 2 };
    refresh("apps");
    await tick();
    expect(a.at(-1)).toBe('{"v":2}');
    expect(b.at(-1)).toBe('{"v":2}');
  });

  test("stops collecting once the last subscriber leaves", async () => {
    const off = sub([]);
    await tick();
    off();
    refresh("apps");
    await tick(20);
    expect(calls).toBe(1);
  });

  test("after an idle gap a new subscriber gets a fresh reading, not the stale cache", async () => {
    const off = sub([]);
    await tick();
    off();
    value = { v: 3 };
    const got: string[] = [];
    sub(got);
    await tick();
    expect(got).toEqual(['{"v":3}']);
  });

  test("overlapping refreshes don't stack up slow collects", async () => {
    delayMs = 30;
    sub([]);
    refresh("apps");
    refresh("apps");
    refresh("apps");
    await tick(120);
    // One in flight from subscribe, plus a single catch-up run.
    expect(calls).toBe(2);
  });

  test("a failing collect is logged and doesn't break later runs", async () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    const got: string[] = [];
    value = new Error("lsof blew up");
    sub(got);
    await tick();
    expect(got).toEqual([]);
    expect(err).toHaveBeenCalled();
    value = { v: 4 };
    refresh("apps");
    await tick();
    expect(got).toEqual(['{"v":4}']);
    err.mockRestore();
  });

  test("the interval timer drives collects while subscribed", async () => {
    registerTopic("apps", 25, async () => {
      calls++;
      return { n: calls };
    });
    sub([]);
    await tick(110);
    expect(calls).toBeGreaterThanOrEqual(3);
  });

  test("unknown topics are rejected", () => {
    expect(() => subscribe("nope" as "apps", () => {})).toThrow();
  });
});
