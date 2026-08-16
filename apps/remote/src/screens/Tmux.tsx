import { useEffect, useState } from "react";
import { clientFor } from "../api";
import type { PairedHost } from "../store";

type Session = { name: string; windows: number; attached: boolean };

export function TmuxScreen({ host }: { host: PairedHost }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const api = clientFor(host);

  async function load() {
    try {
      const { data, error } = await api.tmux.get();
      if (error) throw new Error(String(error.value ?? error.status));
      setSessions(data.sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [host.id]);

  async function detach(name: string) {
    await api.tmux.detach.post({ name });
    load();
  }

  async function kill(name: string) {
    await api.tmux.kill.post({ name });
    load();
  }

  async function create() {
    if (!newName.trim()) return;
    await api.tmux.new.post({ name: newName.trim() });
    setNewName("");
    load();
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          className="name-input"
          style={{ marginTop: 0 }}
          placeholder="New session name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="action primary" onClick={create}>
          New
        </button>
      </div>
      {sessions.length === 0 && !error && <div className="empty">No tmux sessions</div>}
      {sessions.map((s) => (
        <div key={s.name} className="row">
          <div>
            <div className="title">{s.name}</div>
            <div className="sub">
              {s.windows} window{s.windows === 1 ? "" : "s"}
              {s.attached ? " · attached" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {s.attached && (
              <button className="action" onClick={() => detach(s.name)}>
                Detach
              </button>
            )}
            <button className="action danger" onClick={() => kill(s.name)}>
              Kill
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
