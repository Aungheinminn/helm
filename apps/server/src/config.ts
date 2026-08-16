import { homedir } from "node:os";
import { join } from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.HELM_PORT ?? 8787),
  adminToken: required("HELM_ADMIN_TOKEN"),
  dataDir: process.env.HELM_DATA_DIR ?? join(homedir(), ".helm"),
  staticDir: process.env.HELM_STATIC_DIR ?? null,
};

export const devicesFile = () => join(config.dataDir, "devices.json");
