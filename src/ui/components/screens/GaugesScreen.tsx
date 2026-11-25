import { createPortal } from "react-dom";
import { memo, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Dial } from "../gauges/Dial";
import { Sparkline } from "../gauges/Sparkline";
import { useLongPress } from "../../hooks/useLongPress";
import type { GaugeId, Metric, MetricHistory, Theme, VisualStyle } from "../../types";

type Props = {
  metrics: Metric;
  history: MetricHistory;
  light: boolean;
  visibleGauges: GaugeId[];
  compactMode: boolean;
  active: boolean;
  theme: Theme;
  visualStyle: VisualStyle;
  accent: string;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onRemoveGauge: (id: GaugeId) => void;
  onOpenGaugeSettings: () => void;
};

type GaugeDatum = {
  id: GaugeId;
  label: string;
  value: number | null;
  range: number;
  unit: string;
  accent: string;
  history: number[];
  secondaryHistory?: number[];
  secondaryValue?: number | null;
  reading?: string;
};

const MAX_GAUGES = 4;

export const GaugesScreen = memo(function GaugesScreen({
  metrics,
  history,
  light,
  visibleGauges,
  compactMode,
  active,
  theme,
  visualStyle,
  accent,
  editing,
  onEdit,
  onDone,
  onRemoveGauge,
  onOpenGaugeSettings,
}: Props) {
  const [selectedGauge, setSelectedGauge] = useState<GaugeId | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<GaugeDatum | null>(null);
  const startEditing = () => {
    setSelectedGauge(null);
    onEdit();
  };
  const hold = useLongPress(startEditing);
  const gauges = useMemo<GaugeDatum[]>(() => {
    const diskReading = metrics.storage_used_gb != null && metrics.storage_total_gb != null
      ? `${Math.round(metrics.storage_used_gb)}GB / ${Math.round(metrics.storage_total_gb)}GB`
      : undefined;
    const all: GaugeDatum[] = [
      { id: "fps", label: "FPS", value: metrics.fps, range: 240, unit: "FPS", accent: "#4bb5fa", history: history.fps },
      { id: "cpu", label: "CPU", value: metrics.cpu_percent, range: 100, unit: "%", accent: "#ed9f61", history: history.cpu_percent },
      { id: "gpu", label: "GPU", value: metrics.gpu_percent, range: 100, unit: "%", accent: "#b49afa", history: history.gpu_percent },
      {
        id: "disk", label: "DISK", value: metrics.storage_percent, range: 100, unit: "%", accent: "#74d5ba",
        history: history.disk_read_bytes_sec, secondaryHistory: history.disk_write_bytes_sec,
        secondaryValue: metrics.disk_write_bytes_sec, reading: diskReading,
      },
    ];
    const selected = new Set(visibleGauges);
    return all.filter((gauge) => selected.has(gauge.id));
  }, [history, metrics, visibleGauges]);
  const activeGauge = gauges.find((gauge) => gauge.id === selectedGauge);

  useEffect(() => {
    if (!active) {
      setSelectedGauge(null);
      setPendingRemoval(null);
      if (editing) onDone();
      return;
    }
    if (selectedGauge && !gauges.some((gauge) => gauge.id === selectedGauge)) setSelectedGauge(null);
  }, [active, editing, gauges, onDone, selectedGauge]);

  const canAddGauge = visibleGauges.length < MAX_GAUGES;
  const gridCount = gauges.length + (editing && canAddGauge ? 1 : 0);
  const gaugeColumns = compactMode ? (gridCount <= 1 ? 1 : 2) : Math.max(1, gridCount);
  const gaugeRows = Math.max(1, Math.ceil(gridCount / gaugeColumns));
  const gaugeGridStyle = {
    "--gauge-columns": gaugeColumns,
    "--compact-columns": gaugeColumns,
    "--compact-rows": gaugeRows,
  } as CSSProperties;
  const graphGridStyle = { "--gauge-columns": Math.max(1, gridCount) } as CSSProperties;

  const renderDial = (gauge: GaugeDatum, onActivate?: () => void, large = false) => (
    <Dial
      label={gauge.label}
      value={gauge.value}
      unit={gauge.unit}
      range={gauge.range}
      accent={gauge.accent}
      light={light}
      unavailable={gauge.value == null}
      reading={gauge.reading}
      onClick={onActivate}
      holdHandlers={hold}
      className={large ? "gauge-detail-dial" : undefined}
    />
  );
  const renderGraph = (gauge: GaugeDatum, className?: string) => (
    <Sparkline
      label={gauge.label}
      values={gauge.history}
      current={gauge.value}
      range={gauge.range}
      unit={gauge.unit}
      accent={gauge.accent}
      secondaryValues={gauge.secondaryHistory}
      secondaryCurrent={gauge.secondaryValue}
      className={className}
    />
  );
  const renderGaugeItem = (gauge: GaugeDatum) => (
    <div className="gauge-edit-wrap" key={gauge.id}>
      {renderDial(gauge, editing ? onDone : compactMode ? () => setSelectedGauge(gauge.id) : undefined)}
      {editing && <button type="button" className="gauge-remove" disabled={gauges.length === 1} title={gauges.length === 1 ? "At least one gauge must remain" : `Remove ${gauge.label}`} aria-label={`Remove ${gauge.label} gauge`} onClick={() => setPendingRemoval(gauge)}>−</button>}
    </div>
  );

  if (compactMode && activeGauge && !editing) {
    return (
      <section className="instruments-screen compact-gauges-screen gauge-detail-screen">
        <div className="gauge-detail-layout">
          <div className="gauge-edit-wrap">{renderDial(activeGauge, () => setSelectedGauge(null), true)}</div>
          {renderGraph(activeGauge, "gauge-detail-graph")}
        </div>
      </section>
    );
  }

  if (gauges.length === 0) return <section className="instruments-screen"><p className="control-empty">No gauges are enabled. Choose gauges in Settings.</p></section>;

  return (
    <section className={`instruments-screen ${compactMode ? "compact-gauges-screen" : ""} ${!compactMode && gauges.length === 1 && !editing ? "single-gauge-screen" : ""} ${editing ? "gauge-editing" : ""}`}>
      <div className={`gauge-grid ${compactMode ? "compact-gauge-grid" : ""}`} data-count={gridCount} style={gaugeGridStyle}>
        {gauges.map(renderGaugeItem)}
        {editing && canAddGauge && <button type="button" className="gauge-add-card" aria-label="Add a gauge in Settings" onClick={onOpenGaugeSettings}><span>+</span></button>}
      </div>
      {!compactMode && <div className="sparkline-grid" data-count={gridCount} style={graphGridStyle}>
        {gauges.map((gauge) => renderGraph(gauge, editing ? "gauge-editing-graph" : undefined))}
      </div>}
      {pendingRemoval && createPortal(
        <div className={`launcher-modal-layer theme-${theme} style-${visualStyle}`} style={{ "--accent": accent } as CSSProperties} onPointerDown={(event) => { if (event.target === event.currentTarget) setPendingRemoval(null); }}>
          <section className="launcher-modal settings-panel" role="alertdialog" aria-modal="true" aria-label="Remove gauge">
            <h2>Remove {pendingRemoval.label} gauge?</h2>
            <p className="launcher-modal-message">This removes the gauge from your screen. You can add it again in Settings.</p>
            <div className="launcher-modal-actions">
              <button className="launcher-secondary" onClick={() => setPendingRemoval(null)}>Cancel</button>
              <button className="launcher-danger" onClick={() => { onRemoveGauge(pendingRemoval.id); setPendingRemoval(null); }}>Remove</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
});
