import { treaty } from "@elysiajs/eden";
import type { App } from "server/src/index";
import type { PairedHost } from "./store";

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(fn: (() => void) | null): void {
  onUnauthorized = fn;
}
export function reportStatus(status: number): void {
  if (status === 401) onUnauthorized?.();
}

export function clientFor(host: PairedHost) {
  return treaty<App>(`http://${host.host}:${host.port}`, {
    headers: { Authorization: `Bearer ${host.token}` },
    onResponse: (res) => {
      reportStatus(res.status);
    },
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
