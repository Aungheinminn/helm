import { useEffect, useState } from "react";
import { clientFor } from "../api";
import type { PairedHost } from "../store";

type Port = { pid: number; command: string; port: number; user: string };

export function PortsScreen({ host }: { host: PairedHost }) {
  const [ports, setPorts] = useState<Port[]>([]);
  const [error, setError] = useState<string | null>(null);
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

  async function killPort(port: number) {
    await api.ports.kill.post({ port });
    load();
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      {ports.length === 0 && !error && <div className="empty">Nothing listening</div>}
      {ports.map((p) => (
        <div key={`${p.pid}-${p.port}`} className="row">
          <div>
            <div className="title">:{p.port}</div>
            <div className="sub">
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
