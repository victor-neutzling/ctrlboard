use serde::Serialize;
use serde_json::Value;
use std::{fs, process::Command};

#[derive(Serialize)]
pub struct AudioOutput {
    id: String,
    label: String,
    is_default: bool,
}

#[derive(Serialize)]
pub struct ApplicationVolume {
    id: u32,
    label: String,
    volume_percent: u8,
}

#[derive(Serialize)]
pub struct KeyboardLayout {
    index: usize,
    label: String,
    short_label: String,
}

#[derive(Serialize)]
pub struct SystemControls {
    volume_percent: Option<u8>,
    muted: bool,
    brightness_percent: Option<u8>,
    audio_outputs: Vec<AudioOutput>,
    current_audio_output: Option<String>,
    keyboard_layouts: Vec<KeyboardLayout>,
    current_keyboard_layout: Option<usize>,
}

fn command_output(program: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| format!("Could not start {program}: {error}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_owned())
    } else {
        let details = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(if details.is_empty() {
            format!("{program} exited with {}", output.status)
        } else {
            details
        })
    }
}

fn try_command(program: &str, args: &[&str]) -> Option<String> {
    command_output(program, args).ok()
}

fn wpctl_outputs() -> Option<Vec<AudioOutput>> {
    let listing = command_output("wpctl", &["list", "audio", "sinks"]).ok()?;
    let configured_default = wpctl_configured_default();
    let outputs = listing
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split('\t').map(str::trim).collect();
            let index = fields.first()?.parse::<u32>().ok()?;
            let name = fields.get(1)?.trim_matches('"');
            if name.is_empty() {
                return None;
            }
            let label = wpctl_label(index, name);
            Some(AudioOutput {
                id: format!("wpctl:{index}"),
                label,
                is_default: configured_default.as_deref().map_or_else(
                    || fields.iter().any(|field| *field == "*"),
                    |value| value == name,
                ),
            })
        })
        .collect::<Vec<_>>();
    Some(outputs)
}

fn wpctl_configured_default() -> Option<String> {
    let status = command_output("wpctl", &["status"]).ok()?;
    let configured_devices = status.split_once("Default Configured Devices:")?.1;
    configured_devices
        .lines()
        .find(|line| line.contains("Audio/Sink"))
        .and_then(|line| line.split_whitespace().last())
        .filter(|name| *name != "(none)")
        .map(str::to_owned)
}

fn wpctl_property(details: &str, property: &str) -> Option<String> {
    details.lines().find_map(|line| {
        line.trim()
            .strip_prefix("* ")
            .unwrap_or(line.trim())
            .strip_prefix(property)?
            .strip_prefix(" = ")
            .map(|value| value.trim().trim_matches('"').to_owned())
    })
}

fn wpctl_node_name(index: &str) -> Option<String> {
    let details = command_output("wpctl", &["inspect", index]).ok()?;
    wpctl_property(&details, "node.name")
}

fn compact_audio_description(description: &str) -> Option<String> {
    let (family, endpoint) =
        description.split_once(" On-Package High Definition Audio (HD Audio) ")?;
    let endpoint = endpoint.trim();
    let endpoint = if let Some(number) = endpoint
        .strip_prefix("HDMI / DisplayPort ")
        .and_then(|value| value.split_whitespace().next())
    {
        format!("HDMI {number}")
    } else {
        endpoint
            .strip_suffix(" Output (Stereo)")
            .unwrap_or(endpoint)
            .to_owned()
    };
    Some(format!("{endpoint} - {}", family.trim()))
}

fn wpctl_label(index: u32, fallback_name: &str) -> String {
    let id = index.to_string();
    let Some(details) = command_output("wpctl", &["inspect", &id]).ok() else {
        return friendly_audio_name(fallback_name);
    };
    let nick = wpctl_property(&details, "node.nick");
    let description = wpctl_property(&details, "node.description");
    if let Some(description) = description.as_deref() {
        if let Some(compact) = compact_audio_description(description) {
            if let Some(nick) = nick {
                let family = compact
                    .rsplit_once(" - ")
                    .map(|(_, family)| family)
                    .unwrap_or("");
                return format!("{nick} - {family}");
            }
            return compact;
        }
    }
    nick.or(description)
        .unwrap_or_else(|| friendly_audio_name(fallback_name))
}

