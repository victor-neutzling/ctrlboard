export type Screen = "gauges" | "deck" | "controls";
export type Theme = "light" | "dark" | "contrast";
export type PowerAction = "logout" | "lock" | "shutdown" | "restart";

export type MetricKey =
  | "fps"
  | "cpu_percent"
  | "gpu_percent"
  | "storage_percent"
  | "disk_read_bytes_sec"
  | "disk_write_bytes_sec";

export type Metric = {
  cpu_percent: number | null;
  gpu_percent: number | null;
  storage_percent: number | null;
  storage_used_gb: number | null;
  storage_total_gb: number | null;
  disk_read_bytes_sec: number | null;
  disk_write_bytes_sec: number | null;
  fps: number | null;
};

export type MetricHistory = Record<MetricKey, number[]>;

export type Application = {
  name: string;
  icon: string;
  tone: string;
  match: string;
};

export type AudioOutput = {
  id: string;
  label: string;
  is_default: boolean;
};

export type ApplicationVolume = {
  id: number;
  label: string;
  volume_percent: number;
};

export type KeyboardLayout = {
  index: number;
  label: string;
  short_label: string;
};

export type SystemControlsState = {
  volume_percent: number | null;
  muted: boolean;
  brightness_percent: number | null;
  audio_outputs: AudioOutput[];
  current_audio_output: string | null;
  keyboard_layouts: KeyboardLayout[];
  current_keyboard_layout: number | null;
};
