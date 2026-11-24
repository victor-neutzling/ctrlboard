import { useCallback, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { ControlsScreen } from "./components/screens/ControlsScreen";
import { GaugesScreen } from "./components/screens/GaugesScreen";
import { LauncherScreen } from "./components/screens/LauncherScreen";
import { PowerConfirmation } from "./components/PowerConfirmation";
import { Toast } from "./components/Toast";
import { applications } from "./data/applications";
import { useButtonFeedback } from "./hooks/useButtonFeedback";
import { useDesktopControls } from "./hooks/useDesktopControls";
import { useScreenSwipe } from "./hooks/useScreenSwipe";
import { useSystemMetrics } from "./hooks/useSystemMetrics";
import type { PowerAction, Screen, Theme } from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("deck");
  const [theme, setTheme] = useState<Theme>("dark");
  const [toast, setToast] = useState("");
  const [powerEnabled, setPowerEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState<PowerAction | null>(null);
  const screenTrackRef = useRef<HTMLDivElement>(null);

  const { metrics, history, isNative, installedApps } = useSystemMetrics();
  const swipe = useScreenSwipe(screen, setScreen, screenTrackRef);
  const feedback = useButtonFeedback();

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const {
    controls,
    setVolume,
    setMuted,
    setBrightness,
    setAudioOutput,
    setKeyboardLayout,
  } = useDesktopControls(notify, screen === "controls");

  const launchApplication = useCallback(async (index: number) => {
    const application = applications[index];
    const desktopId = installedApps.find((candidate) =>
      candidate.toLowerCase().includes(application.match),
    );

    if (isNative && desktopId) {
      try {
        await invoke("launch_application", { desktopId });
        notify(`Launching ${desktopId.replace(/\.desktop$/, "")}`);
      } catch {
        notify(`Could not launch ${desktopId}`);
      }
      return;
    }

    notify(
      isNative
        ? `${application.name} is not installed`
        : `${application.name} · preview action`,
    );
  }, [installedApps, isNative, notify]);

  const resizeWindowForDebug = async () => {
    if (!isTauri()) {
      notify("Window resizing is available in the desktop app");
      return;
    }

    try {
      await getCurrentWindow().setSize(new LogicalSize(1024, 600));
      notify("Window resized to 1024 × 600");
    } catch (error) {
      notify(`Could not resize window: ${String(error)}`);
    }
  };

  const runPowerAction = async () => {
    if (!pendingAction || !powerEnabled) return;
    const action = pendingAction;
    setPendingAction(null);

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
        theme={theme}
        setTheme={setTheme}
        powerEnabled={powerEnabled}
        setPowerEnabled={setPowerEnabled}
        onResizeWindow={() => void resizeWindowForDebug()}
        onRequestPowerAction={setPendingAction}
      />
    ),
    deck: <LauncherScreen onLaunch={(index) => void launchApplication(index)} />,
    gauges: (
      <GaugesScreen
        metrics={metrics}
        history={history}
        light={theme === "light"}
      />
    ),
  };

  return (
    <div className={`app-shell theme-${theme}`}>
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
              className="screen-page"
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
