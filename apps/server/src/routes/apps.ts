import { Elysia, t } from "elysia";
import { run, runOrEmpty } from "../util/shell";
import { deviceAuth } from "../auth";

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
  );
