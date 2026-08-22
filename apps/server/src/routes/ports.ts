import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { Elysia, t } from "elysia";
import { runOrEmpty } from "../util/shell";
import { deviceAuth } from "../auth";

const HOME = homedir();

type ListenPort = {
  pid: number;
  command: string;
  port: number;
  user: string;
  address: string;
  isLoopback: boolean;
  cwd: string | null;
  project: string | null;
  projectRoot: string | null;
};

type RawRow = { pid: number; command: string; port: number; user: string; address: string };

const PROJECT_MARKERS = [
  ".git",
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "deno.json",
  "Gemfile",
];

// Reachable via localhost: explicit loopback, wildcard, or 0.0.0.0
function isLoopbackAddress(addr: string): boolean {
  if (addr.startsWith("127.")) return true;
  if (addr.startsWith("[::1]") || addr === "::1") return true;
  if (addr.startsWith("*:")) return true;
  if (addr.startsWith("0.0.0.0:")) return true;
  if (addr.startsWith("[::]")) return true;
  return false;
}

function parseLsof(raw: string): RawRow[] {
  const out: RawRow[] = [];
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
      address: addr,
    });
  }
  return out;
}

type CwdInfo = { cwd: string | null; projectRoot: string | null; project: string | null };
const cwdCache = new Map<number, { info: CwdInfo; expires: number }>();
const CWD_TTL_MS = 3000;

async function resolveCwd(pid: number): Promise<string | null> {
  const raw = await runOrEmpty("lsof", ["-p", String(pid), "-a", "-d", "cwd", "-Fn"]);
  for (const line of raw.split("\n")) {
    if (line.startsWith("n")) return line.slice(1);
  }
  return null;
}

function findProjectRoot(startDir: string): string | null {
  // Only detect projects under $HOME, and never treat $HOME itself as one —
  // otherwise every process cwd'd at $HOME (Steam, language servers) matches
  // via ~/.git or ~/package.json.
  if (startDir !== HOME && !startDir.startsWith(`${HOME}/`)) return null;
  let dir = startDir;
  while (dir && dir !== "/" && dir !== HOME) {
    for (const marker of PROJECT_MARKERS) {
      if (existsSync(`${dir}/${marker}`)) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function cwdInfoFor(pid: number): Promise<CwdInfo> {
  const now = Date.now();
  const hit = cwdCache.get(pid);
  if (hit && hit.expires > now) return hit.info;

  const cwd = await resolveCwd(pid);
  const projectRoot = cwd ? findProjectRoot(cwd) : null;
  const project = projectRoot ? basename(projectRoot) : null;
  const info: CwdInfo = { cwd, projectRoot, project };
  cwdCache.set(pid, { info, expires: now + CWD_TTL_MS });
  return info;
}

async function enrich(rows: RawRow[]): Promise<ListenPort[]> {
  const uniquePids = [...new Set(rows.map((r) => r.pid))];
  const infos = new Map<number, CwdInfo>();
  await Promise.all(
    uniquePids.map(async (pid) => {
      infos.set(pid, await cwdInfoFor(pid));
    }),
  );
  return rows.map((r) => {
    const info = infos.get(r.pid) ?? { cwd: null, projectRoot: null, project: null };
    return {
      pid: r.pid,
      command: r.command,
      port: r.port,
      user: r.user,
      address: r.address,
      isLoopback: isLoopbackAddress(r.address),
      cwd: info.cwd,
      projectRoot: info.projectRoot,
      project: info.project,
    };
  });
}

const OWN_PID = process.pid;
const OWN_PGID = await (async () => {
  const out = await runOrEmpty("ps", ["-o", "pgid=", "-p", String(OWN_PID)]);
  const n = Number(out.trim());
  return Number.isFinite(n) && n > 0 ? n : OWN_PID;
})();

async function listeningPids(port: number): Promise<string[]> {
  return (await runOrEmpty("lsof", ["-ti", `:${port}`]))
    .trim()
    .split("\n")
    .filter(Boolean);
}

async function pgidOf(pid: string): Promise<number | null> {
  const out = await runOrEmpty("ps", ["-o", "pgid=", "-p", pid]);
  const n = Number(out.trim());
  return Number.isFinite(n) ? n : null;
}

type KillTarget = { pid: string; pgid: number | null };

async function targetsFor(pids: string[]): Promise<KillTarget[]> {
  return Promise.all(pids.map(async (pid) => ({ pid, pgid: await pgidOf(pid) })));
}

// Send a signal to each unique process group so children die with the parent.
// Refuses to touch our own pgid — falls back to killing the individual pid.
async function sendSignal(sig: "TERM" | "KILL", targets: KillTarget[]): Promise<void> {
  const groups = new Set<number>();
  const individual: string[] = [];
  for (const t of targets) {
    if (Number(t.pid) === OWN_PID) continue;
    if (t.pgid === OWN_PGID) {
      individual.push(t.pid);
      continue;
    }
    if (t.pgid && t.pgid > 1) groups.add(t.pgid);
    else individual.push(t.pid);
  }
  for (const g of groups) {
    await runOrEmpty("kill", [`-${sig}`, `-${g}`]);
  }
  for (const pid of individual) {
    await runOrEmpty("kill", [`-${sig}`, pid]);
  }
}

const GRACE_MS = 500;

export const portsRoutes = new Elysia({ prefix: "/ports" })
  .use(deviceAuth)
  .get("/", async () => {
    const raw = await runOrEmpty("lsof", ["-iTCP", "-sTCP:LISTEN", "-P", "-n"]);
    const enriched = await enrich(parseLsof(raw));
    const ports = enriched.filter((p) => p.projectRoot && p.isLoopback);
    return { ports };
  })
  .post(
    "/kill",
    async ({ body }) => {
      const pids = await listeningPids(body.port);
      if (pids.length === 0) return { ok: true, killed: 0, escalated: false };

      await sendSignal("TERM", await targetsFor(pids));
      await new Promise((r) => setTimeout(r, GRACE_MS));

      const remaining = await listeningPids(body.port);
      if (remaining.length === 0) {
        return { ok: true, killed: pids.length, escalated: false };
      }

      await sendSignal("KILL", await targetsFor(remaining));
      return { ok: true, killed: pids.length, escalated: true };
    },
    { body: t.Object({ port: t.Number() }) },
  );
