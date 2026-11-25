import type { CSSProperties } from "react";

export function Sparkline({
  label,
  values,
  current,
  range,
  unit,
  accent,
  secondaryValues,
  secondaryCurrent,
  className,
}: {
  label: string;
  values: number[];
  current: number | null;
  range: number;
  unit: string;
  accent: string;
  secondaryValues?: number[];
  secondaryCurrent?: number | null;
  className?: string;
}) {
  const scale = secondaryValues
    ? Math.max(
        10_000,
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
  const formatRate = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} MB/s`;
    if (value >= 1_000) return `${Math.round(value / 1_000)} KB/s`;
    return `${Math.round(value)} B/s`;
  };
  const formatScale = (value: number) => secondaryValues
    ? formatRate(value)
    : unit === "%"
      ? `${Math.round(value)}%`
      : unit === "FPS"
        ? `${Math.round(value)} FPS`
        : `${Math.round(value)}`;
  const secondaryText = (value: number | null | undefined) => {
    if (value == null) return "—";
    const megabytes = value / 1_000_000;
    return megabytes >= 1
      ? `${megabytes.toFixed(1)}MB/s`
      : `${Math.round(value / 1_000)}KB/s`;
  };

  return (
    <article
      className={`sparkline-card ${className ?? ""}`}
      style={{ "--spark-accent": accent } as CSSProperties}
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
      <div className="sparkline-chart">
        <div className="sparkline-axis" aria-hidden="true">
          <span>{formatScale(scale)}</span>
          <span>{formatScale(scale / 2)}</span>
          <span>{formatScale(0)}</span>
        </div>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${label} trend, scale ${formatScale(scale)} to ${formatScale(0)}`}>
          <path d="M 0 6 H 100 M 0 21 H 100 M 0 36 H 100" className="sparkline-gridline" />
          {points.length > 0 && <path d={area} className="sparkline-area" />}
          {points.length > 0 && <path d={line} className="sparkline-line" />}
          {secondaryPoints.length > 0 && <path d={secondaryPoints.join(" ")} className="sparkline-line secondary" />}
        </svg>
      </div>
    </article>
  );
}
