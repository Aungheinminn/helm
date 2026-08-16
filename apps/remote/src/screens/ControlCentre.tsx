import { useState } from "react";
import type { PairedHost } from "../store";
import { AppsScreen } from "./Apps";
import { PortsScreen } from "./Ports";
import { TmuxScreen } from "./Tmux";

type Tab = "apps" | "ports" | "tmux";

type Props = {
  host: PairedHost;
  onDisconnect: () => void;
};

export function ControlCentre({ host, onDisconnect }: Props) {
  const [tab, setTab] = useState<Tab>("apps");

  return (
    <>
      <header>
        <button className="back" onClick={onDisconnect} aria-label="Disconnect">
          ‹
        </button>
        <div style={{ flex: 1, marginLeft: 8 }}>
          <h1>{host.name}</h1>
          <div className="host">
            {host.host}:{host.port}
          </div>
        </div>
      </header>
      <nav>
        {(["apps", "ports", "tmux"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <main>
        {tab === "apps" && <AppsScreen host={host} />}
        {tab === "ports" && <PortsScreen host={host} />}
        {tab === "tmux" && <TmuxScreen host={host} />}
      </main>
    </>
  );
}
