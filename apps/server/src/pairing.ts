import { randomBytes } from "node:crypto";

const CODE_TTL_MS = 5 * 60 * 1000;

let current: { code: string; expiresAt: number } | null = null;

export function issuePairingCode(): { code: string; expiresAt: number } {
  const code = randomBytes(16).toString("base64url");
  current = { code, expiresAt: Date.now() + CODE_TTL_MS };
  return current;
}

export function getPairingCode(): { code: string; expiresAt: number } {
  if (!current || current.expiresAt < Date.now()) return issuePairingCode();
  return current;
}

export function consumePairingCode(code: string): boolean {
  if (!current) return false;
  if (current.code !== code) return false;
  if (current.expiresAt < Date.now()) return false;
  current = null;
  return true;
}
