import { Elysia, t } from "elysia";
import { runOrEmpty, run } from "../util/shell";
import { deviceAuth } from "../auth";

type Session = { name: string; windows: number; attached: boolean };

function parseSessions(raw: string): Session[] {
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, windows, attached] = line.split("|");
      return {
        name,
        windows: Number(windows),
        attached: attached === "1",
      };
    });
}

export const tmuxRoutes = new Elysia({ prefix: "/tmux" })
  .use(deviceAuth)
  .get("/", async () => {
    const raw = await runOrEmpty("tmux", [
      "list-sessions",
      "-F",
      "#{session_name}|#{session_windows}|#{session_attached}",
    ]);
    return { sessions: parseSessions(raw) };
  })
  .post(
    "/detach",
    async ({ body }) => {
      await run("tmux", ["detach-client", "-s", body.name]);
      return { ok: true };
    },
    { body: t.Object({ name: t.String() }) },
  )
  .post(
    "/kill",
    async ({ body }) => {
      await run("tmux", ["kill-session", "-t", body.name]);
      return { ok: true };
    },
    { body: t.Object({ name: t.String() }) },
  )
  .post(
    "/new",
    async ({ body }) => {
      await run("tmux", ["new-session", "-d", "-s", body.name]);
      return { ok: true };
    },
    { body: t.Object({ name: t.String() }) },
  );
