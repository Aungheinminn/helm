import { useEffect, useMemo, useState } from "react";
import { clientFor } from "../api";
import type { PairedHost } from "../store";

type Port = {
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

const ROOT_KEY = (id: string) => `helm:ports:root:${id}`;

export function PortsScreen({ host }: { host: PairedHost }) {
  const [ports, setPorts] = useState<Port[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoot, setSelectedRoot] = useState<string | null>(() =>
    localStorage.getItem(ROOT_KEY(host.id)),
  );
  const api = clientFor(host);

  async function load() {
    try {
      const { data, error } = await api.ports.get();
      if (error) throw new Error(String(error.value ?? error.status));
      setPorts(data.ports);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [host.id]);

  useEffect(() => {
    if (selectedRoot) localStorage.setItem(ROOT_KEY(host.id), selectedRoot);
    else localStorage.removeItem(ROOT_KEY(host.id));
  }, [host.id, selectedRoot]);

  async function killPort(port: number) {
    await api.ports.kill.post({ port });
    load();
  }

  const roots = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const p of ports) {
      if (!p.projectRoot || !p.project) continue;
      const existing = counts.get(p.projectRoot);
      if (existing) existing.count += 1;
      else counts.set(p.projectRoot, { name: p.project, count: 1 });
    }
    return [...counts.entries()]
      .map(([path, v]) => ({ path, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ports]);

  const visible = useMemo(
    () => (selectedRoot ? ports.filter((p) => p.projectRoot === selectedRoot) : ports),
    [ports, selectedRoot],
  );

  useEffect(() => {
    if (selectedRoot && !roots.some((r) => r.path === selectedRoot)) {
      setSelectedRoot(null);
    }
  }, [roots, selectedRoot]);

  return (
    <div>
      {roots.length > 1 && (
        <div className="filters">
          {roots.map((r) => (
            <button
              key={r.path}
              className={selectedRoot === r.path ? "active" : ""}
              onClick={() => setSelectedRoot(selectedRoot === r.path ? null : r.path)}
            >
              {r.name} <span className="filter-count">{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {visible.length === 0 && !error && (
        <div className="empty">No project ports listening</div>
      )}
      {visible.map((p) => (
        <div key={`${p.pid}-${p.port}-${p.address}`} className="row">
          <div>
            <div className="title">:{p.port}</div>
            <div className="sub">
              {p.project ? `${p.project} · ` : ""}
              {p.command} · pid {p.pid} · {p.user}
            </div>
          </div>
          <button className="action danger" onClick={() => killPort(p.port)}>
            Kill
          </button>
        </div>
      ))}
    </div>
  );
}
