import { memo } from "react";
import { Dial } from "../gauges/Dial";
import { Sparkline } from "../gauges/Sparkline";
import type { Metric, MetricHistory } from "../../types";

type Props = {
  metrics: Metric;
  history: MetricHistory;
  light: boolean;
};

export const GaugesScreen = memo(function GaugesScreen({
  metrics,
  history,
  light,
}: Props) {
  const diskReading =
    metrics.storage_used_gb != null && metrics.storage_total_gb != null
      ? `${Math.round(metrics.storage_used_gb)}GB / ${Math.round(metrics.storage_total_gb)}GB`
      : undefined;

  return (
    <section className="instruments-screen">
      <div className="gauge-grid">
        <Dial
          label="FPS"
          value={metrics.fps}
          unit="FPS"
          range={240}
          accent="#4bb5fa"
          light={light}
          unavailable={metrics.fps == null}
        />
        <Dial
          label="CPU"
          value={metrics.cpu_percent}
          unit="%"
          range={100}
          accent="#ed9f61"
          light={light}
          unavailable={metrics.cpu_percent == null}
        />
        <Dial
          label="GPU"
          value={metrics.gpu_percent}
          unit="%"
          range={100}
          accent="#b49afa"
          light={light}
          unavailable={metrics.gpu_percent == null}
        />
        <Dial
          label="DISK"
          value={metrics.storage_percent}
          unit="%"
          range={100}
          accent="#74d5ba"
          light={light}
          unavailable={metrics.storage_percent == null}
          reading={diskReading}
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
  );
});
