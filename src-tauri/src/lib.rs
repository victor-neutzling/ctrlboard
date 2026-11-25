use serde::{Deserialize, Serialize};
use std::{fs, path::Path, sync::Mutex};
use tauri::{Emitter, Manager};

mod system_controls;

#[derive(Serialize)]
struct Metrics {
    cpu_percent: Option<f64>,
    gpu_percent: Option<f64>,
    storage_percent: Option<f64>,
    storage_used_gb: Option<f64>,
    storage_total_gb: Option<f64>,
    disk_read_bytes_sec: Option<f64>,
    disk_write_bytes_sec: Option<f64>,
    fps: Option<f64>,
}

fn disk_io_counters() -> Option<(u64, u64)> {
    let contents = fs::read_to_string("/proc/diskstats").ok()?;
    let (mut read_sectors, mut written_sectors) = (0_u64, 0_u64);
    for line in contents.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 14 {
            continue;
        }
        let (major, minor, name) = (fields[0], fields[1], fields[2]);
        if name.starts_with("loop")
            || name.starts_with("ram")
            || name.starts_with("zram")
            || name.starts_with("dm-")
            || name.starts_with("md")
            || Path::new("/sys/dev/block")
                .join(format!("{major}:{minor}/partition"))
                .exists()
        {
            continue;
        }
        read_sectors += fields[5].parse::<u64>().ok()?;
        written_sectors += fields[9].parse::<u64>().ok()?;
    }
    Some((read_sectors * 512, written_sectors * 512))
}

fn disk_io_rates() -> (Option<f64>, Option<f64>) {
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;

    static PREVIOUS: OnceLock<Mutex<Option<(Instant, u64, u64)>>> = OnceLock::new();
    let current = disk_io_counters();
    let Some((read_bytes, written_bytes)) = current else {
        return (None, None);
    };
    let now = Instant::now();
    let previous = PREVIOUS.get_or_init(|| Mutex::new(None));
    let mut previous = previous.lock().unwrap_or_else(|error| error.into_inner());
    let rates = previous.as_ref().and_then(|(at, old_read, old_written)| {
        let elapsed = now.duration_since(*at).as_secs_f64();
        (elapsed > 0.0).then(|| {
            (
                read_bytes.saturating_sub(*old_read) as f64 / elapsed,
                written_bytes.saturating_sub(*old_written) as f64 / elapsed,
            )
        })
    });
    *previous = Some((now, read_bytes, written_bytes));
    rates.map_or((None, None), |(read, written)| (Some(read), Some(written)))
}

fn cpu_counters() -> Option<(u64, u64)> {
    let line = fs::read_to_string("/proc/stat")
        .ok()?
        .lines()
        .next()?
        .to_owned();
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|v| v.parse().ok())
        .collect();
    if values.len() < 4 {
        return None;
    }
    let idle = values[3] + values.get(4).copied().unwrap_or(0);
    Some((values.iter().sum(), idle))
}

