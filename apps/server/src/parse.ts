export type Volume = { level: number | null; muted: boolean };

export type Battery = {
  percent: number;
  state: string;
  onAC: boolean;
  timeRemaining: string | null;
};

export type LsofRow = { pid: number; command: string; port: number; user: string; address: string };

// Parses `osascript -e "get volume settings"`.
export function parseVolume(raw: string): Volume {
  const level = raw.match(/output volume:(\d+)/);
  // Outputs without software volume (HDMI, some USB DACs) report "missing value".
  return {
    level: level ? Number(level[1]) : null,
    muted: /output muted:true/.test(raw),
  };
}

// Parses `pmset -g batt`. Desktop Macs print only the power source line.
export function parseBattery(raw: string): Battery | null {
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

// Parses `lsof -iTCP -sTCP:LISTEN -P -n`.
export function parseLsof(raw: string): LsofRow[] {
  const out: LsofRow[] = [];
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

// Reachable via localhost: explicit loopback, wildcard, or 0.0.0.0
export function isLoopbackAddress(addr: string): boolean {
  if (addr.startsWith("127.")) return true;
  if (addr.startsWith("[::1]") || addr === "::1") return true;
  if (addr.startsWith("*:")) return true;
  if (addr.startsWith("0.0.0.0:")) return true;
  if (addr.startsWith("[::]")) return true;
  return false;
}
