import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

type Screen = "gauges" | "deck" | "controls";
type PowerAction = "logout" | "lock" | "shutdown" | "restart";
type MetricKey =
  | "fps"
  | "cpu_percent"
  | "gpu_percent"
  | "storage_percent"
  | "disk_read_bytes_sec"
  | "disk_write_bytes_sec";
type Metric = {
  cpu_percent: number | null;
  gpu_percent: number | null;
  storage_percent: number | null;
  storage_used_gb: number | null;
  storage_total_gb: number | null;
  disk_read_bytes_sec: number | null;
  disk_write_bytes_sec: number | null;
  fps: number | null;
};
type MetricHistory = Record<MetricKey, number[]>;
const previewMetric: Metric = {
  cpu_percent: 32,
  gpu_percent: 68,
  storage_percent: 54,
  storage_used_gb: 86,
  storage_total_gb: 160,
  disk_read_bytes_sec: 0,
  disk_write_bytes_sec: 0,
  fps: 144,
};
const applications = [
  {
    name: "Firefox",
    icon: "◉",
    tone: "firefox",
    match: "firefox",
  },
  {
    name: "Discord",
    icon: "◕",
    tone: "discord",
    match: "discord",
  },
  {
    name: "Spotify",
    icon: "≋",
    tone: "spotify",
    match: "spotify",
  },
  {
    name: "Steam",
    icon: "◉",
    tone: "steam",
    match: "steam",
  },
  {
    name: "Visual Studio Code",
    icon: "⌘",
    tone: "vscode",
    match: "code",
  },
  {
    name: "Files",
    icon: "▰",
    tone: "files",
    match: "org.gnome.nautilus",
  },
];

function Dial({
  label,
  value,
  unit,
  range,
  accent,
  light,
  reading,
  unavailable = false,
}: {
  label: string;
  value: number | null;
  unit: string;
  range: number;
  accent: string;
  light: boolean;
  reading?: string;
  unavailable?: boolean;
}) {
  const shown = value == null ? 0 : Math.max(0, Math.min(range, value));
  const angle = -135 + (shown / range) * 270;
  const ticks = Array.from({ length: 31 }, (_, i) => {
    const a = ((135 + i * 9) * Math.PI) / 180;
    const major = i % 5 === 0;
    const r1 = major ? 76 : 81;
    const r2 = 88;
    return (
      <line
        key={i}
        x1={100 + Math.cos(a) * r1}
        y1={100 + Math.sin(a) * r1}
        x2={100 + Math.cos(a) * r2}
        y2={100 + Math.sin(a) * r2}
        className={major ? "tick major" : "tick"}
      />
    );
  });
  const labels = Array.from({ length: 7 }, (_, i) => {
    const a = ((135 + i * 45) * Math.PI) / 180;
    return (
      <text
        key={i}
        x={100 + Math.cos(a) * 66}
        y={100 + Math.sin(a) * 66}
        className="dial-number"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {Math.round((range * i) / 6)}
      </text>
    );
  });
  return (
    <article
      className={`gauge-card ${unavailable ? "is-offline" : ""}`}
      style={{ "--gauge-accent": accent } as React.CSSProperties}
    >
      <div className="gauge-top">
        <span className="gauge-label">{label}</span>
        {unavailable && <span className="gauge-status muted">NO SOURCE</span>}
      </div>
      <div className="dial-wrap">
        <svg
          viewBox="0 0 200 200"
          className="dial-svg"
          role="img"
          aria-label={`${label}: ${value == null ? "source unavailable" : (reading ?? `${Math.round(value)} ${unit}`)}`}
        >
          <defs>
            <radialGradient id={`face-${label}`} cx="40%" cy="28%">
              <stop offset="0" stopColor={light ? "#f7f9fc" : "#303a49"} />
              <stop offset=".72" stopColor={light ? "#d6dee8" : "#1b222e"} />
              <stop offset="1" stopColor={light ? "#aab7c7" : "#121720"} />
            </radialGradient>
            <filter
              id={`shadow-${label}`}
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          <circle
            cx="100"
            cy="104"
            r="95"
            fill={light ? "#74849a" : "#080b11"}
            opacity=".48"
            filter={`url(#shadow-${label})`}
          />
          <circle cx="100" cy="98" r="92" className="bezel-outer" />
          <circle cx="100" cy="98" r="86" className="bezel-inner" />
          <circle cx="100" cy="98" r="81" fill={`url(#face-${label})`} />
          <g transform="translate(0 0)">
            {ticks}
            {labels}
          </g>
          <text x="100" y="71" className="dial-unit" textAnchor="middle">
            {unit.toUpperCase()}
          </text>
          <g
            className="needle-group"
            style={{ transform: `rotate(${angle}deg)` }}
          >
            <path
              d="M 100 111 L 97 102 L 99 42 Q 100 37 101 42 L 103 102 Z"
              className="needle"
            />
            <circle cx="100" cy="48" r="2" className="needle-tip" />
          </g>
          <circle cx="100" cy="98" r="11" className="hub-ring" />
          <circle cx="100" cy="98" r="6" className="hub" />
        </svg>
        <div className={`dial-reading ${reading ? "storage-reading" : ""}`}>
          <strong>
            {value == null ? "—" : (reading ?? Math.round(value))}
          </strong>
          {value != null && !reading && <span>{unit}</span>}
        </div>
      </div>
    </article>
  );
}