fn pactl_outputs() -> Option<Vec<AudioOutput>> {
    let default_name = wpctl_configured_default().or_else(|| {
        try_command("pactl", &["get-default-sink"]).or_else(|| {
            try_command("pactl", &["info"]).and_then(|info| {
                info.lines().find_map(|line| {
                    line.strip_prefix("Default Sink:")
                        .map(str::trim)
                        .map(str::to_owned)
                })
            })
        })
    });

    if let Some(listing) = try_command("pactl", &["-f", "json", "list", "sinks"]) {
        if let Ok(sinks) = serde_json::from_str::<Vec<Value>>(&listing) {
            return Some(
                sinks
                    .iter()
                    .filter(|sink| sink_has_available_output(sink))
                    .filter_map(|sink| {
                        let name = sink.get("name")?.as_str()?;
                        let description = sink
                            .get("description")
                            .and_then(Value::as_str)
                            .filter(|description| !description.is_empty());
                        let label = description
                            .map(|description| {
                                compact_audio_description(description)
                                    .unwrap_or_else(|| description.to_owned())
                            })
                            .unwrap_or_else(|| name.to_owned());
                        let node_id = sink
                            .get("properties")
                            .and_then(|properties| properties.get("object.id"))
                            .and_then(|id| {
                                id.as_str()
                                    .map(str::to_owned)
                                    .or_else(|| id.as_u64().map(|value| value.to_string()))
                            });
                        let id = node_id
                            .map(|node_id| format!("wpctl:{node_id}"))
                            .unwrap_or_else(|| format!("pactl:{name}"));
                        Some(AudioOutput {
                            id,
                            label,
                            is_default: default_name.as_deref() == Some(name),
                        })
                    })
                    .collect(),
            );
        }
    }

    let listing = command_output("pactl", &["list", "short", "sinks"]).ok()?;
    Some(
        listing
            .lines()
            .filter_map(|line| {
                let mut fields = line.split_whitespace();
                let _index = fields.next()?.parse::<u32>().ok()?;
                let name = fields.next()?;
                Some(AudioOutput {
                    id: format!("pactl:{name}"),
                    label: friendly_audio_name(name),
                    is_default: default_name.as_deref() == Some(name),
                })
            })
            .collect(),
    )
}

fn sink_has_available_output(sink: &Value) -> bool {
    let Some(ports) = sink.get("ports").and_then(Value::as_array) else {
        return true;
    };
    if ports.is_empty() {
        return true;
    }

    let availability: Vec<&str> = ports
        .iter()
        .filter_map(|port| port.get("availability").and_then(Value::as_str))
        .collect();
    availability.is_empty()
        || availability
            .iter()
            .any(|status| status.eq_ignore_ascii_case("available"))
        || availability
            .iter()
            .any(|status| !status.eq_ignore_ascii_case("not available"))
}

fn audio_outputs() -> Vec<AudioOutput> {
    pactl_outputs()
        .filter(|outputs| !outputs.is_empty())
        .or_else(wpctl_outputs)
        .unwrap_or_default()
}