fn gpu_usage() -> Option<f64> {
    let roots = ["/sys/class/drm"];
    for root in roots {
        let entries = fs::read_dir(root).ok()?;
        for entry in entries.flatten() {
            let path = entry.path().join("device/gpu_busy_percent");
            if let Ok(value) = fs::read_to_string(path) {
                if let Ok(percent) = value.trim().parse::<f64>() {
                    return Some(percent.clamp(0.0, 100.0));
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn storage_usage() -> Option<(f64, f64, f64)> {
    use std::ffi::CString;
    let path = CString::new("/").ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(path.as_ptr(), &mut stat) } != 0 {
        return None;
    }
    let total = (stat.f_blocks as f64 * stat.f_frsize as f64) / 1_000_000_000.0;
    let free = (stat.f_bavail as f64 * stat.f_frsize as f64) / 1_000_000_000.0;
    if total <= 0.0 {
        return None;
    }
    let used = total - free;
    Some(((used / total * 100.0).clamp(0.0, 100.0), used, total))
}

#[cfg(not(target_os = "linux"))]
fn storage_usage() -> Option<(f64, f64, f64)> {
    None
}

#[tauri::command]
async fn read_metrics() -> Metrics {
    let before = cpu_counters();
    std::thread::sleep(std::time::Duration::from_millis(120));
    let after = cpu_counters();
    let cpu_percent = before
        .zip(after)
        .and_then(|((total_a, idle_a), (total_b, idle_b))| {
            let total = total_b.checked_sub(total_a)?;
            let idle = idle_b.checked_sub(idle_a)?;
            if total == 0 {
                None
            } else {
                Some(((total - idle) as f64 / total as f64 * 100.0).clamp(0.0, 100.0))
            }
        });
    let storage = storage_usage();
    let (disk_read_bytes_sec, disk_write_bytes_sec) = disk_io_rates();
    Metrics {
        cpu_percent,
        gpu_percent: gpu_usage(),
        storage_percent: storage.map(|v| v.0),
        storage_used_gb: storage.map(|v| v.1),
        storage_total_gb: storage.map(|v| v.2),
        disk_read_bytes_sec,
        disk_write_bytes_sec,
        fps: None,
    }
}

fn application_directories() -> Vec<std::path::PathBuf> {
    let mut data_dirs = Vec::new();

    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        data_dirs.push(std::path::PathBuf::from(data_home));
    } else if let Some(home) = std::env::var_os("HOME") {
        data_dirs.push(std::path::PathBuf::from(home).join(".local/share"));
    }

    let system_dirs =
        std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    data_dirs.extend(std::env::split_paths(&system_dirs));
    data_dirs
        .into_iter()
        .map(|directory| directory.join("applications"))
        .collect()
}

fn collect_desktop_files(directory: &Path, depth: usize, files: &mut Vec<std::path::PathBuf>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_desktop_files(&path, depth + 1, files);
        } else if path
            .extension()
            .is_some_and(|extension| extension == "desktop")
        {
            files.push(path);
        }
    }
}

#[derive(Serialize)]
struct InstalledApplication {
    desktop_id: String,
    name: String,
    icon: Option<String>,
    desktop_path: String,
    command: String,
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0];
        let b = *chunk.get(1).unwrap_or(&0);
        let c = *chunk.get(2).unwrap_or(&0);
        output.push(TABLE[(a >> 2) as usize] as char);
        output.push(TABLE[(((a & 3) << 4) | (b >> 4)) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[(((b & 15) << 2) | (c >> 6)) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(c & 63) as usize] as char } else { '=' });
    }
    output
}

fn resolve_icon(icon: &str) -> Option<String> {
    let direct = Path::new(icon);
    let mut candidates = Vec::new();
    if direct.is_absolute() { candidates.push(direct.to_path_buf()); }
    let dirs = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    let mut roots = vec![std::env::var_os("XDG_DATA_HOME").map(std::path::PathBuf::from).unwrap_or_else(|| std::env::var_os("HOME").map(std::path::PathBuf::from).unwrap_or_default().join(".local/share"))];
    roots.extend(std::env::split_paths(&dirs));
    for root in roots {
        for theme in ["hicolor", "Adwaita", "breeze"] {
            for size in ["scalable/apps", "256x256/apps", "128x128/apps", "96x96/apps", "64x64/apps", "48x48/apps", "32x32/apps"] {
                for extension in ["svg", "png", "xpm"] {
                    candidates.push(root.join("icons").join(theme).join(size).join(format!("{icon}.{extension}")));
                }
            }
        }
        for extension in ["png", "svg", "xpm"] { candidates.push(root.join("pixmaps").join(format!("{icon}.{extension}"))); }
    }
    for path in candidates {
        let Ok(bytes) = fs::read(&path) else { continue };
        let mime = match path.extension().and_then(|value| value.to_str()) { Some("svg") => "image/svg+xml", Some("xpm") => "image/x-xpixmap", _ => "image/png" };
        return Some(format!("data:{mime};base64,{}", base64(&bytes)));
    }
    None
}

