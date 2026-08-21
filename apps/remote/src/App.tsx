import { useEffect, useState } from "react";
import {
  loadHosts,
  getActiveHostId,
  setActiveHostId,
  removeHost,
  type PairedHost,
} from "./store";
import { setOnUnauthorized } from "./api";
import { PairScreen } from "./screens/Pair";
import { HostsScreen } from "./screens/Hosts";
import { ControlCentre } from "./screens/ControlCentre";

export function App() {
  const [hosts, setHosts] = useState<PairedHost[]>(loadHosts());
  const [activeId, setActiveId] = useState<string | null>(getActiveHostId());
  const [pairing, setPairing] = useState(false);

  useEffect(() => {
    setOnUnauthorized(() => {
      const id = getActiveHostId();
      if (!id) return;
      removeHost(id);
      setActiveHostId(null);
      setActiveId(null);
      setHosts(loadHosts());
    });
    return () => setOnUnauthorized(null);
  }, []);

  function refresh() {
    setHosts(loadHosts());
    setActiveId(getActiveHostId());
  }

  function connect(id: string) {
    setActiveHostId(id);
    setActiveId(id);
  }

  function disconnect() {
    setActiveHostId(null);
    setActiveId(null);
  }

  function forget(id: string) {
    removeHost(id);
    if (activeId === id) {
      setActiveHostId(null);
      setActiveId(null);
    }
    refresh();
  }

  if (pairing || hosts.length === 0) {
    return (
      <PairScreen
        onPaired={() => {
          refresh();
          setPairing(false);
        }}
        onCancel={hosts.length > 0 ? () => setPairing(false) : undefined}
      />
    );
  }

  const active = hosts.find((h) => h.id === activeId) ?? null;

  if (!active) {
    return (
      <div className="app">
        <HostsScreen
          hosts={hosts}
          onConnect={connect}
          onForget={forget}
          onAdd={() => setPairing(true)}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <ControlCentre host={active} onDisconnect={disconnect} />
    </div>
  );
}
