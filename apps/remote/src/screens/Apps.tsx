import { useEffect, useState } from "react";
import { clientFor, reportStatus } from "../api";
import { useLive } from "../live";
import type { PairedHost } from "../store";
import { CURATED_APPS, type CuratedApp } from "../apps-registry";

export function AppsScreen({ host }: { host: PairedHost }) {
  const live = useLive<{ running: string[] }>(host, "apps");
  const running = live.data?.running ?? [];
  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? live.error;
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const api = clientFor(host);

  useEffect(() => {
    setIcons({});
    const created: string[] = [];
    let cancelled = false;
    (async () => {
      for (const app of CURATED_APPS) {
        if (cancelled) break;
        try {
          const res = await fetch(
            `http://${host.host}:${host.port}/apps/icon?name=${encodeURIComponent(app.launchName)}`,
            { headers: { Authorization: `Bearer ${host.token}` } },
          );
          reportStatus(res.status);
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
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending((p) => ({ ...p, [app.key]: false }));
    }
  }

  async function quitOther(name: string) {
    await api.apps.quit.post({ name });
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