fn desktop_application(path: &Path) -> Option<InstalledApplication> {
    let contents = fs::read_to_string(path).ok()?;
    let mut in_entry = false;
    let mut name = None;
    let mut icon = None;
    let mut command = None;
    let mut hidden = false;
    for line in contents.lines() {
        if line.starts_with('[') { in_entry = line == "[Desktop Entry]"; continue; }
        if !in_entry { continue; }
        if let Some(value) = line.strip_prefix("Name=") { if name.is_none() { name = Some(value.to_owned()); } }
        if let Some(value) = line.strip_prefix("Icon=") { icon = Some(value.to_owned()); }
        if let Some(value) = line.strip_prefix("Exec=") { command = Some(value.to_owned()); }
        if line == "NoDisplay=true" || line == "Hidden=true" { hidden = true; }
    }
    if hidden { return None; }
    Some(InstalledApplication {
        desktop_id: path.file_name()?.to_str()?.to_owned(),
        name: name.filter(|value| !value.is_empty()).unwrap_or_else(|| path.file_stem().and_then(|value| value.to_str()).unwrap_or("Application").replace(['-', '_'], " ")),
        icon: icon.and_then(|value| resolve_icon(&value)),
        desktop_path: path.to_string_lossy().into_owned(),
        command: command.unwrap_or_default(),
    })
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
struct AppPreferences {
    initialized: bool,
    theme: String,
    visual_style: String,
    accent_color: String,
    visible_gauges: Vec<String>,
    compact_gauge_mode: bool,
    sound_enabled: bool,
    sound_volume: u8,
    long_press_duration_ms: u16,
    power_enabled: bool,
    confirm_power_actions: bool,
    start_screen: String,
    window_width: u32,
    window_height: u32,
    launcher_app_ids: Vec<String>,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            initialized: false,
            theme: "dark".into(),
            visual_style: "glossy".into(),
            accent_color: "blue".into(),
            visible_gauges: vec!["fps".into(), "cpu".into(), "gpu".into(), "disk".into()],
            compact_gauge_mode: false,
            sound_enabled: true,
            sound_volume: 65,
            long_press_duration_ms: 560,
            power_enabled: false,
            confirm_power_actions: true,
            start_screen: "deck".into(),
            window_width: 1024,
            window_height: 600,
            launcher_app_ids: Vec::new(),
        }
    }
}

fn preferences_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join("preferences.json"))
        .map_err(|error| format!("Could not find the app settings folder: {error}"))
}

fn read_preferences(app: &tauri::AppHandle) -> Result<AppPreferences, String> {
    let path = preferences_file(app)?;
    match fs::read_to_string(path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Could not read app settings: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(AppPreferences::default()),
        Err(error) => Err(format!("Could not read app settings: {error}")),
    }
}

#[tauri::command]
fn load_app_preferences(app: tauri::AppHandle) -> Result<AppPreferences, String> {
    read_preferences(&app)
}