fn friendly_audio_name(name: &str) -> String {
    let simplified = name
        .strip_prefix("alsa_output.")
        .or_else(|| name.strip_prefix("bluez_output."))
        .unwrap_or(name)
        .replace(".analog-stereo", "")
        .replace(".iec958-stereo", "")
        .replace('_', " ");
    simplified
        .split_whitespace()
        .map(|part| {
            let mut chars = part.chars();
            chars
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
                .unwrap_or_default()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_wpctl_volume(output: &str) -> Option<(u8, bool)> {
    let muted = output.contains("MUTED");
    let volume = output
        .split_once("Volume:")?
        .1
        .split_whitespace()
        .next()?
        .parse::<f64>()
        .ok()?;
    Some(((volume * 100.0).round().clamp(0.0, 100.0) as u8, muted))
}

fn parse_pactl_volume(output: &str) -> Option<u8> {
    output
        .split_whitespace()
        .find_map(|part| part.strip_suffix('%')?.parse::<u8>().ok())
}

fn audio_volume() -> (Option<u8>, bool) {
    if let Some(output) = try_command("wpctl", &["get-volume", "@DEFAULT_SINK@"]) {
        if let Some(value) = parse_wpctl_volume(&output) {
            return (Some(value.0), value.1);
        }
    }

    let volume = try_command("pactl", &["get-sink-volume", "@DEFAULT_SINK@"])
        .and_then(|v| parse_pactl_volume(&v));
    let muted = try_command("pactl", &["get-sink-mute", "@DEFAULT_SINK@"])
        .is_some_and(|v| v.ends_with("yes"));
    (volume, muted)
}

fn current_output_id(outputs: &[AudioOutput]) -> Option<String> {
    outputs
        .iter()
        .find(|output| output.is_default)
        .map(|output| output.id.clone())
}

fn extract_quoted_strings(value: &str) -> Vec<String> {
    let mut strings = Vec::new();
    let mut current = String::new();
    let mut in_string = false;
    let mut escaped = false;

    for character in value.chars() {
        if !in_string {
            if character == '\'' {
                in_string = true;
                current.clear();
            }
            continue;
        }

        if escaped {
            current.push(character);
            escaped = false;
        } else if character == '\\' {
            escaped = true;
        } else if character == '\'' {
            strings.push(current.clone());
            in_string = false;
        } else {
            current.push(character);
        }
    }
    strings
}

fn layout_label(id: &str) -> (String, String) {
    let pieces: Vec<&str> = id.split('+').collect();
    let short = pieces.first().copied().unwrap_or(id).to_uppercase();
    let full = if pieces.len() > 1 {
        format!("{} · {}", short, pieces[1].replace('_', " "))
    } else {
        short.clone()
    };
    (full, short)
}

fn gnome_keyboard_layouts() -> Option<(Vec<KeyboardLayout>, Option<usize>)> {
    let sources = command_output(
        "gsettings",
        &["get", "org.gnome.desktop.input-sources", "sources"],
    )
    .ok()?;
    let strings = extract_quoted_strings(&sources);
    let layouts: Vec<KeyboardLayout> = strings
        .chunks_exact(2)
        .enumerate()
        .map(|(index, source)| {
            let (label, short_label) = if source[0] == "xkb" {
                layout_label(&source[1])
            } else {
                (source[1].clone(), source[1].to_uppercase())
            };
            KeyboardLayout {
                index,
                label,
                short_label,
            }
        })
        .collect();
    let current = gnome_current_layout(&strings);
    Some((layouts, current))
}

fn gnome_current_layout(sources: &[String]) -> Option<usize> {
    if let Some(index) = try_command(
        "gdbus",
        &[
            "call",
            "--session",
            "--dest",
            "org.ctrlboard.Keyboard",
            "--object-path",
            "/org/ctrlboard/Keyboard",
            "--method",
            "org.ctrlboard.Keyboard.GetCurrent",
        ],
    )
    .and_then(|value| first_number(&value))
    {
        return Some(index);
    }

    let most_recent = try_command(
        "gsettings",
        &["get", "org.gnome.desktop.input-sources", "mru-sources"],
    )
    .map(|value| extract_quoted_strings(&value))?;
    let Some(active_source) = most_recent.get(0..2) else {
        return (!sources.is_empty()).then_some(0);
    };
    sources
        .chunks_exact(2)
        .position(|source| source == active_source)
        .or_else(|| (!sources.is_empty()).then_some(0))
}

fn kde_keyboard_layouts() -> Option<(Vec<KeyboardLayout>, Option<usize>)> {
    let listing = command_output(
        "gdbus",
        &[
            "call",
            "--session",
            "--dest",
            "org.kde.keyboard",
            "--object-path",
            "/Layouts",
            "--method",
            "org.kde.KeyboardLayouts.getLayoutsList",
        ],
    )
    .ok()?;
    let layouts = extract_quoted_strings(&listing)
        .chunks_exact(3)
        .enumerate()
        .map(|(index, fields)| KeyboardLayout {
            index,
            label: fields[2].clone(),
            short_label: fields[0].to_uppercase(),
        })
        .collect();
    let current = try_command(
        "gdbus",
        &[
            "call",
            "--session",
            "--dest",
            "org.kde.keyboard",
            "--object-path",
            "/Layouts",
            "--method",
            "org.kde.KeyboardLayouts.getLayout",
        ],
    )
    .and_then(|value| first_number(&value));
    Some((layouts, current))
}

fn keyboard_layouts() -> (Vec<KeyboardLayout>, Option<usize>) {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if desktop.contains("gnome") {
        return gnome_keyboard_layouts().unwrap_or_default();
    }
    if desktop.contains("kde") || desktop.contains("plasma") {
        return kde_keyboard_layouts().unwrap_or_default();
    }
    gnome_keyboard_layouts()
        .or_else(kde_keyboard_layouts)
        .unwrap_or_default()
}

fn first_number(value: &str) -> Option<usize> {
    value
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse::<usize>().ok())
        .last()
}

fn gnome_brightness() -> Option<u8> {
    let args = [
        "call",
        "--session",
        "--dest",
        "org.gnome.SettingsDaemon.Power",
        "--object-path",
        "/org/gnome/SettingsDaemon/Power",
        "--method",
        "org.gnome.SettingsDaemon.Power.Screen.GetPercentage",
    ];
    try_command("gdbus", &args)
        .or_else(|| {
            try_command(
                "gdbus",
                &[
                    "call",
                    "--session",
                    "--dest",
                    "org.gnome.SettingsDaemon.Power",
                    "--object-path",
                    "/org/gnome/SettingsDaemon/Power",
                    "--method",
                    "org.freedesktop.DBus.Properties.Get",
                    "org.gnome.SettingsDaemon.Power.Screen",
                    "Brightness",
                ],
            )
        })
        .and_then(|value| first_number(&value).map(|n| n.clamp(0, 100) as u8))
}

fn sysfs_backlight() -> Option<(std::path::PathBuf, f64, f64)> {
    let entries = fs::read_dir("/sys/class/backlight").ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(current) = fs::read_to_string(path.join("brightness")) else {
            continue;
        };
        let Ok(maximum) = fs::read_to_string(path.join("max_brightness")) else {
            continue;
        };
        let (Ok(current), Ok(maximum)) =
            (current.trim().parse::<f64>(), maximum.trim().parse::<f64>())
        else {
            continue;
        };
        if maximum > 0.0 {
            return Some((path, current, maximum));
        }
    }
    None
}

fn read_brightness() -> Option<u8> {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if desktop.contains("kde") || desktop.contains("plasma") {
        return kde_brightness().or_else(gnome_brightness).or_else(|| {
            let (_, current, maximum) = sysfs_backlight()?;
            Some((current / maximum * 100.0).round().clamp(0.0, 100.0) as u8)
        });
    }
    sysfs_backlight()
        .map(|(_, current, maximum)| (current / maximum * 100.0).round().clamp(0.0, 100.0) as u8)
        .or_else(gnome_brightness)
}

fn set_logind_backlight(path: &std::path::Path, brightness: u64) -> Result<(), String> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Could not identify the backlight device".to_owned())?;
    let value = format!("uint32 {brightness}");
    command_output(
        "gdbus",
        &[
            "call",
            "--system",
            "--dest",
            "org.freedesktop.login1",
            "--object-path",
            "/org/freedesktop/login1/session/auto",
            "--method",
            "org.freedesktop.login1.Session.SetBrightness",
            "backlight",
            name,
            &value,
        ],
    )?;
    Ok(())
}

