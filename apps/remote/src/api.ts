import { treaty } from "@elysiajs/eden";
import type { App } from "server/src/index";
import type { PairedHost } from "./store";

export function clientFor(host: PairedHost) {
  return treaty<App>(`${host.host}:${host.port}`, {
    headers: { Authorization: `Bearer ${host.token}` },
  });
}

export async function pairWith(
  baseUrl: string,
  code: string,
  deviceName: string,
): Promise<{ token: string; deviceId: string; host: string }> {
  const res = await fetch(`${baseUrl}/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name: deviceName }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `pair failed: ${res.status}`);
  }
  return res.json();
}
