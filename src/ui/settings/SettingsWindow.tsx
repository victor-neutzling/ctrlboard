import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openNativeFilePicker } from "@tauri-apps/plugin-dialog";
import type { AccentColor, AppPreferences, InstalledApplication, Screen, Theme } from "../types";

const sections = [
  ["appearance", "Appearance"],
  ["feedback", "Feedback"],
  ["controls", "Controls"],
  ["launcher", "Launcher"],
  ["display", "Display"],
  ["about", "About"],
] as const;

const accents: { id: AccentColor; label: string; color?: string }[] = [
  { id: "system", label: "System" },
  { id: "blue", label: "Blue", color: "#3988e8" },
  { id: "teal", label: "Teal", color: "#2099a7" },
  { id: "green", label: "Green", color: "#3a9a55" },
  { id: "amber", label: "Amber", color: "#ce9200" },
  { id: "orange", label: "Orange", color: "#f06a00" },
  { id: "red", label: "Red", color: "#e43149" },
  { id: "pink", label: "Pink", color: "#d75f9b" },
  { id: "purple", label: "Purple", color: "#9b45b2" },
  { id: "slate", label: "Slate", color: "#77899b" },
];

export function accentValue(accent: AccentColor): string {
  if (accent === "system") return CSS.supports("color", "AccentColor") ? "AccentColor" : "Highlight";
  return accents.find((choice) => choice.id === accent)?.color ?? "#3988e8";
}

