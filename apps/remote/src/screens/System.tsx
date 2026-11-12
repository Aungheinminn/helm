import { useEffect, useRef, useState } from "react";
import { clientFor } from "../api";
import { useLive } from "../live";
import type { PairedHost } from "../store";

type Volume = { level: number | null; muted: boolean };
type Battery = { percent: number; state: string; onAC: boolean; timeRemaining: string | null };
type SystemState = { volume: Volume; battery: Battery | null; keepAwake: boolean };

// After the user drags the slider, ignore pushed volume for a moment so an update
// collected mid-drag doesn't snap the thumb back to an older level.
const SLIDER_HOLD_MS = 1500;
const VOLUME_DEBOUNCE_MS = 120;

function errorText(error: { status: unknown; value: unknown }): string {
  const v = error.value as { error?: string } | string | undefined;
  if (v && typeof v === "object" && v.error) return v.error;
  return String(v ?? error.status);
}

function batteryLine(b: Battery): string {
  const parts = [b.state];
  if (b.timeRemaining) parts.push(`${b.timeRemaining} ${b.state === "charging" ? "to full" : "left"}`);
  else if (b.onAC && b.state !== "charging") parts.push("on power adapter");
  return parts.join(" · ");
}

export function SystemScreen({ host }: { host: PairedHost }) {
  const [volume, setVolume] = useState<Volume | null>(null);
  const [battery, setBattery] = useState<Battery | null>(null);
  const [keepAwake, setKeepAwake] = useState<boolean | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const [clip, setClip] = useState("");
  const [clipSent, setClipSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lastDrag = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const api = clientFor(host);

  const live = useLive<SystemState>(host, "system");
  const error = actionError ?? live.error;

  useEffect(() => {
    const data = live.data;
    if (!data) return;
    if (Date.now() - lastDrag.current > SLIDER_HOLD_MS) setVolume(data.volume);
    setBattery(data.battery);
    setKeepAwake(data.keepAwake);
  }, [live.data]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    [],
  );

  function onSlide(level: number) {
    lastDrag.current = Date.now();
    setVolume((v) => (v ? { ...v, level, muted: false } : v));
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const { error } = await api.system.volume.post({ level, muted: false });
      if (error) setError(errorText(error));
    }, VOLUME_DEBOUNCE_MS);
  }

  async function toggleMute() {
    if (!volume) return;
    const muted = !volume.muted;
    setVolume({ ...volume, muted });
    const { data, error } = await api.system.volume.post({ muted });
    if (error) setError(errorText(error));
    else setVolume(data.volume);
  }

  async function toggleKeepAwake() {
    const on = !keepAwake;
    setKeepAwake(on);
    const { data, error } = await api.system["keep-awake"].post({ on });
    if (error) {
      setError(errorText(error));
      setKeepAwake(!on);
    } else setKeepAwake(data.keepAwake);
  }

  async function action(key: string, call: () => Promise<{ error: unknown }>) {
    setBusy(key);
    try {
      const { error } = await call();
      if (error) setError(errorText(error as { status: unknown; value: unknown }));
      else setError(null);
    } finally {
      setBusy(null);
    }
  }

  async function sendClip() {
    if (!clip) return;
    setBusy("clip");
    try {
      const { error } = await api.system.clipboard.post({ text: clip });
      if (error) {
        setError(errorText(error));
        return;
      }
      setError(null);
      setClip("");
      setClipSent(true);
      setTimeout(() => setClipSent(false), 2000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {battery && (
        <div className="row">
          <div>
            <div className="title">Battery {battery.percent}%</div>
            <div className="sub">{batteryLine(battery)}</div>
          </div>
          <div className="battery-meter" aria-hidden>
            <div
              className={battery.percent <= 20 && !battery.onAC ? "low" : ""}
              style={{ width: `${battery.percent}%` }}
            />
          </div>
        </div>
      )}

      {volume && (
        <div className="row stack">
          <div className="row-head">
            <div className="title">Volume</div>
            <div className="sub">
              {volume.level === null ? "not adjustable on this output" : volume.muted ? "muted" : `${volume.level}%`}
            </div>
          </div>
          <div className="volume-controls">
            <input
              type="range"
              min={0}
              max={100}
              value={volume.level ?? 0}
              disabled={volume.level === null}
              onChange={(e) => onSlide(Number(e.target.value))}
              className={volume.muted ? "muted" : ""}
              aria-label="Volume"
            />
            <button className={`action${volume.muted ? " primary" : ""}`} onClick={toggleMute}>
              {volume.muted ? "Unmute" : "Mute"}
            </button>
          </div>
        </div>
      )}

      {keepAwake !== null && (
        <div className="row">
          <div>
            <div className="title">Keep Mac awake</div>
            <div className="sub">
              {keepAwake ? "won't sleep while idle · screen can still turn off" : "Mac sleeps normally"}
            </div>
          </div>
          <button
            role="switch"
            aria-checked={keepAwake}
            aria-label="Keep Mac awake"
            className={`switch${keepAwake ? " on" : ""}`}
            onClick={toggleKeepAwake}
          >
            <span />
          </button>
        </div>
      )}

      <div className="control-grid">
        <button
          className="action"
          disabled={busy === "lock"}
          onClick={() => action("lock", () => api.system.lock.post())}
        >
          Lock screen
        </button>
        <button
          className="action"
          disabled={busy === "sleep"}
          onClick={() => action("sleep", () => api.system["display-sleep"].post())}
        >
          Sleep display
        </button>
      </div>

      <div className="row stack">
        <div className="row-head">
          <div className="title">Send to Mac clipboard</div>
          {clipSent && <div className="sub ok">Copied on Mac</div>}
        </div>
        <textarea
          className="clip-input"
          value={clip}
          onChange={(e) => setClip(e.target.value)}
          placeholder="Paste or type text…"
          rows={3}
        />
        <button className="action primary" disabled={!clip || busy === "clip"} onClick={sendClip}>
          Send
        </button>
      </div>
    </div>
  );
}
