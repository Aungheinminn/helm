import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const dataDir = process.env.HELM_DATA_DIR ?? join(homedir(), ".helm");

function adminToken(): string {
  const envToken = process.env.HELM_ADMIN_TOKEN;
  if (envToken) return envToken;

  const tokenFile = join(dataDir, "admin-token");
  try {
    const existing = readFileSync(tokenFile, "utf8").trim();
    if (existing) return existing;
  } catch {
    /* fall through to create */
  }

  mkdirSync(dataDir, { recursive: true });
  const generated = randomBytes(32).toString("base64url");
  writeFileSync(tokenFile, generated, { mode: 0o600 });
  try { chmodSync(tokenFile, 0o600); } catch { /* best effort */ }
  return generated;
}

export const config = {
  port: Number(process.env.HELM_PORT ?? 8787),
  adminToken: adminToken(),
  dataDir,
  staticDir: process.env.HELM_STATIC_DIR ?? null,
};

export const devicesFile = () => join(config.dataDir, "devices.json");