fn gnome_brightness_fallback(percent: u8) -> bool {
    let value = format!("<int32 {percent}>");
    let result = Command::new("gdbus")
        .args([
            "call",
            "--session",
            "--dest",
            "org.gnome.SettingsDaemon.Power",
            "--object-path",
            "/org/gnome/SettingsDaemon/Power",
            "--method",
            "org.freedesktop.DBus.Properties.Set",
            "org.gnome.SettingsDaemon.Power.Screen",
            "Brightness",
            &value,
        ])
        .output();
    result.is_ok_and(|output| output.status.success())
}

fn dbus_property(destination: &str, path: &str, interface: &str, property: &str) -> Option<String> {
    try_command(
        "gdbus",
        &[
            "call",
            "--session",
            "--dest",
            destination,
            "--object-path",
            path,
            "--method",
            "org.freedesktop.DBus.Properties.Get",
            interface,
            property,
        ],
    )
}

fn kde_display_path() -> Option<String> {
    const SERVICE: &str = "org.kde.ScreenBrightness";
    const ROOT: &str = "/org/kde/ScreenBrightness";
    const INTERFACE: &str = "org.kde.ScreenBrightness";

    let displays = dbus_property(SERVICE, ROOT, INTERFACE, "DisplaysDBusNames")?;
    let names = extract_quoted_strings(&displays);
    let mut first = None;
    for name in names {
        if name.is_empty()
            || !name
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '_')
        {
            continue;
        }
        let path = format!("{ROOT}/{name}");
        first.get_or_insert_with(|| path.clone());
        if dbus_property(
            SERVICE,
            &path,
            "org.kde.ScreenBrightness.Display",
            "IsInternal",
        )
        .is_some_and(|value| value.contains("true"))
        {
            return Some(path);
        }
    }
    first
}

