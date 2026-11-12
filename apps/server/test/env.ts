// Preloaded via bunfig.toml (and imported first by server tests as a fallback):
// config.ts reads these at import time, and tests must never touch ~/.helm.
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const TEST_DATA_DIR = mkdtempSync(join(tmpdir(), "helm-test-"));
export const TEST_ADMIN_TOKEN = "test-admin-token";

process.env.HELM_DATA_DIR = TEST_DATA_DIR;
process.env.HELM_ADMIN_TOKEN = TEST_ADMIN_TOKEN;
process.env.HELM_STATIC_DIR = "";

// Bun's test runner doesn't fire process "exit"; a preloaded afterAll is global.
afterAll(() => rmSync(TEST_DATA_DIR, { recursive: true, force: true }));
