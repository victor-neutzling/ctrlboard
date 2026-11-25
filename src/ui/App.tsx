import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openNativeFilePicker } from "@tauri-apps/plugin-dialog";
import { ControlsScreen } from "./components/screens/ControlsScreen";
import { GaugesScreen } from "./components/screens/GaugesScreen";
import { LauncherScreen } from "./components/screens/LauncherScreen";
import { PowerConfirmation } from "./components/PowerConfirmation";
import { Toast } from "./components/Toast";
import { applications } from "./data/applications";
import { configureAudioFeedback } from "./audioFeedback";
import { setLongPressDuration } from "./hooks/useLongPress";
import { accentValue, SettingsWindow } from "./settings/SettingsWindow";
import { useButtonFeedback } from "./hooks/useButtonFeedback";
import { useDesktopControls } from "./hooks/useDesktopControls";
import { useScreenSwipe } from "./hooks/useScreenSwipe";
import { useSystemMetrics } from "./hooks/useSystemMetrics";
import { defaultAppPreferences } from "./types";
import type { AppPreferences, GaugeId, PowerAction, Screen } from "./types";

export default function App() {
  if (isTauri() && getCurrentWindow().label === "settings") return <SettingsWindow />;
  return <Dashboard />;
}

function Dashboard() {
  const [screen, setScreen] = useState<Screen>("deck");
  const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [launcherEditing, setLauncherEditing] = useState(false);
  const [gaugeEditing, setGaugeEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<PowerAction | null>(null);
  const screenTrackRef = useRef<HTMLDivElement>(null);

  const { metrics, history, isNative, installedApps } = useSystemMetrics();
  useEffect(() => {
    if (screen !== "deck") setLauncherEditing(false);
  }, [screen]);
  const launcherApps = useMemo(() => preferences.launcher_app_ids.flatMap((id) => {
    const app = installedApps.find((candidate) => candidate.desktop_id === id);
    return app ? [app] : [];
  }), [installedApps, preferences.launcher_app_ids]);
  const swipe = useScreenSwipe(screen, setScreen, screenTrackRef);
  const feedback = useButtonFeedback();
  const accent = accentValue(preferences.accent_color);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const persistPreferences = useCallback((next: AppPreferences) => {
    setPreferences(next);
    void invoke("save_app_preferences", { preferences: next }).catch((error: unknown) => notify(`Could not save settings: ${String(error)}`));
  }, [notify]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<AppPreferences>("preferences-updated", (event) => {
      if (active) setPreferences(event.payload);
    }).then((stop) => { unlisten = stop; });
    void invoke<AppPreferences>("load_app_preferences").then((stored) => {
      if (!active) return;
      setPreferences(stored);
      setScreen(stored.start_screen);
      setPreferencesLoaded(true);
    }).catch((error: unknown) => {
      if (active) {
        setPreferencesLoaded(true);
        notify(`Could not load settings: ${String(error)}`);
      }
    });
    return () => { active = false; unlisten?.(); };
  }, [notify]);

  useEffect(() => {
    if (!preferencesLoaded || !isNative || preferences.initialized) return;
    let launcherAppIds: string[];
    const legacy = localStorage.getItem("ctrlboard.launcher.apps");
    if (legacy !== null) {
      try { launcherAppIds = JSON.parse(legacy) as string[]; }
      catch { launcherAppIds = []; }
      localStorage.removeItem("ctrlboard.launcher.apps");
    } else {
      launcherAppIds = applications.flatMap((app) => {
        const found = installedApps.find((candidate) => candidate.desktop_id.toLowerCase().includes(app.match));
        return found ? [found.desktop_id] : [];
      });
    }
    persistPreferences({ ...preferences, initialized: true, launcher_app_ids: launcherAppIds });
  }, [installedApps, isNative, persistPreferences, preferences, preferencesLoaded]);

  useEffect(() => {
    configureAudioFeedback(preferences.sound_enabled, preferences.sound_volume);
    setLongPressDuration(preferences.long_press_duration_ms);
  }, [preferences.long_press_duration_ms, preferences.sound_enabled, preferences.sound_volume]);

  const {
    controls,
    setVolume,
    setMuted,
    setBrightness,
    setAudioOutput,
    setKeyboardLayout,
  } = useDesktopControls(notify, screen === "controls");

  const launchApplication = useCallback(async (desktopId: string) => {
    const application = installedApps.find((candidate) => candidate.desktop_id === desktopId);
    if (isNative && application) {
      try {
        await invoke("launch_application", { desktopId });
        notify(`Launching ${application.name}`);
      } catch {
        notify(`Could not launch ${application.name}`);
      }
      return;
    }

    notify(application ? `${application.name} · preview action` : "Application is no longer installed");
  }, [installedApps, isNative, notify]);

  const addLauncherApp = (id: string) => persistPreferences({ ...preferences, launcher_app_ids: Array.from(new Set([...preferences.launcher_app_ids, id])) });
  const removeLauncherApp = (id: string) => persistPreferences({ ...preferences, launcher_app_ids: preferences.launcher_app_ids.filter((item) => item !== id) });
  const removeGauge = (id: GaugeId) => {
    const visibleGauges = preferences.visible_gauges.filter((item) => item !== id);
    if (visibleGauges.length > 0) persistPreferences({ ...preferences, visible_gauges: visibleGauges });
  };
  const pickLauncherApp = async () => {
    if (!isNative) {
      notify("The native app selector is available in the desktop app");
      return;
    }
    try {
      const path = await openNativeFilePicker({
        title: "Choose an application to add",
        defaultPath: "/usr/share/applications",
        filters: [{ name: "Linux application launchers", extensions: ["desktop"] }],
      });
      if (!path || Array.isArray(path)) return;
      const desktopId = path.split(/[\\/]/).pop();
      const application = installedApps.find((candidate) => candidate.desktop_id === desktopId);
      if (!application) {
        notify("Choose an installed .desktop application launcher");
        return;
      }
      if (preferences.launcher_app_ids.length >= 12) {
        notify("The launcher can hold up to 12 apps");
        return;
      }
      if (preferences.launcher_app_ids.includes(application.desktop_id)) {
        notify(`${application.name} is already in the launcher`);
        return;
      }
      addLauncherApp(application.desktop_id);
    } catch (error) {
      notify(`Could not open the application selector: ${String(error)}`);
    }
  };

  const performPowerAction = async (action: PowerAction) => {
    if (!preferences.power_enabled) return;
    if (!isNative) {
      notify(`${action} · preview action`);
      return;
    }

    try {
      await invoke("run_system_action", { action });
      notify(`${action} requested`);
    } catch (error) {
      notify(String(error));
    }
  };

  const runPowerAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);
    await performPowerAction(action);
  };

  const requestPowerAction = (action: PowerAction) => {
    if (preferences.confirm_power_actions) setPendingAction(action);
    else void performPowerAction(action);
  };

  const openSettingsWindow = async (section?: string) => {
    try { await invoke("open_settings_window", { section: section ?? null }); }
    catch (error) { notify(`Could not open settings: ${String(error)}`); }
  };

  const handleClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-long-press-triggered='true']")
    ) {
      (event.target.closest("[data-long-press-triggered='true']") as HTMLElement)
        .removeAttribute("data-long-press-triggered");
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (swipe.consumeSuppressedClick()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    feedback.onClickCapture(event);
  };

  const screens: Record<Screen, ReactNode> = {
    controls: (
      <ControlsScreen
        volume={controls.volume_percent}
        muted={controls.muted}
        onVolumeChange={setVolume}
        onMuteToggle={() => setMuted(!controls.muted)}
        brightness={controls.brightness_percent}
        onBrightnessChange={setBrightness}
        audioOutputs={controls.audio_outputs}
        currentAudioOutput={controls.current_audio_output}
        onSelectAudioOutput={setAudioOutput}
        keyboardLayouts={controls.keyboard_layouts}
        currentKeyboardLayout={controls.current_keyboard_layout}
        onSelectKeyboardLayout={setKeyboardLayout}
        theme={preferences.theme}
        visualStyle={preferences.visual_style}
        accent={accent}
        powerEnabled={preferences.power_enabled}
        onTogglePowerEnabled={() => persistPreferences({ ...preferences, power_enabled: !preferences.power_enabled })}
        onOpenSettings={() => void openSettingsWindow()}
        onRequestPowerAction={requestPowerAction}
      />
    ),
    deck: <LauncherScreen
      apps={launcherApps}
      theme={preferences.theme}
      visualStyle={preferences.visual_style}
      accent={accent}
      editing={launcherEditing}
      onEdit={() => setLauncherEditing(true)}
      onDone={() => setLauncherEditing(false)}
      onLaunch={(id) => void launchApplication(id)}
      onPickApp={() => void pickLauncherApp()}
      onRemove={removeLauncherApp}
    />,
    gauges: (
      <GaugesScreen
        metrics={metrics}
        history={history}
        light={preferences.theme === "light"}
        visibleGauges={preferences.visible_gauges}
        compactMode={preferences.compact_gauge_mode}
        active={screen === "gauges"}
        theme={preferences.theme}
        visualStyle={preferences.visual_style}
        accent={accent}
        editing={gaugeEditing}
        onEdit={() => setGaugeEditing(true)}
        onDone={() => setGaugeEditing(false)}
        onRemoveGauge={removeGauge}
        onOpenGaugeSettings={() => { setGaugeEditing(false); void openSettingsWindow("gauges"); }}
      />
    ),
  };

  return (
    <div className={`app-shell theme-${preferences.theme} style-${preferences.visual_style}`} style={{ "--accent": accent } as CSSProperties}>
      <main
        className="screen-content"
        onPointerDownCapture={feedback.onPointerDownCapture}
        onKeyDownCapture={feedback.onKeyDownCapture}
        onPointerDown={swipe.onPointerDown}
        onPointerMove={swipe.onPointerMove}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerCancel}
        onClickCapture={handleClickCapture}
      >
        <div ref={screenTrackRef} className="screen-track" data-screen={screen}>
          {(["controls", "deck", "gauges"] as Screen[]).map((page) => (
            <div
              key={page}
              className={`screen-page ${page === "gauges" ? "gauge-screen-page" : ""}`}
              aria-hidden={screen !== page}
              inert={screen !== page}
            >
              {screens[page]}
            </div>
          ))}
        </div>
      </main>
      <Toast message={toast} />
      {pendingAction && (
        <PowerConfirmation
          action={pendingAction}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void runPowerAction()}
        />
      )}
    </div>
  );
}