fn kde_brightness() -> Option<u8> {
    const SERVICE: &str = "org.kde.ScreenBrightness";
    const INTERFACE: &str = "org.kde.ScreenBrightness.Display";
    let path = kde_display_path()?;
    let current = dbus_property(SERVICE, &path, INTERFACE, "Brightness")
        .and_then(|value| first_number(&value))?;
    let maximum = dbus_property(SERVICE, &path, INTERFACE, "MaxBrightness")
        .and_then(|value| first_number(&value))?;
    (maximum > 0).then(|| {
        (current as f64 / maximum as f64 * 100.0)
            .round()
            .clamp(0.0, 100.0) as u8
    })
}

fn set_brightness_value(percent: u8) -> Result<(), String> {
    let percent = percent.min(100);
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();

    if desktop.contains("kde") || desktop.contains("plasma") {
        if let Some(path) = kde_display_path() {
            if let Some(maximum) = dbus_property(
                "org.kde.ScreenBrightness",
                &path,
                "org.kde.ScreenBrightness.Display",
                "MaxBrightness",
            )
            .and_then(|value| first_number(&value))
            {
                let target = (maximum as f64 * f64::from(percent) / 100.0).round() as usize;
                let target = format!("int32 {target}");
                if command_output(
                    "gdbus",
                    &[
                        "call",
                        "--session",
                        "--dest",
                        "org.kde.ScreenBrightness",
                        "--object-path",
                        &path,
                        "--method",
                        "org.kde.ScreenBrightness.Display.SetBrightness",
                        &target,
                        "uint32 1",
                    ],
                )
                .is_ok()
                {
                    return Ok(());
                }
            }
        }

        // Plasma 5 and early Plasma 6 sessions still expose the legacy global API.
        let legacy_value = format!("int32 {percent}");
        if command_output(
            "gdbus",
            &[
                "call",
                "--session",
                "--dest",
                "org.kde.Solid.PowerManagement",
                "--object-path",
                "/org/kde/Solid/PowerManagement/Actions/BrightnessControl",
                "--method",
                "org.kde.Solid.PowerManagement.Actions.BrightnessControl.setBrightness",
                &legacy_value,
            ],
        )
        .is_ok()
        {
            return Ok(());
        }
    }

    if let Some((path, _, maximum)) = sysfs_backlight() {
        let target = (maximum * f64::from(percent) / 100.0).round().max(1.0) as u64;
        if set_logind_backlight(&path, target).is_ok() {
            return Ok(());
        }
    }
    if desktop.contains("gnome") && gnome_brightness_fallback(percent) {
        return Ok(());
    }

    let (path, _, maximum) = sysfs_backlight()
        .ok_or_else(|| "No controllable display brightness device was found".to_owned())?;
    let target = (maximum * f64::from(percent) / 100.0).round().max(1.0) as u64;
    fs::write(path.join("brightness"), target.to_string())
        .map_err(|error| format!("Could not change display brightness: {error}"))
}

