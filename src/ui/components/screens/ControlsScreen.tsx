import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { ControlPopover } from "../ControlPopover";
import { useLongPress } from "../../hooks/useLongPress";
import type { PowerAction, Theme, VisualStyle } from "../../types";
import type { ApplicationVolume, AudioOutput, KeyboardLayout } from "../../types";

type OpenPopover = {
  kind: "applications" | "settings";
  section?: "audio" | "keyboard" | "power";
  anchor: HTMLElement;
};

type Props = {
  volume: number | null;
  muted: boolean;
  onVolumeChange: (value: number) => void;
  onMuteToggle: () => void;
  brightness: number | null;
  onBrightnessChange: (value: number) => void;
  audioOutputs: AudioOutput[];
  currentAudioOutput: string | null;
  onSelectAudioOutput: (id: string) => void;
  keyboardLayouts: KeyboardLayout[];
  currentKeyboardLayout: number | null;
  onSelectKeyboardLayout: (index: number) => void;
  theme: Theme;
  visualStyle: VisualStyle;
  accent: string;
  powerEnabled: boolean;
  onTogglePowerEnabled: () => void;
  onOpenSettings: () => void;
  onRequestPowerAction: (action: PowerAction) => void;
};

export function ControlsScreen({
  volume,
  muted,
  onVolumeChange,
  onMuteToggle,
  brightness,
  onBrightnessChange,
  audioOutputs,
  currentAudioOutput,
  onSelectAudioOutput,
  keyboardLayouts,
  currentKeyboardLayout,
  onSelectKeyboardLayout,
  theme,
  visualStyle,
  accent,
  powerEnabled,
  onTogglePowerEnabled,
  onOpenSettings,
  onRequestPowerAction,
}: Props) {
  const displayedVolume = volume ?? 0;
  const displayedBrightness = brightness ?? 0;
  const [popover, setPopover] = useState<OpenPopover | null>(null);
  const openFromHold = useCallback((target: HTMLElement) => {
    const kind = target.dataset.holdKind;
    if (kind === "applications") {
      setPopover({ kind, anchor: target });
      return;
    }
    const section = target.dataset.holdSection as OpenPopover["section"];
    if (kind === "settings" && section) setPopover({ kind, section, anchor: target });
  }, []);
  const hold = useLongPress(openFromHold);

  const openSystemSettings = async (section: NonNullable<OpenPopover["section"]>) => {
    if (!isTauri()) return;
    await invoke("open_system_settings", { section });
  };

  return (
    <section className="controls-screen">
      <article className="levels-panel settings-panel">
        <div className="level-row">
          <button
            type="button"
            className="control-icon volume-icon level-action"
            {...hold}
            data-hold-kind="applications"
            onClick={onMuteToggle}
            disabled={volume == null}
            aria-label={muted ? "Unmute volume" : "Mute volume"}
          >
            {muted ? (
              "×"
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
                <path d="M16 9a5 5 0 0 1 0 6M18.5 6.5a9 9 0 0 1 0 11" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={displayedVolume}
            disabled={volume == null}
            style={{ "--range-value": `${displayedVolume}%` } as CSSProperties}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            aria-label="Output volume"
          />
          <span className="range-value">
            {volume == null ? "—" : volume}
            <small>%</small>
          </span>
        </div>
        <div className="level-row">
          <button
            type="button"
            className="control-icon brightness-icon level-action"
            {...hold}
            data-hold-kind="settings"
            data-hold-section="power"
            onClick={() => onBrightnessChange(100)}
            disabled={brightness == null}
            aria-label="Set full display brightness"
          >
            ☼
          </button>
          <input
            type="range"
            min="0"
            max="100"
            value={displayedBrightness}
            disabled={brightness == null}
            style={
              {
                "--range-value": `${displayedBrightness}%`,
              } as CSSProperties
            }
            onChange={(event) => onBrightnessChange(Number(event.target.value))}
            aria-label="Display brightness"
          />
          <span className="range-value">
            {brightness == null ? "—" : brightness}
            <small>%</small>
          </span>
        </div>
      </article>

      <div className="settings-grid">
        <article className="settings-panel">
          <h2>Audio output</h2>
          <div className="choice-list">
            {audioOutputs.map((item, index) => (
              <button
                key={item.id}
                {...hold}
                data-hold-kind="settings"
                data-hold-section="audio"
                className={`choice-row ${currentAudioOutput === item.id ? "chosen" : ""}`}
                onClick={() => onSelectAudioOutput(item.id)}
                aria-pressed={currentAudioOutput === item.id}
                aria-label={`Set ${item.label} as the audio output`}
                title={item.label}
              >
                <span className="choice-icon" aria-hidden="true">
                  {index ? "♬" : "◖"}
                </span>
                <strong>{item.label}</strong>
              </button>
            ))}
            {audioOutputs.length === 0 && (
              <p className="control-empty">No audio outputs detected</p>
            )}
          </div>
        </article>

        <article className="settings-panel">
          <h2>Keyboard layout</h2>
          <div className="layout-options">
            {keyboardLayouts.map((item) => (
              <button
                key={item.index}
                {...hold}
                data-hold-kind="settings"
                data-hold-section="keyboard"
                className={`layout-key ${currentKeyboardLayout === item.index ? "selected" : ""}`}
                onClick={() => onSelectKeyboardLayout(item.index)}
                aria-pressed={currentKeyboardLayout === item.index}
                aria-label={`Switch to ${item.label} keyboard layout`}
                title={item.label}
              >
                {item.short_label}
              </button>
            ))}
            {keyboardLayouts.length === 0 && (
              <p className="control-empty">No configured layouts found</p>
            )}
          </div>
        </article>

        <article className="settings-panel power-panel">
          <div className="power-heading">
            <h2>Power</h2>
            <div className="power-heading-actions">
              <button
              type="button"
              className="safety-toggle"
              role="switch"
              aria-checked={powerEnabled}
              aria-label={
                powerEnabled
                  ? "Disable power actions"
                  : "Enable power actions"
              }
              onClick={onTogglePowerEnabled}
            >
              <span className="toggle-track" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="power-actions">
            <button type="button" className="power-action settings-power-action" onClick={onOpenSettings} aria-label="Open application settings" title="Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.2-2-3.4-2.2 1a7.6 7.6 0 0 0-2.6-1.5L14.3 3h-4.6l-.3 2.4a7.6 7.6 0 0 0-2.6 1.5l-2.2-1-2 3.4 2 1.2a7.6 7.6 0 0 0 0 3l-2 1.2 2 3.4 2.2-1a7.6 7.6 0 0 0 2.6 1.5l.3 2.4h4.6l.3-2.4a7.6 7.6 0 0 0 2.6-1.5l2.2 1 2-3.4-2-1.2Z" />
                <circle cx="12" cy="12" r="3.2" />
              </svg>
            </button>
            {(
              [
                ["logout", "Log out"],
                ["lock", "Lock"],
                ["shutdown", "Shut down"],
                ["restart", "Restart"],
              ] as const
            ).map(([action, label]) => (
              <button
                key={action}
                className={`power-action ${action}`}
                disabled={!powerEnabled}
                onClick={() => onRequestPowerAction(action)}
                aria-label={label}
              >
                {action === "restart" ? (
                  <span aria-hidden="true">↻</span>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    {action === "logout" && (
                      <>
                        <path d="M10 4H5v16h5" />
                        <path d="M13 8l5 4-5 4m5-4H9" />
                      </>
                    )}
                    {action === "lock" && (
                      <>
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                        <path d="M12 14v3" />
                      </>
                    )}
                    {action === "shutdown" && (
                      <>
                        <path d="M12 3v9" />
                        <path d="M7 6.5a8 8 0 1 0 10 0" />
                      </>
                    )}
                  </svg>
                )}
              </button>
            ))}
          </div>
        </article>
      </div>
      {popover && (
        <ControlPopover
          anchor={popover.anchor}
          theme={theme}
          visualStyle={visualStyle}
          accent={accent}
          title={popover.kind === "applications" ? "Application volume" : `${popover.section} settings`}
          onClose={() => setPopover(null)}
        >
          {popover.kind === "applications" ? (
            <>
              <MediaTransportControls />
              <ApplicationVolumeControls />
            </>
          ) : (
            <SettingsShortcut
              section={popover.section!}
              onOpen={openSystemSettings}
            />
          )}
        </ControlPopover>
      )}
    </section>
  );
}

function MediaTransportControls() {
  const [message, setMessage] = useState("");
  const control = async (action: "previous" | "play-pause" | "next" | "stop") => {
    setMessage("");
    try {
      await invoke("control_media_player", { action });
    } catch (error) {
      setMessage(String(error));
    }
  };
  const actions = [
    { id: "previous", label: "Previous track", icon: <><path d="M6 5v14"/><path d="m19 5-10 7 10 7V5Z"/></> },
    { id: "play-pause", label: "Play or pause", icon: <><path d="m8 5 12 7-12 7V5Z"/><path d="M4 5v14"/></> },
    { id: "next", label: "Next track", icon: <><path d="M18 5v14"/><path d="m5 5 10 7-10 7V5Z"/></> },
    { id: "stop", label: "Stop playback", icon: <rect x="6" y="6" width="12" height="12" rx="1"/> },
  ] as const;

  return (
    <div className="media-transport">
      <div className="media-transport-buttons" aria-label="Media playback controls">
        {actions.map(({ id, label, icon }) => (
          <button type="button" className="media-transport-button" key={id} aria-label={label} title={label}
            onClick={() => void control(id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
          </button>
        ))}
      </div>
      {message && <p className="popover-message" role="status">{message}</p>}
    </div>
  );
}

function ApplicationVolumeControls() {
  const [streams, setStreams] = useState<ApplicationVolume[]>([]);
  const [message, setMessage] = useState("Loading active audio…");
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    if (!isTauri()) {
      setMessage("Per-application volume is available in the desktop app.");
      return;
    }
    void invoke<ApplicationVolume[]>("read_application_volumes")
      .then((items) => {
        setStreams(items);
        setMessage(items.length ? "" : "No active application audio.");
      })
      .catch((error: unknown) => setMessage(`Could not read app audio: ${String(error)}`));
    return () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  const changeVolume = (id: number, percent: number) => {
    setStreams((current) => current.map((stream) =>
      stream.id === id ? { ...stream, volume_percent: percent } : stream,
    ));
    const existing = timers.current.get(id);
    if (existing != null) window.clearTimeout(existing);
    timers.current.set(id, window.setTimeout(() => {
      void invoke("set_application_volume", { id, percent })
        .catch((error: unknown) => setMessage(`Could not set app volume: ${String(error)}`));
      timers.current.delete(id);
    }, 160));
  };

  return (
    <div className="application-volume-list">
      {streams.map((stream) => (
        <label className="application-volume-row" key={stream.id}>
          <span className="application-volume-name" title={stream.label}>{stream.label}</span>
          <strong>{stream.volume_percent}%</strong>
          <input
            type="range"
            min="0"
            max="100"
            value={stream.volume_percent}
            aria-label={`${stream.label} volume`}
            onChange={(event) => changeVolume(stream.id, Number(event.target.value))}
          />
        </label>
      ))}
      {message && <p className="popover-message">{message}</p>}
    </div>
  );
}

const settingsPrompts = {
  audio: {
    heading: "Audio settings",
    message: "Open your system’s audio settings to manage sound devices and options.",
    button: "Open Audio Settings",
  },
  keyboard: {
    heading: "Keyboard settings",
    message: "Open your system’s keyboard settings to manage layouts and input options.",
    button: "Open Keyboard Settings",
  },
  power: {
    heading: "Power settings",
    message: "Open your system’s power settings to review battery and power options.",
    button: "Open Power Settings",
  },
};

function SettingsShortcut({
  section,
  onOpen,
}: {
  section: NonNullable<OpenPopover["section"]>;
  onOpen: (section: NonNullable<OpenPopover["section"]>) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const prompt = settingsPrompts[section];
  const open = async () => {
    if (!isTauri()) {
      setError("This shortcut is available in the desktop app.");
      return;
    }
    try {
      await onOpen(section);
    } catch (reason) {
      setError(`Could not open settings: ${String(reason)}`);
    }
  };
  return (
    <div className="settings-shortcut-content">
      <p>{prompt.message}</p>
      <button type="button" className="popover-action" onClick={() => void open()}>
        {prompt.button}
      </button>
      {error && <p className="popover-message" role="status">{error}</p>}
    </div>
  );
}
