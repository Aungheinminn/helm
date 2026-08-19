import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { pairWith } from "../api";
import { addHost, setActiveHostId } from "../store";

type Props = {
  onPaired: () => void;
  onCancel?: () => void;
};

type PairTarget = { host: string; port: number; code: string };

type Mode = "qr" | "code";

export function PairScreen({ onPaired, onCancel }: Props) {
  const [mode, setMode] = useState<Mode>("qr");
  const [target, setTarget] = useState<PairTarget | null>(null);
  const [name, setName] = useState<string>(() => defaultDeviceName());
  const [manualCode, setManualCode] = useState("");
  const [manualEndpoint, setManualEndpoint] = useState<string>(() => defaultEndpoint());
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (target) return;
    if (mode !== "qr") return;
    const el = document.getElementById("scanner");
    if (!el) return;
    const scanner = new Html5Qrcode("scanner");
    scannerRef.current = scanner;
    let cancelled = false;
    let running = false;

    const safeStop = () => {
      if (!running) return;
      running = false;
      try {
        scanner.stop().catch(() => {});
      } catch {
        /* scanner not in a stoppable state */
      }
    };

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          try {
            const payload = JSON.parse(decoded) as PairTarget;
            if (payload.host && payload.port && payload.code) {
              setTarget(payload);
              safeStop();
            }
          } catch {
            /* ignore non-JSON */
          }
        },
        () => {},
      )
      .then(() => {
        running = true;
        if (cancelled) safeStop();
      })
      .catch((e) => {
        if (!cancelled) setScannerError(String(e));
      });

    return () => {
      cancelled = true;
      safeStop();
    };
  }, [target, mode]);

  function useManualCode() {
    if (!manualCode.trim()) return;
    const parsed = parseEndpoint(manualEndpoint);
    if (!parsed) {
      setError("Endpoint must look like host:port");
      return;
    }
    setError(null);
    setTarget({ host: parsed.host, port: parsed.port, code: manualCode.trim() });
  }

  async function doPair() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const baseUrl = `${window.location.protocol}//${target.host}:${target.port}`;
      const res = await pairWith(baseUrl, target.code, name);
      addHost({
        id: res.deviceId,
        name: res.host,
        host: target.host,
        port: target.port,
        token: res.token,
        addedAt: Date.now(),
      });
      setActiveHostId(res.deviceId);
      onPaired();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pair-screen">
      <header>
        <div style={{ flex: 1 }}>
          <h1>Pair with Mac</h1>
        </div>
        {onCancel && (
          <button className="action" onClick={onCancel}>
            Cancel
          </button>
        )}
      </header>

      {!target && (
        <>
          <div className="segmented">
            <button
              className={mode === "qr" ? "active" : ""}
              onClick={() => setMode("qr")}
            >
              QR
            </button>
            <button
              className={mode === "code" ? "active" : ""}
              onClick={() => setMode("code")}
            >
              Code
            </button>
          </div>

          {mode === "qr" ? (
            <>
              <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>
                Point at the QR shown on the Mac.
              </p>
              <div className="scanner" id="scanner" />
              {scannerError && (
                <div className="error" style={{ fontSize: 12 }}>
                  Camera unavailable: {scannerError}
                  <button
                    className="action"
                    style={{ marginLeft: 8, padding: "4px 10px", fontSize: 12 }}
                    onClick={() => setMode("code")}
                  >
                    Use code instead
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 13, color: "#888" }}>Mac endpoint</label>
              <input
                className="name-input"
                value={manualEndpoint}
                onChange={(e) => setManualEndpoint(e.target.value)}
                placeholder="host:port (e.g. 192.168.1.5:8787)"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <label style={{ fontSize: 13, color: "#888", display: "block", marginTop: 12 }}>
                Pairing code
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input
                  className="name-input"
                  style={{ marginTop: 0 }}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="paste from Mac"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  className="action primary"
                  onClick={useManualCode}
                  disabled={!manualCode.trim() || !manualEndpoint.trim()}
                >
                  Use
                </button>
              </div>
              {error && <div className="error">{error}</div>}
            </div>
          )}
        </>
      )}

      {target && (
        <>
          <div className="row">
            <div>
              <div className="title">{target.host}</div>
              <div className="sub">port {target.port}</div>
            </div>
          </div>
          <label style={{ fontSize: 13, color: "#888", marginTop: 12, display: "block" }}>
            This device's name
          </label>
          <input
            className="name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My iPhone"
          />
          {error && <div className="error">{error}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="action" onClick={() => setTarget(null)} disabled={busy}>
              Back
            </button>
            <button
              className="action primary"
              onClick={doPair}
              disabled={busy || !name.trim()}
            >
              {busy ? "Pairing…" : "Pair"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  return "Phone";
}

function defaultEndpoint(): string {
  const { hostname, port, protocol } = window.location;
  const fallback = protocol === "https:" ? "443" : "80";
  return `${hostname}:${port || fallback}`;
}

function parseEndpoint(raw: string): { host: string; port: number } | null {
  const trimmed = raw.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const m = trimmed.match(/^(.+?):(\d+)$/);
  if (!m) return null;
  const port = Number(m[2]);
  if (!m[1] || !Number.isFinite(port) || port <= 0 || port > 65535) return null;
  return { host: m[1], port };
}