fn set_volume_value(percent: u8) -> Result<(), String> {
    let value = format!("{}%", percent.min(100));
    if command_output("wpctl", &["set-volume", "@DEFAULT_SINK@", &value]).is_ok() {
        let _ = command_output("wpctl", &["set-mute", "@DEFAULT_SINK@", "0"]);
        return Ok(());
    }
    command_output("pactl", &["set-sink-volume", "@DEFAULT_SINK@", &value])?;
    command_output("pactl", &["set-sink-mute", "@DEFAULT_SINK@", "0"])?;
    Ok(())
}

fn set_mute_value(muted: bool) -> Result<(), String> {
    let value = if muted { "1" } else { "0" };
    if command_output("wpctl", &["set-mute", "@DEFAULT_SINK@", value]).is_ok() {
        return Ok(());
    }
    command_output("pactl", &["set-sink-mute", "@DEFAULT_SINK@", value])?;
    Ok(())
}

fn first_volume_percent(value: &Value) -> Option<u8> {
    if let Some(percent) = value.get("value_percent").and_then(Value::as_str) {
        return percent.trim_end_matches('%').parse::<u8>().ok();
    }
    if let Some(percent) = value.get("value_percent").and_then(Value::as_f64) {
        return Some(percent.round().clamp(0.0, 100.0) as u8);
    }
    value.as_object()?.values().find_map(first_volume_percent)
}

fn read_application_volumes_blocking() -> Result<Vec<ApplicationVolume>, String> {
    let listing = command_output("pactl", &["-f", "json", "list", "sink-inputs"])?;
    let streams: Vec<Value> = serde_json::from_str(&listing)
        .map_err(|error| format!("Could not parse active audio streams: {error}"))?;
    Ok(streams
        .iter()
        .filter_map(|stream| {
            let id = stream.get("index")?.as_u64()? as u32;
            let properties = stream.get("properties");
            let label = properties
                .and_then(|properties| properties.get("application.name"))
                .and_then(Value::as_str)
                .or_else(|| {
                    properties
                        .and_then(|properties| properties.get("media.name"))
                        .and_then(Value::as_str)
                })
                .unwrap_or("Application")
                .to_owned();
            let volume = first_volume_percent(stream.get("volume")?).unwrap_or(100);
            Some(ApplicationVolume { id, label, volume_percent: volume })
        })
        .collect())
}

fn set_application_volume_value(id: u32, percent: u8) -> Result<(), String> {
    let id = id.to_string();
    let value = format!("{}%", percent.min(100));
    command_output("pactl", &["set-sink-input-volume", &id, &value])?;
    Ok(())
}

fn open_settings_value(section: &str) -> Result<(), String> {
    let (kde_module, gnome_panel) = match section {
        "audio" => ("kcm_pulseaudio", "sound"),
        "keyboard" => ("kcm_keyboard", "keyboard"),
        "power" => ("kcm_powerdevil", "power"),
        _ => return Err("Unknown settings section".into()),
    };
    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    let kde_session = desktop.contains("kde") || desktop.contains("plasma");
    let (program, args): (&str, &[&str]) = if kde_session {
        ("systemsettings", &[kde_module])
    } else {
        ("gnome-control-center", &[gnome_panel])
    };
    Command::new(program)
        .args(args)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open {section} settings with {program}: {error}"))
}

fn set_audio_output_value(id: &str) -> Result<(), String> {
    let outputs = audio_outputs();
    if !outputs.iter().any(|output| output.id == id) {
        return Err("That audio output is no longer available".into());
    }
    if let Some(index) = id.strip_prefix("wpctl:") {
        command_output("wpctl", &["set-default", index])?;
        if let Some(name) = wpctl_node_name(index) {
            move_existing_audio_streams(&name);
        }
        return Ok(());
    }
    if let Some(name) = id.strip_prefix("pactl:") {
        command_output("pactl", &["set-default-sink", name])?;
        move_existing_audio_streams(name);
        return Ok(());
    }
    Err("Unsupported audio output".into())
}

