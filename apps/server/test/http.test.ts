import { TEST_ADMIN_TOKEN } from "./env";
import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";

const app = createApp();
const BASE = "http://helm.test";

function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");
  return app.handle(
    new Request(`${BASE}${path}`, {
      ...init,
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );
}

async function adminState() {
  const res = await call("/_admin/state", { token: TEST_ADMIN_TOKEN });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    pairing: { code: string };
    devices: Record<string, unknown>[];
  };
}

async function pair(name = "test-phone") {
  const { pairing } = await adminState();
  const res = await call("/pair", { method: "POST", json: { code: pairing.code, name } });
  expect(res.status).toBe(200);
  return (await res.json()) as { token: string; deviceId: string; host: string };
}

// /events with an unknown topic is a cheap way to prove auth passed: it answers
// 400 after the auth check without running any real system commands.
const deviceProbe = (token?: string) => call("/events?topics=probe", { token });

describe("health", () => {
  test("is public", async () => {
    expect((await call("/health")).status).toBe(200);
  });
});

describe("admin API", () => {
  test("rejects missing and wrong admin tokens", async () => {
    expect((await call("/_admin/state")).status).toBe(401);
    expect((await call("/_admin/state", { token: "wrong" })).status).toBe(401);
  });

  test("never exposes device tokens", async () => {
    await pair("leak-check");
    const { devices } = await adminState();
    expect(devices.length).toBeGreaterThan(0);
    for (const d of devices) expect(d).not.toHaveProperty("token");
  });

  test("a device token can't be used as the admin token", async () => {
    const { token } = await pair();
    expect((await call("/_admin/state", { token })).status).toBe(401);
  });
});

describe("pairing", () => {
  test("a wrong code is rejected", async () => {
    const res = await call("/pair", { method: "POST", json: { code: "guess", name: "x" } });
    expect(res.status).toBe(401);
  });

  test("a code can only be used once", async () => {
    const { pairing } = await adminState();
    const first = await call("/pair", { method: "POST", json: { code: pairing.code, name: "a" } });
    const second = await call("/pair", { method: "POST", json: { code: pairing.code, name: "b" } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(401);
  });

  test("malformed bodies are rejected", async () => {
    const res = await call("/pair", { method: "POST", json: { code: 123 } });
    expect(res.status).toBe(422);
  });

  test("rotating the code invalidates the old one", async () => {
    const { pairing } = await adminState();
    const rotated = await call("/_admin/pairing/rotate", {
      method: "POST",
      token: TEST_ADMIN_TOKEN,
    });
    expect(rotated.status).toBe(200);
    const res = await call("/pair", { method: "POST", json: { code: pairing.code, name: "x" } });
    expect(res.status).toBe(401);
  });
});

describe("device auth", () => {
  test("device routes reject missing and unknown tokens", async () => {
    expect((await deviceProbe()).status).toBe(401);
    expect((await deviceProbe("not-a-real-token")).status).toBe(401);
    expect((await call("/ports/kill", { method: "POST", json: { port: 1 } })).status).toBe(401);
    expect(
      (await call("/system/clipboard", { method: "POST", json: { text: "hi" } })).status,
    ).toBe(401);
  });

  test("a paired device's token is accepted", async () => {
    const { token } = await pair();
    expect((await deviceProbe(token)).status).toBe(400);
  });

  test("revoking a device locks it out", async () => {
    const { token, deviceId } = await pair("revoke-me");
    const del = await call(`/_admin/devices/${deviceId}`, {
      method: "DELETE",
      token: TEST_ADMIN_TOKEN,
    });
    expect(del.status).toBe(200);
    expect((await deviceProbe(token)).status).toBe(401);
  });
});

describe("input validation", () => {
  test("volume outside 0–100 is rejected", async () => {
    const { token } = await pair();
    const res = await call("/system/volume", { method: "POST", token, json: { level: 150 } });
    expect(res.status).toBe(422);
  });

  test("empty clipboard text is rejected", async () => {
    const { token } = await pair();
    const res = await call("/system/clipboard", { method: "POST", token, json: { text: "" } });
    expect(res.status).toBe(422);
  });

  test("app icon names are restricted to safe characters", async () => {
    const { token } = await pair();
    const res = await call(`/apps/icon?name=${encodeURIComponent("../../etc/passwd")}`, { token });
    expect(res.status).toBe(400);
  });
});
