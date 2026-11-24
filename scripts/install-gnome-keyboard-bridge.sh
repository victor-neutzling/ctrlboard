#!/usr/bin/env sh
set -eu

extension_id='ctrlboard-keyboard@ctrlboard'
source_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../integrations/gnome-shell/$extension_id" && pwd)"
extensions_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
destination="$extensions_dir/$extension_id"

mkdir -p "$destination"
cp -R "$source_dir/." "$destination/"

if ! gnome-extensions enable "$extension_id"; then
  # GNOME Shell only discovers new extension directories during startup. If
  # this extension was copied during the current session, queue it in the
  # enabled list so it becomes active after the next login.
  current_extensions="$(gsettings get org.gnome.shell enabled-extensions)"
  updated_extensions="$(printf '%s' "$current_extensions" | python3 -c '
import ast
import sys

extensions = ast.literal_eval(sys.stdin.read())
extension_id = sys.argv[1]
if extension_id not in extensions:
    extensions.append(extension_id)
print("[" + ", ".join(repr(extension) for extension in extensions) + "]")
' "$extension_id")"
  gsettings set org.gnome.shell enabled-extensions "$updated_extensions"
  printf 'Installed %s and queued it for the next GNOME login.\n' "$extension_id"
else
  printf 'Installed and enabled %s. Log out and back in if the bridge is not available yet.\n' "$extension_id"
fi