fn move_existing_audio_streams(sink_name: &str) {
    let Some(inputs) = try_command("pactl", &["list", "short", "sink-inputs"]) else {
        return;
    };
    for input_id in inputs
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .filter(|id| id.parse::<u32>().is_ok())
    {
        let _ = command_output("pactl", &["move-sink-input", input_id, sink_name]);
    }
}

fn set_keyboard_layout_value(index: usize) -> Result<(), String> {
    let (layouts, _) = keyboard_layouts();
    if index >= layouts.len() {
        return Err("That keyboard layout is no longer configured".into());
    }

    let desktop = std::env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .to_ascii_lowercase();
    if desktop.contains("gnome") {
        let value = format!("uint32 {index}");
        let result = command_output(
            "gdbus",
            &[
                "call",
                "--session",
                "--dest",
                "org.ctrlboard.Keyboard",
                "--object-path",
                "/org/ctrlboard/Keyboard",
                "--method",
                "org.ctrlboard.Keyboard.Activate",
                &value,
            ],
        )
        .map_err(|error| {
            format!(
                "Could not reach the GNOME keyboard bridge ({error}). Run ./scripts/install-gnome-keyboard-bridge.sh, then log out and back in if it is still unavailable."
            )
        })?;
        if !result.contains("true") {
            return Err("GNOME did not activate the selected keyboard layout".into());
        }
        return Ok(());
    }
    if desktop.contains("kde") || desktop.contains("plasma") {
        let value = format!("uint32 {index}");
        let result = command_output(
            "gdbus",
            &[
                "call",
                "--session",
                "--dest",
                "org.kde.keyboard",
                "--object-path",
                "/Layouts",
                "--method",
                "org.kde.KeyboardLayouts.setLayout",
                &value,
            ],
        )?;
        if !result.contains("true") {
            return Err("KDE did not activate the selected keyboard layout".into());
        }
        return Ok(());
    }
    Err("Keyboard layout switching is not available in this desktop session".into())
}

async fn run_blocking<T>(task: impl FnOnce() -> T + Send + 'static) -> Result<T, String>
where
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("System control task failed: {error}"))
}

fn read_system_controls_blocking() -> SystemControls {
    let outputs = audio_outputs();
    let current_audio_output = current_output_id(&outputs);
    let (volume_percent, muted) = audio_volume();
    let (keyboard_layouts, current_keyboard_layout) = keyboard_layouts();
    SystemControls {
        volume_percent,
        muted,
        brightness_percent: read_brightness(),
        audio_outputs: outputs,
        current_audio_output,
        keyboard_layouts,
        current_keyboard_layout,
    }
}

#[tauri::command]
pub async fn read_system_controls() -> Result<SystemControls, String> {
    run_blocking(read_system_controls_blocking).await
}

#[tauri::command]
pub async fn set_audio_volume(percent: u8) -> Result<(), String> {
    run_blocking(move || set_volume_value(percent)).await?
}

#[tauri::command]
pub async fn set_audio_muted(muted: bool) -> Result<(), String> {
    run_blocking(move || set_mute_value(muted)).await?
}

#[tauri::command]
pub async fn read_application_volumes() -> Result<Vec<ApplicationVolume>, String> {
    run_blocking(read_application_volumes_blocking).await?
}

#[tauri::command]
pub async fn set_application_volume(id: u32, percent: u8) -> Result<(), String> {
    run_blocking(move || set_application_volume_value(id, percent)).await?
}

#[tauri::command]
pub async fn open_system_settings(section: String) -> Result<(), String> {
    run_blocking(move || open_settings_value(&section)).await?
}

#[tauri::command]
pub async fn set_display_brightness(percent: u8) -> Result<(), String> {
    run_blocking(move || set_brightness_value(percent)).await?
}

#[tauri::command]
pub async fn set_default_audio_output(id: String) -> Result<(), String> {
    run_blocking(move || set_audio_output_value(&id)).await?
}

#[tauri::command]
pub async fn set_keyboard_layout(index: usize) -> Result<(), String> {
    run_blocking(move || set_keyboard_layout_value(index)).await?
}
