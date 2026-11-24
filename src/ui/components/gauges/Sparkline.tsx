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
