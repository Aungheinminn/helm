import { Elysia, t } from "elysia";
import { run, runOrEmpty } from "../util/shell";
import { deviceAuth } from "../auth";
import { refresh, registerTopic } from "../live";
import {
  parseBattery,
  parseBrightness,
  parseVolume,
  type Battery,
  type Volume,
} from "../parse";
import { getSettings, updateSettings } from "../settings";

async function readVolume(): Promise<Volume> {
  return parseVolume(await runOrEmpty("osascript", ["-e", "get volume settings"]));
}

async function readBattery(): Promise<Battery | null> {
  return parseBattery(await runOrEmpty("pmset", ["-g", "batt"]));
}

// macOS has no brightness CLI. DisplayServices (private, but stable for years and
// what the brightness keys use) is reachable from JXA without any permission
// prompt. Only works for displays with software brightness, i.e. built-in ones.
const BRIGHTNESS_SCRIPT = `
function run(argv) {
  ObjC.import("CoreGraphics");
  $.NSBundle.bundleWithPath("/System/Library/PrivateFrameworks/DisplayServices.framework").load;
  ObjC.bindFunction("DisplayServicesGetBrightness", ["int", ["unsigned int", "void *"]]);
  ObjC.bindFunction("DisplayServicesSetBrightness", ["int", ["unsigned int", "float"]]);
  const display = $.CGMainDisplayID();
  if (argv.length) $.DisplayServicesSetBrightness(display, Number(argv[0]));
  const ref = Ref("float");
  return $.DisplayServicesGetBrightness(display, ref) === 0 ? String(ref[0]) : "none";
}`;

async function readBrightness(): Promise<number | null> {
  return parseBrightness(await runOrEmpty("osascript", ["-l", "JavaScript", "-e", BRIGHTNESS_SCRIPT]));
}

async function setBrightness(level: number): Promise<number | null> {
  const raw = await run("osascript", [
    "-l",
    "JavaScript",
    "-e",
    BRIGHTNESS_SCRIPT,
    String(level / 100),
  ]);
  return parseBrightness(raw);
}

const CLIPBOARD_READ_LIMIT = 100_000;

async function readClipboard(): Promise<{ text: string; truncated: boolean }> {
  const proc = Bun.spawn(["pbpaste"], {
    stdout: "pipe",
    env: { ...process.env, LANG: "en_US.UTF-8" },
  });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return {
    text: text.slice(0, CLIPBOARD_READ_LIMIT),
    truncated: text.length > CLIPBOARD_READ_LIMIT,
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

async function readSystem() {
  const [volume, battery, brightness] = await Promise.all([
    readVolume(),
    readBattery(),
    readBrightness(),
  ]);
  return {
    volume,
    battery,
    brightness,
    keepAwake: isKeepingAwake(),
    keepAwakeAtLaunch: getSettings().keepAwakeAtLaunch,
  };
}

// Called once when the real server starts, not on import, so tests (and the
// Linux CI runner, which has no caffeinate) never spawn it.
export function applyLaunchSettings(): void {
  if (getSettings().keepAwakeAtLaunch) setKeepAwake(true);
}

registerTopic("system", 5000, readSystem);

export const systemRoutes = new Elysia({ prefix: "/system" })
  .use(deviceAuth)
  .get("/", readSystem)
  .post(
    "/volume",
    async ({ body }) => {
      if (body.level !== undefined) {
        await run("osascript", ["-e", `set volume output volume ${Math.round(body.level)}`]);
      }
      if (body.muted !== undefined) {
        await run("osascript", ["-e", `set volume output muted ${body.muted}`]);
      }
      refresh("system");
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
    "/brightness",
    async ({ body, status }) => {
      const brightness = await setBrightness(body.level);
      refresh("system");
      if (brightness === null) {
        return status(409, { error: "This display's brightness can't be changed from software." });
      }
      return { brightness };
    },
    { body: t.Object({ level: t.Number({ minimum: 0, maximum: 100 }) }) },
  )
  .post(
    "/keep-awake",
    async ({ body }) => {
      if (body.atLaunch !== undefined) {
        await updateSettings({ keepAwakeAtLaunch: body.atLaunch });
      }
      if (body.on !== undefined) setKeepAwake(body.on);
      refresh("system");
      return { keepAwake: isKeepingAwake(), keepAwakeAtLaunch: getSettings().keepAwakeAtLaunch };
    },
    { body: t.Object({ on: t.Optional(t.Boolean()), atLaunch: t.Optional(t.Boolean()) }) },
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
  .get("/clipboard", readClipboard)
  .post(
    "/clipboard",
    async ({ body }) => {
      await setClipboard(body.text);
      return { ok: true };
    },
    { body: t.Object({ text: t.String({ minLength: 1, maxLength: 100_000 }) }) },
  );