export function SettingsWindow() {
  const [section, setSection] = useState<(typeof sections)[number][0]>("appearance");
  const [preferences, setPreferences] = useState<AppPreferences | null>(null);
  const [apps, setApps] = useState<InstalledApplication[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void Promise.all([
      invoke<AppPreferences>("load_app_preferences"),
      invoke<InstalledApplication[]>("list_applications"),
    ]).then(([stored, installed]) => {
      if (!active) return;
      setPreferences(stored);
      setApps(installed);
    }).catch((reason: unknown) => setError(`Could not load settings: ${String(reason)}`));
    void listen<AppPreferences>("preferences-updated", (event) => {
      if (active) setPreferences(event.payload);
    }).then((stop) => { unlisten = stop; });
    return () => { active = false; unlisten?.(); };
  }, []);

  const selectedApps = useMemo(() => {
    const ids = new Set(preferences?.launcher_app_ids ?? []);
    return apps.filter((app) => ids.has(app.desktop_id));
  }, [apps, preferences?.launcher_app_ids]);

  const save = async (changes: Partial<AppPreferences>) => {
    if (!preferences) return;
    const next = { ...preferences, ...changes };
    setPreferences(next);
    setError("");
    setStatus("");
    try {
      await invoke("save_app_preferences", { preferences: next });
      setStatus("Saved");
    } catch (reason) {
      setError(`Could not save settings: ${String(reason)}`);
    }
  };

  const chooseApp = async () => {
    if (!preferences || preferences.launcher_app_ids.length >= 12) return;
    try {
      const path = await openNativeFilePicker({
        title: "Choose an application to add",
        defaultPath: "/usr/share/applications",
        filters: [{ name: "Linux application launchers", extensions: ["desktop"] }],
      });
      if (!path || Array.isArray(path)) return;
      const desktopId = path.split(/[\\/]/).pop();
      const app = apps.find((candidate) => candidate.desktop_id === desktopId);
      if (!app) {
        setError("Choose an installed .desktop application launcher.");
        return;
      }
      if (preferences.launcher_app_ids.includes(app.desktop_id)) {
        setError(`${app.name} is already in the launcher.`);
        return;
      }
      await save({ launcher_app_ids: [...preferences.launcher_app_ids, app.desktop_id] });
    } catch (reason) {
      setError(`Could not open the application selector: ${String(reason)}`);
    }
  };

  const removeApp = (app: InstalledApplication) => {
    if (!preferences) return;
    void save({ launcher_app_ids: preferences.launcher_app_ids.filter((id) => id !== app.desktop_id) });
  };

  const applyWindowSize = async () => {
    if (!preferences) return;
    try {
      await invoke("set_main_window_size", { width: preferences.window_width, height: preferences.window_height });
      setStatus("Main window resized");
    } catch (reason) {
      setError(String(reason));
    }
  };

  if (!preferences) return <main className="settings-window-loading">{error || "Loading settings…"}</main>;
  const accent = accentValue(preferences.accent_color);

  return (
    <div className={`settings-window theme-${preferences.theme}`} style={{ "--accent": accent } as CSSProperties}>
      <header className="settings-window-header">
        <div className="settings-brand"><span className="settings-brand-icon">C</span><div><strong>Ctrlboard</strong><small>Settings</small></div></div>
        <nav className="settings-section-nav" aria-label="Settings sections">
          {sections.map(([id, label]) => <button key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}>{label}</button>)}
        </nav>
      </header>

      <main className="settings-window-content">
        <div className="settings-page-heading"><div><p>SETTINGS</p><h1>{sections.find(([id]) => id === section)?.[1]}</h1></div><span role="status">{status}</span></div>

        {section === "appearance" && <>
          <SettingsGroup title="Appearance" description="Choose the colors used throughout Ctrlboard.">
            <fieldset className="settings-fieldset"><legend>Mode</legend><div className="theme-choices">
              {([ ["light", "Light", "☼"], ["dark", "Dark", "☾"], ["contrast", "Midnight", "◐"] ] as const).map(([id, label, icon]) => <button key={id} className={`theme-choice ${preferences.theme === id ? "selected" : ""}`} onClick={() => void save({ theme: id as Theme })} aria-pressed={preferences.theme === id}><span>{icon}</span>{label}</button>)}
            </div></fieldset>
            <fieldset className="settings-fieldset"><legend>Accent color</legend><div className="accent-choices">
              {accents.map((item) => <button key={item.id} className={`accent-choice ${preferences.accent_color === item.id ? "selected" : ""}`} style={{ "--swatch": item.color ?? accentValue(item.id) } as CSSProperties} onClick={() => void save({ accent_color: item.id })} aria-label={`${item.label} accent color`} aria-pressed={preferences.accent_color === item.id}><span>{item.id === "system" ? "A" : ""}</span></button>)}
            </div><p className="settings-hint">System follows the accent color provided by your desktop theme.</p></fieldset>
          </SettingsGroup>
        </>}

        {section === "feedback" && <SettingsGroup title="Sound feedback" description="Control the sounds used for taps and press-and-hold actions.">
          <SettingsSwitch title="Button and hold sounds" detail="Play a tap sound and a double buzz when a hold is recognized." checked={preferences.sound_enabled} onChange={(value) => void save({ sound_enabled: value })} />
          <div className="settings-control-row"><div><strong>Sound level</strong><small>Adjust the volume of interface feedback.</small></div><label className="settings-range"><input type="range" min="0" max="100" value={preferences.sound_volume} disabled={!preferences.sound_enabled} onChange={(event) => void save({ sound_volume: Number(event.target.value) })} aria-label="Sound feedback volume"/><span>{preferences.sound_volume}%</span></label></div>
          <div className="settings-control-row"><div><strong>Press-and-hold delay</strong><small>How long a press must last before it activates.</small></div><select value={preferences.long_press_duration_ms} onChange={(event) => void save({ long_press_duration_ms: Number(event.target.value) })}><option value={400}>Quick · 400 ms</option><option value={560}>Standard · 560 ms</option><option value={750}>Relaxed · 750 ms</option><option value={950}>Long · 950 ms</option></select></div>
        </SettingsGroup>}

        {section === "controls" && <SettingsGroup title="Power controls" description="Choose which power actions are available and how they are confirmed.">
          <SettingsSwitch title="Enable power actions" detail="Show log out, lock, shut down, and restart controls." checked={preferences.power_enabled} onChange={(value) => void save({ power_enabled: value })} />
          <SettingsSwitch title="Confirm power actions" detail="Ask before sending a power action to the desktop session." checked={preferences.confirm_power_actions} onChange={(value) => void save({ confirm_power_actions: value })} />
          <div className="settings-control-row"><div><strong>Startup section</strong><small>Choose the screen shown when Ctrlboard opens.</small></div><select value={preferences.start_screen} onChange={(event) => void save({ start_screen: event.target.value as Screen })}><option value="deck">App launcher</option><option value="gauges">System gauges</option><option value="controls">Controls</option></select></div>
        </SettingsGroup>}

        {section === "launcher" && <SettingsGroup title="App launcher" description="Apps appear in the launcher in this order. You can add up to 12 apps.">
          <div className="settings-app-list">{selectedApps.map((app) => <article className="settings-app-row" key={app.desktop_id}>
            <span className="settings-app-icon">{app.icon ? <img src={app.icon} alt=""/> : app.name.slice(0, 1)}</span>
            <div className="settings-app-info"><strong>{app.name}</strong><small title={app.command}>{app.command || app.desktop_id}</small><small className="settings-app-path" title={app.desktop_path}>{app.desktop_path}</small></div>
            <button className="settings-app-remove" onClick={() => removeApp(app)} aria-label={`Remove ${app.name}`}>Remove</button>
          </article>)}</div>
          <button className="settings-add-app" onClick={() => void chooseApp()} disabled={preferences.launcher_app_ids.length >= 12}><span>+</span>{preferences.launcher_app_ids.length >= 12 ? "Launcher is full" : "Add application…"}</button>
          <p className="settings-hint">The same app list is available from the launcher’s press-and-hold edit mode.</p>
        </SettingsGroup>}

        {section === "display" && <SettingsGroup title="Main window" description="Set the starting size for the touch-screen control panel.">
          <div className="settings-size-fields"><label>Width <span>px</span><input type="number" min="640" max="3840" value={preferences.window_width} onChange={(event) => void save({ window_width: Number(event.target.value) })}/></label><span className="size-times">×</span><label>Height <span>px</span><input type="number" min="420" max="2160" value={preferences.window_height} onChange={(event) => void save({ window_height: Number(event.target.value) })}/></label></div>
          <div className="settings-display-actions"><button className="settings-secondary-button" onClick={() => void save({ window_width: 1024, window_height: 600 })}>Reset to 1024 × 600</button><button className="settings-primary-button" onClick={() => void applyWindowSize()}>Apply to main window</button></div>
          <p className="settings-hint">Changes are saved as your next startup size. Applying resizes the open main window now.</p>
        </SettingsGroup>}

        {section === "about" && <SettingsGroup title="About Ctrlboard" description="A tactile desktop control panel for Linux.">
          <div className="settings-about-row"><span>Version</span><strong>0.1.0</strong></div><div className="settings-about-row"><span>Application launcher</span><strong>FreeDesktop .desktop entries</strong></div><div className="settings-about-row"><span>Settings storage</span><strong>Application config directory</strong></div>
        </SettingsGroup>}

        {error && <p className="settings-error" role="alert">{error}</p>}
      </main>
    </div>
  );
}

function SettingsGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="settings-group"><div className="settings-group-heading"><h2>{title}</h2><p>{description}</p></div><div className="settings-group-body">{children}</div></section>;
}

function SettingsSwitch({ title, detail, checked, onChange }: { title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="settings-control-row"><div><strong>{title}</strong><small>{detail}</small></div><button type="button" className="settings-switch" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} aria-label={title}><span/></button></div>;
}
