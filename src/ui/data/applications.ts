import type { Application } from "../types";

export const applications: Application[] = [
  { name: "Firefox", icon: "◉", tone: "firefox", match: "firefox" },
  { name: "Discord", icon: "◕", tone: "discord", match: "discord" },
  { name: "Spotify", icon: "≋", tone: "spotify", match: "spotify" },
  { name: "Steam", icon: "◉", tone: "steam", match: "steam" },
  {
    name: "Visual Studio Code",
    icon: "⌘",
    tone: "vscode",
    match: "code",
  },
  { name: "Files", icon: "▰", tone: "files", match: "org.gnome.nautilus" },
];
