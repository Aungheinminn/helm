import type { PairedHost } from "../store";

type Props = {
  hosts: PairedHost[];
  onConnect: (id: string) => void;
  onForget: (id: string) => void;
  onAdd: () => void;
};

export function HostsScreen({ hosts, onConnect, onForget, onAdd }: Props) {
  return (
    <>
      <header>
        <div>
          <h1>Helm</h1>
          <div className="host">Pick a Mac to control</div>
        </div>
        <button className="action" onClick={onAdd}>
          + Pair
        </button>
      </header>
      <main>
        {hosts.map((h) => (
          <div key={h.id} className="row">
            <div style={{ flex: 1 }}>
              <div className="title">{h.name}</div>
              <div className="sub">
                {h.host}:{h.port}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="action"
                onClick={() => {
                  if (confirm(`Forget ${h.name}?`)) onForget(h.id);
                }}
              >
                Forget
              </button>
              <button className="action primary" onClick={() => onConnect(h.id)}>
                Connect
              </button>
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
