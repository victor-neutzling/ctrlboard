import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { SystemControlsState } from "../types";

const emptyControls: SystemControlsState = {
  volume_percent: null,
  muted: false,
  brightness_percent: null,
  audio_outputs: [],
  current_audio_output: null,
  keyboard_layouts: [],
  current_keyboard_layout: null,
};

export function useDesktopControls(
  notify: (message: string) => void,
  enabled: boolean,
) {
  const [controls, setControls] = useState(emptyControls);
  const refreshTimer = useRef<number | null>(null);
  const volumeTimer = useRef<number | null>(null);
  const brightnessTimer = useRef<number | null>(null);
  const lastSliderInput = useRef(0);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || !isTauri() || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const next = await invoke<SystemControlsState>("read_system_controls");
      const preserveSliderValues = Date.now() - lastSliderInput.current < 1400;
      setControls((previous) => ({
        ...next,
        volume_percent: preserveSliderValues
          ? previous.volume_percent
          : next.volume_percent,
        brightness_percent: preserveSliderValues
          ? previous.brightness_percent
          : next.brightness_percent,
        muted: preserveSliderValues ? previous.muted : next.muted,
      }));
    } catch (error) {
      notify(`Could not read system controls: ${String(error)}`);
    } finally {
      refreshInFlight.current = false;
    }
  }, [enabled, notify]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    refreshTimer.current = timer;
    return () => {
      window.clearInterval(timer);
      if (refreshTimer.current === timer) refreshTimer.current = null;
      if (volumeTimer.current != null) window.clearTimeout(volumeTimer.current);
      if (brightnessTimer.current != null)
        window.clearTimeout(brightnessTimer.current);
    };
  }, [enabled, refresh]);

  const setVolume = useCallback((percent: number) => {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    lastSliderInput.current = Date.now();
    setControls((previous) => ({ ...previous, volume_percent: value, muted: false }));
    if (volumeTimer.current != null) window.clearTimeout(volumeTimer.current);
    volumeTimer.current = window.setTimeout(() => {
      void invoke("set_audio_volume", { percent: value })
        .catch((error: unknown) =>
          notify(`Could not set volume: ${String(error)}`),
        );
    }, 180);
  }, [notify]);

  const setBrightness = useCallback((percent: number) => {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    lastSliderInput.current = Date.now();
    setControls((previous) => ({ ...previous, brightness_percent: value }));
    if (brightnessTimer.current != null)
      window.clearTimeout(brightnessTimer.current);
    brightnessTimer.current = window.setTimeout(() => {
      void invoke("set_display_brightness", { percent: value })
        .catch((error: unknown) =>
          notify(`Could not set brightness: ${String(error)}`),
        );
    }, 180);
  }, [notify]);

  const setMuted = useCallback((muted: boolean) => {
    setControls((previous) => ({ ...previous, muted }));
    void invoke("set_audio_muted", { muted })
      .then(() => refresh())
      .catch((error: unknown) => {
        notify(`Could not change mute state: ${String(error)}`);
        void refresh();
      });
  }, [notify, refresh]);

  const setAudioOutput = useCallback((id: string) => {
    setControls((previous) => ({ ...previous, current_audio_output: id }));
    void invoke("set_default_audio_output", { id })
      .then(() => refresh())
      .catch((error: unknown) => {
        notify(`Could not change audio output: ${String(error)}`);
        void refresh();
      });
  }, [notify, refresh]);

  const setKeyboardLayout = useCallback((index: number) => {
    setControls((previous) => ({ ...previous, current_keyboard_layout: index }));
    void invoke("set_keyboard_layout", { index })
      .then(() => refresh())
      .catch((error: unknown) => {
        notify(`Could not change keyboard layout: ${String(error)}`);
        void refresh();
      });
  }, [notify, refresh]);

  return {
    controls,
    setVolume,
    setMuted,
    setBrightness,
    setAudioOutput,
    setKeyboardLayout,
  };
}
