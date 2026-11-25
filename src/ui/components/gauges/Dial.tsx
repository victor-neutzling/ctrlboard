import type { CSSProperties } from "react";
import type { useLongPress } from "../../hooks/useLongPress";

type HoldHandlers = ReturnType<typeof useLongPress<HTMLElement>>;

export function Dial({
  label,
  value,
  unit,
  range,
  accent,
  light,
  reading,
  unavailable = false,
  onClick,
  className,
  holdHandlers,
}: {
  label: string;
  value: number | null;
  unit: string;
  range: number;
  accent: string;
  light: boolean;
  reading?: string;
  unavailable?: boolean;
  onClick?: () => void;
  className?: string;
  holdHandlers?: HoldHandlers;
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
      className={`gauge-card ${unavailable ? "is-offline" : ""} ${className ?? ""} ${onClick ? "gauge-interactive" : ""}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `${label} gauge` : undefined}
      data-long-press-target={holdHandlers ? "true" : undefined}
      {...holdHandlers}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      style={{ "--gauge-accent": accent } as CSSProperties}
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
              <stop offset="0" stopColor={light ? "#f7f9fc" : "color-mix(in srgb, var(--accent) 16%, #303236)"} />
              <stop offset=".72" stopColor={light ? "#d6dee8" : "color-mix(in srgb, var(--accent) 9%, #1b1c20)"} />
              <stop offset="1" stopColor={light ? "#aab7c7" : "color-mix(in srgb, var(--accent) 5%, #121315)"} />
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
