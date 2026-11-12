import { useEffect, useRef, useState } from "react";
import { clientFor } from "../api";
import { useLive } from "../live";
import type { PairedHost } from "../store";

type Volume = { level: number | null; muted: boolean };
type Battery = { percent: number; state: string; onAC: boolean; timeRemaining: string | null };
type SystemState = {
  volume: Volume;
  battery: Battery | null;
  brightness: number | null;
  keepAwake: boolean;
  keepAwakeAtLaunch: boolean;
};

// After the user drags the slider, ignore pushed volume for a moment so an update
// collected mid-drag doesn't snap the thumb back to an older level.
const SLIDER_HOLD_MS = 1500;
const VOLUME_DEBOUNCE_MS = 120;

function errorText(error: { status: unknown; value: unknown }): string {
  const v = error.value as { error?: string } | string | undefined;
  if (v && typeof v === "object" && v.error) return v.error;
  return String(v ?? error.status);
}

// navigator.clipboard needs HTTPS, and Helm is served over plain HTTP on the LAN,
// so fall back to the old select-and-copy, which works inside a tap handler.
function copyToPhone(text: string): boolean {
  if (navigator.clipboard && window.isSecureContext) {
    void navigator.clipboard.writeText(text);
    return true;
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  el.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  el.remove();
  return ok;
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
  const [keepAwakeAtLaunch, setKeepAwakeAtLaunch] = useState(false);
  const [brightness, setBrightness] = useState<number | null>(null);
  const [macClip, setMacClip] = useState<{ text: string; truncated: boolean } | null>(null);
  const [macClipCopied, setMacClipCopied] = useState(false);
  const lastBrightnessDrag = useRef(0);
  const brightnessDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (Date.now() - lastBrightnessDrag.current > SLIDER_HOLD_MS) setBrightness(data.brightness);
    setBattery(data.battery);
    setKeepAwake(data.keepAwake);
    setKeepAwakeAtLaunch(data.keepAwakeAtLaunch);
  }, [live.data]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (brightnessDebounce.current) clearTimeout(brightnessDebounce.current);
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

  function onBrightness(level: number) {
    lastBrightnessDrag.current = Date.now();
    setBrightness(level);
    if (brightnessDebounce.current) clearTimeout(brightnessDebounce.current);
    brightnessDebounce.current = setTimeout(async () => {
      const { error } = await api.system.brightness.post({ level });
      if (error) setError(errorText(error));
    }, VOLUME_DEBOUNCE_MS);
  }

  async function toggleKeepAwakeAtLaunch() {
    const atLaunch = !keepAwakeAtLaunch;
    setKeepAwakeAtLaunch(atLaunch);
    // Ticking "always on" with the switch still off would look like it did nothing.
    const { data, error } = await api.system["keep-awake"].post(
      atLaunch ? { atLaunch, on: true } : { atLaunch },
    );
    if (error) {
      setError(errorText(error));
      setKeepAwakeAtLaunch(!atLaunch);
    } else {
      setKeepAwakeAtLaunch(data.keepAwakeAtLaunch);
      setKeepAwake(data.keepAwake);
    }
  }

  async function fetchMacClip() {
    setBusy("macclip");
    try {
      const { data, error } = await api.system.clipboard.get();
      if (error) {
        setError(errorText(error));
        return;
      }
      setError(null);
      setMacClip(data);
      setMacClipCopied(false);
    } finally {
      setBusy(null);
    }
  }

  function copyMacClip() {
    if (!macClip) return;
    if (copyToPhone(macClip.text)) {
      setMacClipCopied(true);
      setTimeout(() => setMacClipCopied(false), 2000);
    } else {
      setError("Couldn't copy automatically. Long-press the text to copy it.");
    }
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

      {brightness !== null && (
        <div className="row stack">
          <div className="row-head">
            <div className="title">Brightness</div>
            <div className="sub">{brightness}%</div>
          </div>
          <div className="volume-controls">
            <input
              type="range"
              min={0}
              max={100}
              value={brightness}
              onChange={(e) => onBrightness(Number(e.target.value))}
              aria-label="Brightness"
            />
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
      {keepAwake !== null && (
        <label className="row-option">
          <input type="checkbox" checked={keepAwakeAtLaunch} onChange={toggleKeepAwakeAtLaunch} />
          Turn on automatically whenever Helm starts
        </label>
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

      <div className="row stack">
        <div className="row-head">
          <div className="title">Get Mac clipboard</div>
          {macClipCopied && <div className="sub ok">Copied to phone</div>}
        </div>
        {macClip && (
          <>
            <textarea className="clip-input" value={macClip.text} readOnly rows={3} />
            {macClip.truncated && <div className="sub">Showing the first 100,000 characters.</div>}
            {!macClip.text && <div className="sub">The Mac clipboard has no text.</div>}
          </>
        )}
        <div className="control-grid tight">
          <button className="action" disabled={busy === "macclip"} onClick={fetchMacClip}>
            {macClip ? "Refresh" : "Get from Mac"}
          </button>
          <button className="action primary" disabled={!macClip?.text} onClick={copyMacClip}>
            Copy to phone
          </button>
        </div>
      </div>
    </div>
  );
}
