import { memo } from "react";
import { applications } from "../../data/applications";

type Props = { onLaunch: (index: number) => void };

export const LauncherScreen = memo(function LauncherScreen({ onLaunch }: Props) {
  return (
    <section className="deck-screen">
      <div className="app-grid">
        {applications.map((app, index) => (
          <button
            key={app.name}
            className="app-card"
            onClick={() => onLaunch(index)}
            aria-label={app.name}
          >
            <span className={`app-icon ${app.tone}`}>{app.icon}</span>
            <span className="app-name">
              {app.name === "Visual Studio Code" ? "Code" : app.name}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
});
