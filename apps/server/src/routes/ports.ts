import { Elysia, t } from "elysia";
import { runOrEmpty, run } from "../util/shell";
import { deviceAuth } from "../auth";

type ListenPort = { pid: number; command: string; port: number; user: string };

function parseLsof(raw: string): ListenPort[] {
  const out: ListenPort[] = [];
  const lines = raw.trim().split("\n").slice(1);
  for (const line of lines) {
    const cols = line.split(/\s+/);
    if (cols.length < 9) continue;
    const [command, pidStr, user, , , , , , addr] = cols;
    const match = addr.match(/:(\d+)$/);
    if (!match) continue;
    out.push({
      pid: Number(pidStr),
      command,
      user,
      port: Number(match[1]),
    });
  }
  return out;
}

export const portsRoutes = new Elysia({ prefix: "/ports" })
  .use(deviceAuth)
  .get("/", async () => {
    const raw = await runOrEmpty("lsof", ["-iTCP", "-sTCP:LISTEN", "-P", "-n"]);
    return { ports: parseLsof(raw) };
  })
  .post(
    "/kill",
    async ({ body }) => {
      const pids = (await runOrEmpty("lsof", ["-ti", `:${body.port}`]))
        .trim()
        .split("\n")
        .filter(Boolean);
      if (pids.length === 0) return { ok: true, killed: 0 };
      await run("kill", ["-9", ...pids]);
      return { ok: true, killed: pids.length };
    },
    { body: t.Object({ port: t.Number() }) },
  );
