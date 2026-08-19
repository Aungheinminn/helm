import { useEffect, useState } from "react";
import { clientFor } from "../api";
import type { PairedHost } from "../store";
import { CURATED_APPS, type CuratedApp } from "../apps-registry";

export function AppsScreen({ host }: { host: PairedHost }) {
  const [running, setRunning] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    setIcons({});
    const created: string[] = [];
    let cancelled = false;
    (async () => {
      for (const app of CURATED_APPS) {
        if (cancelled) break;
        try {
          const res = await fetch(
            `${window.location.protocol}//${host.host}:${host.port}/apps/icon?name=${encodeURIComponent(app.launchName)}`,
            { headers: { Authorization: `Bearer ${host.token}` } },
          );
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) break;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setIcons((prev) => ({ ...prev, [app.key]: url }));
        } catch {
          /* letter badge fallback */
        }
      }
    })();
    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [host.id, host.host, host.port, host.token]);

  function isRunning(app: CuratedApp): boolean {
    return running.some((r) => r.toLowerCase() === app.processName.toLowerCase());
  }

  async function toggle(app: CuratedApp) {
    if (pending[app.key]) return;
    setPending((p) => ({ ...p, [app.key]: true }));
    try {
      if (isRunning(app)) {
        await api.apps.quit.post({ name: app.processName });
      } else {
        await api.apps.open.post({ name: app.launchName });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending((p) => ({ ...p, [app.key]: false }));
    }
  }

  async function quitOther(name: string) {
    await api.apps.quit.post({ name });
    load();
  }

  const otherRunning = running.filter(
    (r) => !CURATED_APPS.some((a) => a.processName.toLowerCase() === r.toLowerCase()),
  );

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div className="app-grid">
        {CURATED_APPS.map((app) => {
          const on = isRunning(app);
          const icon = icons[app.key];
          return (
            <button
              key={app.key}
              className={`app-tile${on ? " running" : ""}${pending[app.key] ? " pending" : ""}`}
              onClick={() => toggle(app)}
              disabled={pending[app.key]}
            >
              <div className="app-tile-icon">
                {icon ? (
                  <img src={icon} alt="" draggable={false} />
                ) : (
                  <span className="app-tile-fallback">{app.displayName[0]}</span>
                )}
                {on && <span className="app-tile-dot" />}
              </div>
              <div className="app-tile-name">{app.displayName}</div>
            </button>
          );
        })}
      </div>
      {otherRunning.length > 0 && (
        <>
          <div className="section-header">Other running</div>
          {otherRunning.map((name) => (
            <div key={name} className="row">
              <div className="title">{name}</div>
              <button className="action danger" onClick={() => quitOther(name)}>
                Quit
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
