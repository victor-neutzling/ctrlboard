# Ctrlboard

Ctrlboard is a small Linux desktop control panel built for touchscreens. It combines an app launcher, system gauges, and quick controls for audio, display brightness, keyboard layouts, and power actions. It is an early, in-progress project rather than a packaged release.

## Run from source

### Requirements

- Linux (should work on any distro with gnome or kde).
- Node.js and npm.
- Rust and Cargo (install with [rustup](https://rustup.rs/)).
- Tauri's Linux development libraries. On Ubuntu or Debian, install them with:

  ```sh
  sudo apt update
  sudo apt install build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libwebkit2gtk-4.1-dev
  ```

  On Fedora, install the equivalent packages with:

  ```sh
  sudo dnf install gcc-c++ make curl wget file openssl-devel gtk3-devel libappindicator-gtk3-devel librsvg2-devel libwebkit2gtk4.1-devel
  ```

  Other distributions need the equivalent WebKitGTK 4.1, GTK, AppIndicator, librsvg, and build packages. See the [Tauri Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux) for distro-specific package names.

### Install and launch

From the project directory:

```sh
npm install
npm run tauri dev
```

This starts Vite and opens the Ctrlboard desktop window. To build the frontend separately, run `npm run build`.

## Desktop integrations

Some controls depend on tools provided by the desktop or audio session. Ctrlboard checks for PipeWire's `wpctl` and PulseAudio-compatible `pactl` for audio controls. Media playback buttons use `playerctl` (MPRIS). Install these with your distribution's package manager if you want those features and the commands are missing.

On GNOME, selecting keyboard layouts requires the included Shell bridge. Install it for your user with:

```sh
./scripts/install-gnome-keyboard-bridge.sh
```

Log out and back in if the bridge is not available immediately. It selects layouts already configured in GNOME Settings. KDE Plasma uses its keyboard-layout D-Bus interface and does not need this extension.

Brightness and power controls depend on desktop services and permissions. Features unavailable on a particular machine or session may be disabled or report an error.
