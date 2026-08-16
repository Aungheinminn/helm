import { useEffect, useState } from "react";
import { clientFor } from "../api";
import type { PairedHost } from "../store";

export function AppsScreen({ host }: { host: PairedHost }) {
  const [running, setRunning] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openName, setOpenName] = useState("");
  const api = clientFor(host);

  async function load() {
    try {
      const { data, error } = await api.apps.get();
      if (error) throw new Error(String(error.value ?? error.status));
      setRunning(data.running);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [host.id]);

  async function openApp(name: string) {
    await api.apps.open.post({ name });
    load();
  }

  async function quitApp(name: string) {
    await api.apps.quit.post({ name });
    load();
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="name-input"
          style={{ marginTop: 0 }}
          placeholder="Open app by name (e.g. Safari)"
          value={openName}
          onChange={(e) => setOpenName(e.target.value)}
        />
        <button
          className="action primary"
          onClick={() => {
            if (openName.trim()) openApp(openName.trim());
            setOpenName("");
          }}
        >
          Open
        </button>
      </div>
      {running.length === 0 && !error && <div className="empty">No apps running</div>}
      {running.map((name) => (
        <div key={name} className="row">
          <div className="title">{name}</div>
          <button className="action danger" onClick={() => quitApp(name)}>
            Quit
          </button>
        </div>
      ))}
    </div>
  );
}
