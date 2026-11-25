export type Screen = "gauges" | "deck" | "controls";
export type Theme = "light" | "dark" | "contrast";
export type VisualStyle = "glossy" | "flat";
export type GaugeId = "fps" | "cpu" | "gpu" | "disk";
export type AccentColor = "system" | "blue" | "teal" | "green" | "amber" | "orange" | "red" | "pink" | "purple" | "slate";
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

export type AppPreferences = {
  initialized: boolean;
  theme: Theme;
  visual_style: VisualStyle;
  accent_color: AccentColor;
  visible_gauges: GaugeId[];
  compact_gauge_mode: boolean;
  sound_enabled: boolean;
  sound_volume: number;
  long_press_duration_ms: number;
  power_enabled: boolean;
  confirm_power_actions: boolean;
  start_screen: Screen;
  window_width: number;
  window_height: number;
  launcher_app_ids: string[];
};

export type InstalledApplication = {
  desktop_id: string;
  name: string;
  icon: string | null;
  desktop_path: string;
  command: string;
};

export const defaultAppPreferences: AppPreferences = {
  initialized: false,
  theme: "dark",
  visual_style: "glossy",
  accent_color: "blue",
  visible_gauges: ["fps", "cpu", "gpu", "disk"],
  compact_gauge_mode: false,
  sound_enabled: true,
  sound_volume: 65,
  long_press_duration_ms: 560,
  power_enabled: false,
  confirm_power_actions: true,
  start_screen: "deck",
  window_width: 1024,
  window_height: 600,
  launcher_app_ids: [],
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
