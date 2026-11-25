import { memo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLongPress } from "../../hooks/useLongPress";
import type { InstalledApplication, Theme, VisualStyle } from "../../types";

type Props = {
  apps: InstalledApplication[];
  theme: Theme;
  visualStyle: VisualStyle;
  accent: string;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onLaunch: (desktopId: string) => void;
  onPickApp: () => void;
  onRemove: (desktopId: string) => void;
};

const MAX_LAUNCHER_APPS = 12;

export const LauncherScreen = memo(function LauncherScreen({ apps, theme, visualStyle, accent, editing, onEdit, onDone, onLaunch, onPickApp, onRemove }: Props) {
  const [pendingRemoval, setPendingRemoval] = useState<InstalledApplication | null>(null);
  const hold = useLongPress(() => onEdit());
  const canAddApps = apps.length < MAX_LAUNCHER_APPS;
  const cardCount = apps.length + (editing && canAddApps ? 1 : 0) || 1;
  const columns = cardCount <= 6 ? 3 : cardCount <= 12 ? 4 : 5;
  const gridStyle = { "--launcher-columns": columns, "--launcher-rows": Math.ceil(cardCount / columns) } as CSSProperties;
  const openAppPicker = () => { onEdit(); onPickApp(); };

  return (
    <section className={`deck-screen ${editing ? "launcher-editing" : ""}`}>
      <div className="app-grid" style={gridStyle}>
        {apps.map((app) => (
          <div key={app.desktop_id} className="launcher-card-wrap">
            <button type="button" className="app-card" {...hold} onClick={() => editing ? onDone() : onLaunch(app.desktop_id)} aria-label={app.name}>
              <span className="app-icon launcher-icon">{app.icon ? <img src={app.icon} alt="" /> : <span>{app.name.slice(0, 1).toUpperCase()}</span>}</span>
              <span className="app-name">{app.name}</span>
            </button>
            {editing && <button className="app-remove" aria-label={`Remove ${app.name}`} onClick={() => setPendingRemoval(app)}>−</button>}
          </div>
        ))}
        {editing && canAddApps && <button type="button" className="app-card app-add" onClick={onPickApp} aria-label="Add an app to launcher">
          <span className="app-add-icon">+</span>
        </button>}
        {apps.length === 0 && !editing && <button className="launcher-empty" onClick={openAppPicker}>Your launcher is empty. <strong>Tap here to add an app</strong>.</button>}
      </div>
      {pendingRemoval && createPortal(<div className={`launcher-modal-layer theme-${theme} style-${visualStyle}`} style={{ "--accent": accent } as CSSProperties} onPointerDown={(event) => { if (event.target === event.currentTarget) setPendingRemoval(null); }}>
        <section className="launcher-modal settings-panel" role="alertdialog" aria-modal="true" aria-label="Remove app">
          <h2>Remove {pendingRemoval.name}?</h2><p className="launcher-modal-message">This removes the app from your launcher. You can add it again at any time.</p>
          <div className="launcher-modal-actions"><button className="launcher-secondary" onClick={() => setPendingRemoval(null)}>Cancel</button><button className="launcher-danger" onClick={() => { onRemove(pendingRemoval.desktop_id); setPendingRemoval(null); }}>Remove</button></div>
        </section>
      </div>, document.body)}
    </section>
  );
});
