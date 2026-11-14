import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
type Layout = "phone" | "tablet" | "laptop";

// After the user drags the slider, ignore pushed volume for a moment so an update
// collected mid-drag doesn't snap the thumb back to an older level.
const SLIDER_HOLD_MS = 1500;
const VOLUME_DEBOUNCE_MS = 120;
// Above this level the fill reaches the value label, so the label switches to dark ink.
const INK_FLIP_AT = 82;

function errorText(error: { status: unknown; value: unknown }): string {
  const v = error.value as { error?: string } | string | undefined;
  if (v && typeof v === "object" && v.error) return v.error;
  return String(v ?? error.status);
}

function batteryState(b: Battery): string {
  return b.state.charAt(0).toUpperCase() + b.state.slice(1);
}

function batteryTime(b: Battery): string | null {
  if (b.timeRemaining) return `${b.timeRemaining} ${b.state === "charging" ? "to full" : "left"}`;
  if (b.onAC && b.state !== "charging") return "On power adapter";
  return null;
}

function useLayout(): Layout {
  const query = () =>
    window.matchMedia("(min-width: 1100px)").matches
      ? "laptop"
      : window.matchMedia("(min-width: 700px)").matches
        ? "tablet"
        : "phone";
  const [layout, setLayout] = useState<Layout>(query);
  useEffect(() => {
    const onChange = () => setLayout(query());
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
  }, []);
  return layout;
}

type FillSliderProps = {
  label: string;
  value: number;
  valueText: string;
  vertical: boolean;
  dim?: boolean;
  disabled?: boolean;
  onChange: (value: number) => void;
};

