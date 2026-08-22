import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname } from "node:path";
import { Elysia, t } from "elysia";
import { runOrEmpty, run } from "../util/shell";
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
