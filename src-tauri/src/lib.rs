use serde::Serialize;
use std::{fs, path::Path};

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

#[tauri::command]
fn list_applications() -> Vec<String> {
    let mut files = Vec::new();
    for directory in application_directories() {
        collect_desktop_files(&directory, 0, &mut files);
    }
    files.sort();
    files.dedup();
    files
        .into_iter()
        .filter_map(|path| path.file_name()?.to_str().map(str::to_owned))
        .collect()
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
        .invoke_handler(tauri::generate_handler![
            read_metrics,
            list_applications,
            launch_application,
            run_system_action,
            system_controls::read_system_controls,
            system_controls::set_audio_volume,
            system_controls::set_audio_muted,
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