function Sparkline({
  label,
  values,
  current,
  range,
  unit,
  accent,
  secondaryValues,
  secondaryCurrent,
}: {
  label: string;
  values: number[];
  current: number | null;
  range: number;
  unit: string;
  accent: string;
  secondaryValues?: number[];
  secondaryCurrent?: number | null;
}) {
  const scale = secondaryValues
    ? Math.max(
        1_000_000,
        ...values,
        ...secondaryValues,
        current ?? 0,
        secondaryCurrent ?? 0,
      ) * 1.1
    : range;
  const points = values.map((value, index) => {
    const x = values.length < 2 ? 50 : (index / (values.length - 1)) * 100;
    const y = 36 - (Math.max(0, Math.min(scale, value)) / scale) * 30;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const secondaryPoints = (secondaryValues ?? []).map((value, index) => {
    const x =
      secondaryValues!.length < 2
        ? 50
        : (index / (secondaryValues!.length - 1)) * 100;
    const y = 36 - (Math.max(0, Math.min(scale, value)) / scale) * 30;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  const area = points.length ? `${line} L 100 40 L 0 40 Z` : "";
  const valueText = current == null ? "—" : `${Math.round(current)}${unit}`;
  const secondaryText = (value: number | null | undefined) => {
    if (value == null) return "—";
    const megabytes = value / 1_000_000;
    return megabytes >= 1
      ? `${megabytes.toFixed(1)}MB/s`
      : `${Math.round(value / 1_000)}KB/s`;
  };

  return (
    <article
      className="sparkline-card"
      style={{ "--spark-accent": accent } as React.CSSProperties}
    >
      <div className="sparkline-heading">
        <span>{label}</span>
        {secondaryValues ? (
          <strong className="io-values">
            <span>↓ {secondaryText(current)}</span>
            <span>↑ {secondaryText(secondaryCurrent)}</span>
          </strong>
        ) : (
          <strong>{valueText}</strong>
        )}
      </div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        aria-label={`${label} trend`}
      >
        {points.length > 0 && <path d={area} className="sparkline-area" />}
        {points.length > 0 && <path d={line} className="sparkline-line" />}
        {secondaryPoints.length > 0 && (
          <path
            d={secondaryPoints.join(" ")}
            className="sparkline-line secondary"
          />
        )}
      </svg>
    </article>
  );
}

function appendSample(previous: number[], value: number | null): number[] {
  return value == null ? previous : [...previous.slice(-35), value];
}

const screenOrder: Screen[] = ["controls", "deck", "gauges"];
type Theme = "light" | "dark" | "contrast";

export default function App() {
  const [screen, setScreen] = useState<Screen>("deck");
  const [theme, setTheme] = useState<Theme>("dark");
  const [metrics, setMetrics] = useState<Metric>(previewMetric);
  const [history, setHistory] = useState<MetricHistory>({
    fps: [],
    cpu_percent: [],
    gpu_percent: [],
    storage_percent: [],
    disk_read_bytes_sec: [],
    disk_write_bytes_sec: [],
  });
  const [isNative, setIsNative] = useState(false);
  const [apps, setApps] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [volume, setVolume] = useState(62);
  const [brightness, setBrightness] = useState(78);
  const [layout, setLayout] = useState("US");
  const [output, setOutput] = useState("Speakers");
  const [powerEnabled, setPowerEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState<PowerAction | null>(null);
  const screenTrackRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const swipeStart = useRef<{
    x: number;
    y: number;
    pointerId: number;
    baseX: number;
    lastX: number;
    lastTime: number;
    velocityX: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const getTrackMetrics = () => {
    const track = screenTrackRef.current;
    if (!track) return { pageWidth: 0, step: 0, origin: 0 };
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const pageWidth = (track.clientWidth - gap * 2) / 3;
    return { pageWidth, step: pageWidth + gap, origin: gap * 2 };
  };
  useEffect(() => {
    let live = true;
    void invoke<string[]>("list_applications")
      .then((found) => {
        if (live) {
          setIsNative(true);
          setApps(found);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!isNative) return;
    let alive = true;
    const update = async () => {
      try {
        const next = await invoke<Metric>("read_metrics");
        if (alive) {
          setMetrics(next);
          setHistory((previous) => ({
            fps: appendSample(previous.fps, next.fps),
            cpu_percent: appendSample(previous.cpu_percent, next.cpu_percent),
            gpu_percent: appendSample(previous.gpu_percent, next.gpu_percent),
            storage_percent: appendSample(
              previous.storage_percent,
              next.storage_percent,
            ),
            disk_read_bytes_sec: appendSample(
              previous.disk_read_bytes_sec,
              next.disk_read_bytes_sec,
            ),
            disk_write_bytes_sec: appendSample(
              previous.disk_write_bytes_sec,
              next.disk_write_bytes_sec,
            ),
          }));
        }
      } catch {
        /* retain last reading */
      }
    };
    void update();
    const timer = window.setInterval(update, 1800);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [isNative]);
  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);
  const showButtonRipple = (
    button: HTMLButtonElement,
    clientX: number,
    clientY: number,
  ) => {
    const bounds = button.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;
    const radius = Math.max(
      Math.hypot(x, y),
      Math.hypot(bounds.width - x, y),
      Math.hypot(x, bounds.height - y),
      Math.hypot(bounds.width - x, bounds.height - y),
    );
    const ripple = document.createElement("span");
    ripple.className = "button-ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = `${radius * 2}px`;
    ripple.style.height = `${radius * 2}px`;
    ripple.addEventListener("animationend", () => ripple.remove(), {
      once: true,
    });
    button.append(ripple);
  };
  const playButtonSound = () => {
    try {
      const context =
        audioContextRef.current ?? new AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = context;
      if (context.state === "suspended") void context.resume();

      const now = context.currentTime;
      const playTone = (
        frequency: number,
        endFrequency: number,
        startAt: number,
        duration: number,
        peak: number,
        type: OscillatorType,
      ) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now + startAt);
        oscillator.frequency.exponentialRampToValueAtTime(
          endFrequency,
          now + startAt + duration,
        );
        gain.gain.setValueAtTime(0.0001, now + startAt);
        gain.gain.exponentialRampToValueAtTime(peak, now + startAt + 0.008);
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + startAt + duration,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + startAt);
        oscillator.stop(now + startAt + duration + 0.01);
      };

      playTone(620, 300, 0, 0.035, 0.4, "triangle");
      playTone(180, 90, 0.002, 0.048, 0.17, "sine");

      const clickLength = Math.ceil(context.sampleRate * 0.008);
      const clickBuffer = context.createBuffer(1, clickLength, context.sampleRate);
      const clickSamples = clickBuffer.getChannelData(0);
      for (let index = 0; index < clickLength; index += 1) {
        clickSamples[index] = (Math.random() * 2 - 1) * (1 - index / clickLength);
      }
      const click = context.createBufferSource();
      const clickFilter = context.createBiquadFilter();
      const clickGain = context.createGain();
      click.buffer = clickBuffer;
      clickFilter.type = "lowpass";
      clickFilter.frequency.setValueAtTime(2400, now);
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.exponentialRampToValueAtTime(0.24, now + 0.0015);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
      click.connect(clickFilter);
      clickFilter.connect(clickGain);
      clickGain.connect(context.destination);
      click.start(now);
    } catch {
      // Audio feedback is optional; button actions should work without it.
    }
  };
  const onButtonPointerDownCapture = (
    event: React.PointerEvent<HTMLElement>,
  ) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button");
    if (
      button instanceof HTMLButtonElement &&
      (button.closest(".app-card") || button.closest(".controls-screen")) &&
      !button.disabled
    ) {
      showButtonRipple(button, event.clientX, event.clientY);
    }
  };
  const onButtonKeyDownCapture = (
    event: React.KeyboardEvent<HTMLElement>,
  ) => {
    if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button");
    if (
      button instanceof HTMLButtonElement &&
      (button.closest(".app-card") || button.closest(".controls-screen")) &&
      !button.disabled
    ) {
      const bounds = button.getBoundingClientRect();
      showButtonRipple(button, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    }
  };
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, select, textarea, [role='switch']")) {
      swipeStart.current = null;
      return;
    }
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const captureTarget = target?.closest("button") ?? event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    const pageIndex = screenOrder.indexOf(screen);
    const { step, origin } = getTrackMetrics();
    const baseX = origin - pageIndex * step;
    if (screenTrackRef.current) {
      screenTrackRef.current.style.transition = "none";
      screenTrackRef.current.style.transform = `translate3d(${baseX}px, 0, 0)`;
    }
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      baseX,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocityX: 0,
    };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    const track = screenTrackRef.current;
    if (!start || start.pointerId !== event.pointerId || !track) return;
    const deltaX = event.clientX - start.x;
    const elapsed = Math.max(1, event.timeStamp - start.lastTime);
    start.velocityX = (event.clientX - start.lastX) / elapsed;
    start.lastX = event.clientX;
    start.lastTime = event.timeStamp;
    const { step, origin } = getTrackMetrics();
    const proposedX = start.baseX + deltaX;
    const minX = origin - 2 * step;
    const maxX = origin;
    const settledX = Math.max(minX, Math.min(maxX, proposedX));
    const resistedX =
      proposedX === settledX
        ? settledX
        : settledX + (proposedX - settledX) * 0.24;
    track.style.transform = `translate3d(${resistedX}px, 0, 0)`;
    if (Math.abs(deltaX) > 8) event.preventDefault();
  };
  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const start = swipeStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    swipeStart.current = null;
    const track = screenTrackRef.current;
    if (!track) return;
    const { pageWidth } = getTrackMetrics();
    const enoughDistance = Math.abs(dx) > pageWidth * 0.18;
    const quickFlick = Math.abs(dx) > 40 && Math.abs(start.velocityX) > 0.55;
    if ((enoughDistance || quickFlick) && Math.abs(dx) > Math.abs(dy) * 1.25) {
      event.preventDefault();
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 500);
      track.style.transition =
        "transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)";
      const nextScreen =
        screen === "deck"
          ? dx < 0
            ? "gauges"
            : "controls"
          : screen === "controls" && dx < 0
            ? "deck"
            : screen === "gauges" && dx > 0
              ? "deck"
              : null;
      if (nextScreen) {
        track.dataset.screen = nextScreen;
        track.style.transform = "";
        setScreen(nextScreen);
      } else {
        track.style.transform = "";
      }
    } else {
      track.style.transition =
        "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1)";
      track.style.transform = "";
    }
  };
  const onPointerCancel = () => {
    const start = swipeStart.current;
    swipeStart.current = null;
    const track = screenTrackRef.current;
    if (!start || !track) return;
    track.style.transition = "transform 220ms ease-out";
    track.style.transform = "";
  };
  const onClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest("button");
    if (
      button instanceof HTMLButtonElement &&
      (button.closest(".app-card") || button.closest(".controls-screen")) &&
      !button.disabled
    ) {
      playButtonSound();
    }
  };
  const launch = async (index: number) => {
    const app = applications[index];
    const id = apps.find((candidate) =>
      candidate.toLowerCase().includes(app.match),
    );
    if (isNative && id) {
      try {
        await invoke("launch_application", { desktopId: id });
        notify(`Launching ${id.replace(/\.desktop$/, "")}`);
      } catch {
        notify(`Could not launch ${id}`);
      }
    } else if (isNative) notify(`${app.name} is not installed`);
    else notify(`${app.name} · preview action`);
  };
  const resizeWindowForDebug = async () => {
    if (!isTauri()) {
      notify("Window resizing is available in the desktop app");
      return;
    }
    try {
      await getCurrentWindow().setSize(new LogicalSize(1024, 600));
      notify("Window resized to 1024 × 600");
    } catch (error) {
      notify(`Could not resize window: ${String(error)}`);
    }
  };
  const runPowerAction = async () => {
    if (!pendingAction || !powerEnabled) return;
    const action = pendingAction;
    setPendingAction(null);
    if (!isNative) {
      notify(`${action} · preview action`);
      return;
    }
    try {
      await invoke("run_system_action", { action });
      notify(`${action} requested`);
    } catch (error) {
      notify(String(error));
    }
  };

  const renderPageContent = (activeScreen: Screen) => (
    <>
      {activeScreen === "gauges" && (
        <section className="instruments-screen">
          <div className="gauge-grid">
            <Dial
              label="FPS"
              value={metrics.fps}
              unit="FPS"
              range={240}
              accent="#4bb5fa"
              light={theme === "light"}
              unavailable={metrics.fps == null}
            />
            <Dial
              label="CPU"
              value={metrics.cpu_percent}
              unit="%"
              range={100}
              accent="#ed9f61"
              light={theme === "light"}
              unavailable={metrics.cpu_percent == null}
            />
            <Dial
              label="GPU"
              value={metrics.gpu_percent}
              unit="%"
              range={100}
              accent="#b49afa"
              light={theme === "light"}
              unavailable={metrics.gpu_percent == null}
            />
            <Dial
              label="DISK"
              value={metrics.storage_percent}
              unit="%"
              range={100}
              accent="#74d5ba"
              light={theme === "light"}
              unavailable={metrics.storage_percent == null}
              reading={
                metrics.storage_used_gb != null &&
                metrics.storage_total_gb != null
                  ? `${Math.round(metrics.storage_used_gb)}GB / ${Math.round(metrics.storage_total_gb)}GB`
                  : undefined
              }
            />
          </div>
          <div className="sparkline-grid">
            <Sparkline
              label="FPS"
              values={history.fps}
              current={metrics.fps}
              range={240}
              unit=""
              accent="#4bb5fa"
            />
            <Sparkline
              label="CPU"
              values={history.cpu_percent}
              current={metrics.cpu_percent}
              range={100}
              unit="%"
              accent="#ed9f61"
            />
            <Sparkline
              label="GPU"
              values={history.gpu_percent}
              current={metrics.gpu_percent}
              range={100}
              unit="%"
              accent="#b49afa"
            />
            <Sparkline
              label="DISK"
              values={history.disk_read_bytes_sec}
              current={metrics.disk_read_bytes_sec}
              range={100}
              unit=""
              accent="#74d5ba"
              secondaryValues={history.disk_write_bytes_sec}
              secondaryCurrent={metrics.disk_write_bytes_sec}
            />
          </div>
        </section>
      )}

      {activeScreen === "deck" && (
        <section className="deck-screen">
          <div className="app-grid">
            {applications.map((app, i) => (
              <button
                key={app.name}
                className="app-card"
                onClick={() => void launch(i)}
                aria-label={app.name}
              >
                <span className={`app-icon ${app.tone}`}>{app.icon}</span>
                <span className="app-name">
                  {app.name === "Visual Studio Code" ? "Code" : app.name}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeScreen === "controls" && (
        <section className="controls-screen">
          <article className="levels-panel settings-panel">
            <div className="level-row">
              <button
                type="button"
                className="control-icon volume-icon level-action"
                onClick={() => setVolume(volume === 0 ? 62 : 0)}
                aria-label={volume === 0 ? "Unmute volume" : "Mute volume"}
              >
                {volume === 0 ? (
                  "×"
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
                    <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                style={{ "--range-value": `${volume}%` } as React.CSSProperties}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="Output volume"
              />
              <span className="range-value">
                {volume}
                <small>%</small>
              </span>
            </div>
            <div className="level-row">
              <button
                type="button"
                className="control-icon brightness-icon level-action"
                onClick={() => setBrightness(100)}
                aria-label="Set full brightness"
              >
                ☼
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={brightness}
                style={
                  {
                    "--range-value": `${brightness}%`,
                  } as React.CSSProperties
                }
                onChange={(event) => setBrightness(Number(event.target.value))}
                aria-label="Display brightness"
              />
              <span className="range-value">
                {brightness}
                <small>%</small>
              </span>
            </div>
          </article>

          <div className="settings-grid">
            <article className="settings-panel">
              <h2>Audio output</h2>
              <div className="choice-list">
                {["Speakers", "Headphones"].map((item, index) => (
                  <button
                    key={item}
                    className={`choice-row ${output === item ? "chosen" : ""}`}
                    onClick={() => setOutput(item)}
                    aria-pressed={output === item}
                  >
                    <span className="choice-icon" aria-hidden="true">
                      {index ? "♬" : "◖"}
                    </span>
                    <strong>{item}</strong>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="debug-resize-button"
                onClick={() => void resizeWindowForDebug()}
                aria-label="Debug: resize window to 1024 by 600"
              >
                DEBUG · 1024 × 600
              </button>
            </article>

            <article className="settings-panel">
              <h2>Keyboard layout</h2>
              <div className="layout-options">
                {["US", "BR", "DE"].map((item) => (
                  <button
                    key={item}
                    className={`layout-key ${layout === item ? "selected" : ""}`}
                    onClick={() => setLayout(item)}
                    aria-pressed={layout === item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </article>

            <article className="settings-panel appearance-panel">
              <h2>Appearance</h2>
              <div className="appearance-options">
                <button
                  className={`appearance-key ${theme === "light" ? "selected" : ""}`}
                  onClick={() => setTheme("light")}
                  aria-pressed={theme === "light"}
                >
                  <span aria-hidden="true">☼</span> Light
                </button>
                <button
                  className={`appearance-key ${theme === "dark" ? "selected" : ""}`}
                  onClick={() => setTheme("dark")}
                  aria-pressed={theme === "dark"}
                >
                  <span aria-hidden="true">☾</span> Dark
                </button>
                <button
                  className={`appearance-key ${theme === "contrast" ? "selected" : ""}`}
                  onClick={() => setTheme("contrast")}
                  aria-pressed={theme === "contrast"}
                >
                  <span aria-hidden="true">◐</span> Midnight
                </button>
              </div>
            </article>

            <article className="settings-panel power-panel">
              <div className="power-heading">
                <h2>Power</h2>
                <button
                  type="button"
                  className="safety-toggle"
                  role="switch"
                  aria-checked={powerEnabled}
                  aria-label={
                    powerEnabled
                      ? "Disable power actions"
                      : "Enable power actions"
                  }
                  onClick={() => setPowerEnabled((enabled) => !enabled)}
                >
                  <span className="toggle-track" aria-hidden="true" />
                </button>
              </div>
              <div className="power-actions">
                {(
                  [
                    ["logout", "Log out"],
                    ["lock", "Lock"],
                    ["shutdown", "Shut down"],
                    ["restart", "Restart"],
                  ] as const
                ).map(([action, label]) => (
                  <button
                    key={action}
                    className={`power-action ${action}`}
                    disabled={!powerEnabled}
                    onClick={() => setPendingAction(action)}
                    aria-label={label}
                  >
                    {action === "restart" ? (
                      <span aria-hidden="true">↻</span>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        {action === "logout" && (
                          <>
                            <path d="M10 4H5v16h5" />
                            <path d="M13 8l5 4-5 4m5-4H9" />
                          </>
                        )}
                        {action === "lock" && (
                          <>
                            <rect x="4" y="10" width="16" height="11" rx="2" />
                            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                            <path d="M12 14v3" />
                          </>
                        )}
                        {action === "shutdown" && (
                          <>
                            <path d="M12 3v9" />
                            <path d="M7 6.5a8 8 0 1 0 10 0" />
                          </>
                        )}
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </article>
          </div>
        </section>
      )}
    </>
  );

  return (
    <div className={`app-shell theme-${theme}`}>
      <main
        className="screen-content"
        onPointerDownCapture={onButtonPointerDownCapture}
        onKeyDownCapture={onButtonKeyDownCapture}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onClickCapture}
      >
        <div ref={screenTrackRef} className="screen-track" data-screen={screen}>
          {screenOrder.map((page) => (
            <div
              key={page}
              className="screen-page"
              aria-hidden={screen !== page}
              inert={screen !== page}
            >
              {renderPageContent(page)}
            </div>
          ))}
        </div>
      </main>
      {toast && (
        <div className="toast">
          <span /> {toast}
        </div>
      )}
      {pendingAction && (
        <div className="power-confirm-backdrop" role="presentation">
          <section
            className="power-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="power-confirm-title"
          >
            <h2 id="power-confirm-title">Confirm {pendingAction}?</h2>
            <p>This action will affect your current desktop session.</p>
            <div>
              <button onClick={() => setPendingAction(null)}>Cancel</button>
              <button
                className="confirm-action"
                onClick={() => void runPowerAction()}
              >
                {pendingAction === "shutdown"
                  ? "Shut down"
                  : pendingAction === "restart"
                    ? "Restart"
                    : pendingAction === "logout"
                      ? "Log out"
                      : "Lock"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
