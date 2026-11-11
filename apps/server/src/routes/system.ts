import { Elysia, t } from "elysia";
import { run, runOrEmpty } from "../util/shell";
import { deviceAuth } from "../auth";

type Volume = { level: number | null; muted: boolean };

type Battery = {
  percent: number;
  state: string;
  onAC: boolean;
  timeRemaining: string | null;
};

async function readVolume(): Promise<Volume> {
  const raw = await runOrEmpty("osascript", ["-e", "get volume settings"]);
  const level = raw.match(/output volume:(\d+)/);
  // Outputs without software volume (HDMI, some USB DACs) report "missing value".
  return {
    level: level ? Number(level[1]) : null,
    muted: /output muted:true/.test(raw),
  };
}

async function readBattery(): Promise<Battery | null> {
  const raw = await runOrEmpty("pmset", ["-g", "batt"]);
  const m = raw.match(/(\d+)%;\s*([^;]+);\s*(\S+)?/);
  if (!m) return null;
  const time = m[3] && /^\d+:\d+$/.test(m[3]) && m[3] !== "0:00" ? m[3] : null;
  return {
    percent: Number(m[1]),
    state: m[2].trim(),
    onAC: raw.includes("'AC Power'"),
    timeRemaining: time,
  };
}

let caffeinate: ReturnType<typeof Bun.spawn> | null = null;

function isKeepingAwake(): boolean {
  return caffeinate !== null && caffeinate.exitCode === null && caffeinate.signalCode === null;
}

function setKeepAwake(on: boolean): void {
  if (on && !isKeepingAwake()) {
    // -w ties caffeinate to this server's pid, so it can't outlive a crashed or
    // force-killed server and keep the Mac awake forever.
    caffeinate = Bun.spawn(["caffeinate", "-i", "-w", String(process.pid)], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } else if (!on && caffeinate) {
    caffeinate.kill();
    caffeinate = null;
  }
}

async function setClipboard(text: string): Promise<void> {
  const proc = Bun.spawn(["pbcopy"], {
    stdin: new TextEncoder().encode(text),
    stderr: "pipe",
    // pbcopy picks its text encoding from the locale; the Electron-spawned server
    // often has no LANG, which turns non-ASCII text into garbage.
    env: { ...process.env, LANG: "en_US.UTF-8" },
  });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`pbcopy exited ${code}: ${stderr.trim()}`);
  }
}

export const systemRoutes = new Elysia({ prefix: "/system" })
  .use(deviceAuth)
  .get("/", async () => {
    const [volume, battery] = await Promise.all([readVolume(), readBattery()]);
    return { volume, battery, keepAwake: isKeepingAwake() };
  })
  .post(
    "/volume",
    async ({ body }) => {
      if (body.level !== undefined) {
        await run("osascript", ["-e", `set volume output volume ${Math.round(body.level)}`]);
      }
      if (body.muted !== undefined) {
        await run("osascript", ["-e", `set volume output muted ${body.muted}`]);
      }
      return { volume: await readVolume() };
    },
    {
      body: t.Object({
        level: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
        muted: t.Optional(t.Boolean()),
      }),
    },
  )
  .post(
    "/keep-awake",
    ({ body }) => {
      setKeepAwake(body.on);
      return { keepAwake: isKeepingAwake() };
    },
    { body: t.Object({ on: t.Boolean() }) },
  )
  .post("/lock", async ({ status }) => {
    try {
      await run("osascript", [
        "-e",
        'tell application "System Events" to keystroke "q" using {control down, command down}',
      ]);
      return { ok: true };
    } catch {
      return status(500, {
        error:
          "Couldn't lock. Allow Helm in System Settings → Privacy & Security → Accessibility.",
      });
    }
  })
  .post("/display-sleep", async () => {
    await run("pmset", ["displaysleepnow"]);
    return { ok: true };
  })
  .post(
    "/clipboard",
    async ({ body }) => {
      await setClipboard(body.text);
      return { ok: true };
    },
    { body: t.Object({ text: t.String({ minLength: 1, maxLength: 100_000 }) }) },
  );
