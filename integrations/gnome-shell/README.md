# GNOME keyboard bridge

GNOME Shell does not provide a supported external API for selecting an input
source. The bundled extension exposes a small session D-Bus method that calls
GNOME's own input-source manager. It only selects entries already configured
in GNOME Settings.

Install the bridge for the current user with:

```sh
./scripts/install-gnome-keyboard-bridge.sh
```

The installer enables the bridge immediately when GNOME has discovered it. If
the running shell has not scanned the new extension directory yet, it queues the
extension and enables it after the next login.
The bridge is not needed on KDE Plasma, which exposes layout switching through
its keyboard-layout D-Bus interface.
