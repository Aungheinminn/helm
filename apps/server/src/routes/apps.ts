import { Elysia, t } from "elysia";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { run, runOrEmpty } from "../util/shell";
import { deviceAuth } from "../auth";
import { config } from "../config";

const APP_SEARCH_DIRS = [
  "/Applications",
  "/System/Applications",
  "/System/Applications/Utilities",
  join(homedir(), "Applications"),
];

function findAppBundle(launchName: string): string | null {
  for (const dir of APP_SEARCH_DIRS) {
    const p = join(dir, `${launchName}.app`);
    if (existsSync(p)) return p;
  }
  return null;
}

async function resolveIcns(appBundle: string): Promise<string | null> {
  const infoPlist = join(appBundle, "Contents", "Info.plist");
  const resources = join(appBundle, "Contents", "Resources");
  const iconKey = (
    await runOrEmpty("plutil", ["-extract", "CFBundleIconFile", "raw", "-o", "-", infoPlist])
  ).trim();
  const candidates: string[] = [];
  if (iconKey) {
    candidates.push(iconKey.endsWith(".icns") ? iconKey : `${iconKey}.icns`, iconKey);
  }
  candidates.push("AppIcon.icns", "app.icns", "Icon.icns");
  for (const c of candidates) {
    const p = join(resources, c);
    if (existsSync(p)) return p;
  }
  return null;
}

const iconCacheDir = join(config.dataDir, "icon-cache");
mkdirSync(iconCacheDir, { recursive: true });

export const appsRoutes = new Elysia({ prefix: "/apps" })
  .use(deviceAuth)
  .get("/", async () => {
    const raw = await runOrEmpty("osascript", [
      "-e",
      'tell application "System Events" to get name of (every process where background only is false)',
    ]);
    const running = raw
      .trim()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { running };
  })
  .post(
    "/open",
    async ({ body }) => {
      await run("open", ["-a", body.name]);
      return { ok: true };
    },
    { body: t.Object({ name: t.String() }) },
  )
  .post(
    "/quit",
    async ({ body }) => {
      await run("osascript", ["-e", `quit app "${body.name.replace(/"/g, '\\"')}"`]);
      return { ok: true };
    },
    { body: t.Object({ name: t.String() }) },
  )
  .get(
    "/icon",
    async ({ query, status }) => {
      const name = query.name;
      if (!/^[A-Za-z0-9 ._-]+$/.test(name)) {
        return status(400, { error: "invalid name" });
      }
      const cacheKey = `${name.replace(/[^A-Za-z0-9]/g, "_")}.png`;
      const cachePath = join(iconCacheDir, cacheKey);
      if (!existsSync(cachePath)) {
        const bundle = findAppBundle(name);
        if (!bundle) return status(404, { error: "app not installed" });
        const icns = await resolveIcns(bundle);
        if (!icns) return status(404, { error: "icon not found" });
        try {
          await run("sips", ["-s", "format", "png", icns, "--out", cachePath]);
        } catch {
          return status(404, { error: "icon conversion failed" });
        }
      }
      return Bun.file(cachePath);
    },
    { query: t.Object({ name: t.String() }) },
  );