#[tauri::command]
fn save_app_preferences(app: tauri::AppHandle, preferences: AppPreferences) -> Result<(), String> {
    if !["light", "dark", "contrast"].contains(&preferences.theme.as_str()) {
        return Err("Unknown appearance mode".into());
    }
    if !["glossy", "flat"].contains(&preferences.visual_style.as_str()) {
        return Err("Unknown visual style".into());
    }
    if !["system", "blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "slate"].contains(&preferences.accent_color.as_str()) {
        return Err("Unknown accent color".into());
    }
    if preferences.visible_gauges.is_empty() || preferences.visible_gauges.len() > 4 {
        return Err("Select at least one gauge".into());
    }
    if preferences.visible_gauges.iter().any(|gauge| !["fps", "cpu", "gpu", "disk"].contains(&gauge.as_str())) {
        return Err("Unknown gauge".into());
    }
    let unique_gauges: std::collections::HashSet<_> = preferences.visible_gauges.iter().collect();
    if unique_gauges.len() != preferences.visible_gauges.len() {
        return Err("Visible gauges must be unique".into());
    }
    if !["deck", "gauges", "controls"].contains(&preferences.start_screen.as_str()) {
        return Err("Unknown startup screen".into());
    }
    if preferences.sound_volume > 100
        || !(300..=1200).contains(&preferences.long_press_duration_ms)
        || !(640..=3840).contains(&preferences.window_width)
        || !(420..=2160).contains(&preferences.window_height)
        || preferences.launcher_app_ids.len() > 12
    {
        return Err("One or more settings are outside the supported range".into());
    }
    let unique_ids: std::collections::HashSet<_> = preferences.launcher_app_ids.iter().collect();
    if unique_ids.len() != preferences.launcher_app_ids.len() {
        return Err("Launcher applications must be unique".into());
    }
    static WRITE_LOCK: Mutex<()> = Mutex::new(());
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    let path = preferences_file(&app)?;
    let directory = path.parent().ok_or("Invalid app settings path")?;
    fs::create_dir_all(directory).map_err(|error| format!("Could not create app settings folder: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(&preferences)
        .map_err(|error| format!("Could not encode app settings: {error}"))?;
    fs::write(&temporary, contents).map_err(|error| format!("Could not save app settings: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("Could not update app settings: {error}"))?;
    app.emit("preferences-updated", preferences)
        .map_err(|error| format!("Could not notify the app about new settings: {error}"))
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle, section: Option<String>) -> Result<(), String> {
    if section.as_deref().is_some_and(|value| {
        !["appearance", "feedback", "controls", "gauges", "launcher", "display", "about"].contains(&value)
    }) {
        return Err("Unknown settings section".into());
    }
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(section) = section {
            app.emit_to("settings", "settings-navigate", section)
                .map_err(|error| format!("Could not navigate to settings section: {error}"))?;
        }
        return Ok(());
    }
    let url = section.map_or_else(
        || "index.html?window=settings".to_owned(),
        |section| format!("index.html?window=settings&section={section}"),
    );
    tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App(url.into()),
    )
    .title("Ctrlboard Settings")
    .inner_size(980.0, 720.0)
    .min_inner_size(720.0, 540.0)
    .resizable(true)
    .build()
    .map(|_| ())
    .map_err(|error| format!("Could not open settings: {error}"))
}

#[tauri::command]
fn set_main_window_size(app: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    if !(640..=3840).contains(&width) || !(420..=2160).contains(&height) {
        return Err("Window size must be between 640×420 and 3840×2160".into());
    }
    let window = app.get_webview_window("main").ok_or("Main window is not open")?;
    window.set_size(tauri::LogicalSize::new(width as f64, height as f64))
        .map_err(|error| format!("Could not resize the main window: {error}"))
}

#[tauri::command]
fn list_applications() -> Vec<InstalledApplication> {
    let mut files = Vec::new();
    for directory in application_directories() {
        collect_desktop_files(&directory, 0, &mut files);
    }
    files.sort();
    files.dedup();
    files.into_iter().filter_map(|path| desktop_application(&path)).collect()
}

#[tauri::command]
fn launch_application(desktop_id: String) -> Result<(), String> {
    if desktop_id.contains('/') || !desktop_id.ends_with(".desktop") {
        return Err("Invalid application id".into());
    }
    let application = application_directories()
        .into_iter()
        .find_map(|directory| {
            let mut files = Vec::new();
            collect_desktop_files(&directory, 0, &mut files);
            files.into_iter().find(|path| {
                path.file_name().and_then(|name| name.to_str()) == Some(desktop_id.as_str())
            })
        })
        .ok_or_else(|| "Application not found".to_owned())?;

    std::process::Command::new("gio")
        .arg("launch")
        .arg(application)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not launch application: {error}"))
}

fn is_valid_session_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn current_session_id() -> Result<String, String> {
    let loginctl = std::process::Command::new("loginctl")
        .args(["show-session", "auto", "--property=Id", "--value"])
        .output();
    if let Ok(output) = loginctl {
        let id = String::from_utf8_lossy(&output.stdout).trim().to_owned();
        if output.status.success() && is_valid_session_id(&id) {
            return Ok(id);
        }
    }

    if let Ok(id) = std::env::var("XDG_SESSION_ID") {
        if is_valid_session_id(&id) {
            return Ok(id);
        }
    }

    Err("Could not determine the current desktop session from logind".to_owned())
}

fn run_system_action_blocking(action: String) -> Result<(), String> {
    let (program, arguments): (&str, Vec<String>) = match action.as_str() {
        "lock" => (
            "loginctl",
            vec!["lock-session".into(), current_session_id()?],
        ),
        "logout" => (
            "loginctl",
            vec!["terminate-session".into(), current_session_id()?],
        ),
        "shutdown" => ("systemctl", vec!["poweroff".into()]),
        "restart" => ("systemctl", vec!["reboot".into()]),
        _ => return Err("Unsupported system action".into()),
    };

    let output = std::process::Command::new(program)
        .args(arguments)
        .output()
        .map_err(|error| format!("Could not start {program}: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let details = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        Err(if details.is_empty() {
            format!("{program} exited with {}", output.status)
        } else {
            details
        })
    }
}

#[tauri::command]
async fn run_system_action(action: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || run_system_action_blocking(action))
        .await
        .map_err(|error| format!("System action task failed: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let preferences = read_preferences(app.handle()).unwrap_or_default();
                let _ = window.set_size(tauri::LogicalSize::new(
                    preferences.window_width as f64,
                    preferences.window_height as f64,
                ));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_metrics,
            list_applications,
            launch_application,
            load_app_preferences,
            save_app_preferences,
            open_settings_window,
            set_main_window_size,
            run_system_action,
            system_controls::read_system_controls,
            system_controls::set_audio_volume,
            system_controls::set_audio_muted,
            system_controls::control_media_player,
            system_controls::read_application_volumes,
            system_controls::set_application_volume,
            system_controls::open_system_settings,
            system_controls::set_display_brightness,
            system_controls::set_default_audio_output,
            system_controls::set_keyboard_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ctrlboard");
}