function FillSlider({ label, value, valueText, vertical, dim, disabled, onChange }: FillSliderProps) {
  function levelAt(e: PointerEvent<HTMLDivElement>): number {
    const r = e.currentTarget.getBoundingClientRect();
    const p = vertical ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
    return Math.round(Math.max(0, Math.min(1, p)) * 100);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onChange(levelAt(e));
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!disabled && e.currentTarget.hasPointerCapture(e.pointerId)) onChange(levelAt(e));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 5;
    const next =
      e.key === "ArrowUp" || e.key === "ArrowRight"
        ? value + step
        : e.key === "ArrowDown" || e.key === "ArrowLeft"
          ? value - step
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? 100
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(100, next)));
  }

  const fill = { [vertical ? "height" : "width"]: `${value}%` };
  return (
    <div
      className={`fill-slider ${vertical ? "vertical" : "horizontal"}${dim ? " dim" : ""}${disabled ? " disabled" : ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={disabled}
      aria-orientation={vertical ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
    >
      <div className="fill" style={fill} />
      {vertical && (
        <div className="tile-text">
          <div className="tile-label">{label}</div>
          <div className={`tile-value${!dim && value > INK_FLIP_AT ? " ink" : ""}`}>{valueText}</div>
        </div>
      )}
    </div>
  );
}

export function SystemScreen({ host }: { host: PairedHost }) {
  const [volume, setVolume] = useState<Volume | null>(null);
  const [battery, setBattery] = useState<Battery | null>(null);
  const [keepAwake, setKeepAwake] = useState<boolean | null>(null);
  const [keepAwakeAtLaunch, setKeepAwakeAtLaunch] = useState(false);
  const [brightness, setBrightness] = useState<number | null>(null);
  const lastBrightnessDrag = useRef(0);
  const brightnessDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actionError, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lastDrag = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const api = clientFor(host);
  const layout = useLayout();

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

  const vertical = layout !== "laptop";
  const short = layout === "phone";

  const volumeText =
    volume?.level === null ? "N/A" : volume?.muted ? "Muted" : `${volume?.level ?? 0}%`;

  const batteryCard = battery && (
    <div className={`sys-card battery-card${battery.percent <= 20 && !battery.onAC ? " low" : ""}`}>
      {layout !== "phone" && <div className="sys-muted">Battery</div>}
      <div className="battery-top">
        <div className="battery-figure">
          <span className="battery-num">{battery.percent}</span>
          <span className="battery-pct">%</span>
        </div>
        {layout === "phone" && (
          <div className="battery-side">
            Battery
            <br />
            <span>{batteryTime(battery) ?? batteryState(battery)}</span>
          </div>
        )}
      </div>
      <div className="battery-body">
        <div className="battery-segs" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className={i < Math.round(battery.percent / 10) ? "lit" : ""} />
          ))}
        </div>
        {layout !== "phone" && (
          <div className="battery-status">
            <span>{batteryState(battery)}</span>
            {batteryTime(battery) && <span className="strong">{batteryTime(battery)}</span>}
          </div>
        )}
      </div>
    </div>
  );

  const volumeSlider = volume && (
    <FillSlider
      label="Volume"
      value={volume.level ?? 0}
      valueText={volumeText}
      vertical={vertical}
      dim={volume.muted}
      disabled={volume.level === null}
      onChange={onSlide}
    />
  );

  const brightnessSlider = brightness !== null && (
    <FillSlider
      label="Brightness"
      value={brightness}
      valueText={`${brightness}%`}
      vertical={vertical}
      onChange={onBrightness}
    />
  );

  const muteButton = volume && (
    <button className={`sys-btn${volume.muted ? " on" : ""}`} onClick={toggleMute}>
      {volume.muted ? "Unmute" : "Mute"}
    </button>
  );

  const awakeCard = keepAwake !== null && (
    <div className="sys-card awake-card">
      <button
        className="awake-row"
        role="switch"
        aria-checked={keepAwake}
        aria-label="Keep Mac awake"
        onClick={toggleKeepAwake}
      >
        <div>
          <div className="awake-title">Keep awake</div>
          <div className="sys-muted">{keepAwake ? "Mac stays awake" : "Mac sleeps normally"}</div>
        </div>
        <span className={`sys-switch${keepAwake ? " on" : ""}`}>
          <span />
        </span>
      </button>
      <button
        className="awake-row option"
        role="checkbox"
        aria-checked={keepAwakeAtLaunch}
        onClick={toggleKeepAwakeAtLaunch}
      >
        <span>Turn on when Helm starts</span>
        <span className={`sys-check${keepAwakeAtLaunch ? " on" : ""}`}>{keepAwakeAtLaunch ? "✓" : ""}</span>
      </button>
    </div>
  );

  const lockButton = (
    <button
      className="sys-btn"
      disabled={busy === "lock"}
      onClick={() => action("lock", () => api.system.lock.post())}
    >
      {short ? "Lock" : "Lock screen"}
    </button>
  );

  const sleepButton = (
    <button
      className="sys-btn"
      disabled={busy === "sleep"}
      onClick={() => action("sleep", () => api.system["display-sleep"].post())}
    >
      {short ? "Sleep" : "Sleep display"}
    </button>
  );

  if (layout === "laptop") {
    return (
      <div className="sys laptop">
        {error && <div className="error">{error}</div>}
        <div className="sys-columns">
          <div className="sys-col">
            {batteryCard}
            {awakeCard}
          </div>
          <div className="sys-col">
            {volume && (
              <div className="sys-card slider-card">
                <div className="slider-head">
                  <span>Volume</span>
                  <span className="mono">{volumeText}</span>
                </div>
                <div className="slider-row">
                  {volumeSlider}
                  {muteButton}
                </div>
              </div>
            )}
            {brightness !== null && (
              <div className="sys-card slider-card">
                <div className="slider-head">
                  <span>Brightness</span>
                  <span className="mono">{brightness}%</span>
                </div>
                {brightnessSlider}
              </div>
            )}
            <div className="sys-actions two">
              {lockButton}
              {sleepButton}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`sys ${layout}`}>
      {error && <div className="error">{error}</div>}
      {batteryCard}
      {(volume || brightness !== null) && (
        <div className="sys-tiles">
          {volumeSlider}
          {brightnessSlider}
        </div>
      )}
      {awakeCard}
      <div className="sys-actions">
        {muteButton}
        {lockButton}
        {sleepButton}
      </div>
    </div>
  );
}
