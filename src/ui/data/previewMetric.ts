import type { Metric, MetricHistory } from "../types";

export const previewMetric: Metric = {
  cpu_percent: 32,
  gpu_percent: 68,
  storage_percent: 54,
  storage_used_gb: 86,
  storage_total_gb: 160,
  disk_read_bytes_sec: 0,
  disk_write_bytes_sec: 0,
  fps: 144,
};

export const emptyMetricHistory: MetricHistory = {
  fps: [],
  cpu_percent: [],
  gpu_percent: [],
  storage_percent: [],
  disk_read_bytes_sec: [],
  disk_write_bytes_sec: [],
};
