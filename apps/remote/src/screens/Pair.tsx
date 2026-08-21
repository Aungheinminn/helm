import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { pairWith } from "../api";
import { addHost, setActiveHostId } from "../store";

type Props = {
  onPaired: () => void;
  onCancel?: () => void;
};

type PairTarget = { host: string; port: number; code: string };
type Mode = "qr" | "code";
type Reach = "idle" | "probing" | "reachable" | "unreachable";

const CODE_LEN = 6;
const emptyCode = () => Array<string>(CODE_LEN).fill("");

export function PairScreen({ onPaired, onCancel: _onCancel }: Props) {
  const [mode, setMode] = useState<Mode>("qr");
  const [endpoint, setEndpoint] = useState<string>(() => defaultEndpoint());
  const [code, setCode] = useState<string[]>(emptyCode);
  const [reach, setReach] = useState<Reach>("idle");
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const slotRefs = useRef<Array<HTMLInputElement | null>>([]);

  const filled = code.every((c) => c);
  const parsedEndpoint = useMemo(() => parseEndpoint(endpoint), [endpoint]);

  useEffect(() => {
    if (mode !== "qr" || busy) return;
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
        /* not stoppable */
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
              safeStop();
              void doPair(payload);
            }
          } catch {
            /* ignore non-JSON */
          }
        },
        () => {},
      )
      .then(() => {
        running = true;
        setCameraBlocked(false);
        if (cancelled) safeStop();
      })
      .catch(() => {
        if (!cancelled) setCameraBlocked(true);
      });

    return () => {
      cancelled = true;
      safeStop();
    };
  }, [mode, busy]);

  useEffect(() => {
    if (mode !== "code") return;
    if (!parsedEndpoint) {
      setReach("idle");
      return;
    }
    setReach("probing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const url = `${window.location.protocol}//${parsedEndpoint.host}:${parsedEndpoint.port}/health`;
    fetch(url, { mode: "no-cors", signal: controller.signal })
      .then(() => setReach("reachable"))
      .catch(() => setReach("unreachable"))
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [mode, parsedEndpoint?.host, parsedEndpoint?.port]);

  async function doPair(target: PairTarget) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const baseUrl = `${window.location.protocol}//${target.host}:${target.port}`;
      const res = await pairWith(baseUrl, target.code, defaultDeviceName());
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
      setCode(emptyCode());
    } finally {
      setBusy(false);
    }
  }

  function submitCode() {
    if (!filled || !parsedEndpoint || busy) return;
    void doPair({
      host: parsedEndpoint.host,
      port: parsedEndpoint.port,
      code: code.join(""),
    });
  }

  function updateSlot(i: number, raw: string) {
    const v = raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(-1);
    const next = code.slice();
    next[i] = v;
    setCode(next);
    if (v && slotRefs.current[i + 1]) slotRefs.current[i + 1]?.focus();
  }

  function slotKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[i] && slotRefs.current[i - 1]) {
      slotRefs.current[i - 1]?.focus();
    }
  }

  async function pasteCode() {
    try {
      const raw = await navigator.clipboard.readText();
      const cleaned = raw.replace(/[^a-z0-9]/gi, "").slice(0, CODE_LEN).toUpperCase().split("");
      setCode(Array.from({ length: CODE_LEN }, (_, i) => cleaned[i] ?? ""));
      const nextEmpty = cleaned.length < CODE_LEN ? cleaned.length : CODE_LEN - 1;
      slotRefs.current[nextEmpty]?.focus();
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="pair-screen">
      <div className="pair-card">
        <div className="pair-hero">
          <div className="pair-hero-illo">
            <div className="pair-hero-phone">
              <div className="pair-hero-phone-btn" />
            </div>
            <svg
              className="pair-hero-dash"
              width="46"
              height="10"
              viewBox="0 0 46 10"
              fill="none"
            >
              <path d="M1 5 H45" />
            </svg>
            <div className="pair-hero-mac">
              <div className="pair-hero-mac-screen" />
              <div className="pair-hero-mac-base" />
            </div>
          </div>
          <div className="pair-hero-text">
            <h1>Pair with Mac</h1>
            <p>Connect this device to the Mac app to mirror your session.</p>
          </div>
        </div>

        <div className="pair-panel">
          <div className="pair-tabs">
            <button
              className={mode === "qr" ? "active" : ""}
              onClick={() => setMode("qr")}
            >
              Scan QR
            </button>
            <button
              className={mode === "code" ? "active" : ""}
              onClick={() => setMode("code")}
            >
              Enter code
            </button>
          </div>

          {mode === "qr" ? (
            <div className="pair-body">
              <div className="pair-scanner">
                <div id="scanner" style={{ position: "absolute", inset: 0 }} />
                {!cameraBlocked && (
                  <>
                    <div className="pair-scanner-grid" />
                    <div className="pair-scanner-sweep" />
                  </>
                )}
                {cameraBlocked && (
                  <div className="pair-scanner-blocked">
                    <div className="badge">!</div>
                    <div className="title">Camera access is blocked</div>
                    <div className="hint">
                      Allow camera in your browser settings, or pair with a code
                      instead.
                    </div>
                    <button onClick={() => setMode("code")}>Enter code instead</button>
                  </div>
                )}
                <div className="pair-scanner-corners">
                  <span className="tl" />
                  <span className="tr" />
                  <span className="bl" />
                  <span className="br" />
                </div>
              </div>
              <p className="pair-caption">
                Point the camera at the QR code shown in the Mac app.
              </p>
              {error && <div className="pair-error">{error}</div>}
            </div>
          ) : (
            <div className="pair-body">
              <div className="pair-field">
                <div className="pair-field-head">
                  <label className="pair-field-label">Mac endpoint</label>
                  <ReachStatus reach={reach} />
                </div>
                <input
                  className="pair-input"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="host:port"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>

              <div className="pair-field">
                <div className="pair-field-head">
                  <label className="pair-field-label">Pairing code</label>
                  <button className="pair-field-paste" onClick={pasteCode}>
                    Paste
                  </button>
                </div>
                <div className="pair-slots">
                  {code.map((value, i) => (
                    <input
                      key={i}
                      className={`pair-slot ${value ? "filled" : ""}`}
                      value={value}
                      onChange={(e) => updateSlot(i, e.target.value)}
                      onKeyDown={(e) => slotKeyDown(i, e)}
                      ref={(el) => {
                        slotRefs.current[i] = el;
                      }}
                      maxLength={1}
                      inputMode="text"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  ))}
                </div>
                <p className="pair-field-hint">
                  Six characters, shown under Settings › Devices on the Mac.
                </p>
              </div>

              {error && <div className="pair-error">{error}</div>}

              <button
                className={`pair-cta ${filled && parsedEndpoint && !busy ? "ready" : ""}`}
                onClick={submitCode}
                disabled={!filled || !parsedEndpoint || busy}
              >
                {busy ? "Pairing…" : "Pair device"}
              </button>
            </div>
          )}
        </div>

        <div className="pair-footer">
          <span>Both devices must be on the same network.</span>
        </div>
      </div>
    </div>
  );
}

function ReachStatus({ reach }: { reach: Reach }) {
  if (reach === "reachable")
    return (
      <div className="pair-field-status ok">
        <span className="dot" />
        <span>reachable</span>
      </div>
    );
  if (reach === "unreachable")
    return (
      <div className="pair-field-status bad">
        <span className="dot" />
        <span>unreachable</span>
      </div>
    );
  if (reach === "probing")
    return (
      <div className="pair-field-status" style={{ color: "#7d858e" }}>
        <span>checking…</span>
      </div>
    );
  return null;
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
