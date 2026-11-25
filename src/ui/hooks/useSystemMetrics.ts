import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emptyMetricHistory, previewMetric } from "../data/previewMetric";
import type { Metric, MetricHistory } from "../types";
import type { InstalledApplication } from "../types";

function appendSample(previous: number[], value: number | null): number[] {
  return value == null ? previous : [...previous.slice(-35), value];
}

export function useSystemMetrics() {
  const [metrics, setMetrics] = useState<Metric>(previewMetric);
  const [history, setHistory] = useState<MetricHistory>(emptyMetricHistory);
  const [isNative, setIsNative] = useState(false);
  const [installedApps, setInstalledApps] = useState<InstalledApplication[]>([]);

  useEffect(() => {
    let active = true;
    void invoke<InstalledApplication[]>("list_applications")
      .then((apps) => {
        if (!active) return;
        setIsNative(true);
        setInstalledApps(apps);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isNative) return;

    let active = true;
    const updateMetrics = async () => {
      try {
        const next = await invoke<Metric>("read_metrics");
        if (!active) return;

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
      } catch {
        // Keep showing the last successful sample.
      }
    };

    void updateMetrics();
    const timer = window.setInterval(updateMetrics, 1800);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isNative]);

  return { metrics, history, isNative, installedApps };
}
