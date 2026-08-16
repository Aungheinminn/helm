import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { pairWith } from "../api";
import { addHost, setActiveHostId } from "../store";

type Props = {
  onPaired: () => void;
  onCancel?: () => void;
};

type PairTarget = { host: string; port: number; code: string };

export function PairScreen({ onPaired, onCancel }: Props) {
  const [target, setTarget] = useState<PairTarget | null>(null);
  const [name, setName] = useState<string>(() => defaultDeviceName());
  const [manualCode, setManualCode] = useState("");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (target) return;
    const el = document.getElementById("scanner");
    if (!el) return;
    const scanner = new Html5Qrcode("scanner");
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          try {
            const payload = JSON.parse(decoded) as PairTarget;
            if (payload.host && payload.port && payload.code) {
              setTarget(payload);
              scanner.stop().catch(() => {});
            }
          } catch {
            /* ignore non-JSON */
          }
        },
        () => {},
      )
      .catch((e) => setScannerError(String(e)));

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [target]);

  function useManualCode() {
    if (!manualCode.trim()) return;
    const url = new URL(window.location.href);
    setTarget({
      host: url.hostname,
      port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
      code: manualCode.trim(),
    });
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
        name: `${res.host} (${target.host})`,
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
          <p style={{ color: "#888", fontSize: 13 }}>
            Scan the QR from the Mac window, or type the code below.
          </p>
          <div className="scanner" id="scanner" />
          {scannerError && (
            <div className="error" style={{ fontSize: 12 }}>
              Camera unavailable: {scannerError}. Use manual code below.
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, color: "#888" }}>Or enter code manually</label>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input
                className="name-input"
                style={{ marginTop: 0 }}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="paste the code shown on Mac"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                className="action primary"
                onClick={useManualCode}
                disabled={!manualCode.trim()}
              >
                Use
              </button>
            </div>
          </div>
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
