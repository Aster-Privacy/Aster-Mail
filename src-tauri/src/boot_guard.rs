//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const COMPAT_MODE_MARKER: &str = "compat_mode";
const WEBVIEW_RESET_MARKER: &str = "webview_reset_pending";
const BOOT_LOG_FILE: &str = "boot.log";
const BOOT_LOG_MAX_BYTES: u64 = 65_536;
const BOOT_TIMEOUT: Duration = Duration::from_secs(25);
const POLL_INTERVAL: Duration = Duration::from_millis(500);
const WATCHDOG_GIVE_UP: Duration = Duration::from_secs(600);
#[cfg(windows)]
pub const COMPAT_BROWSER_ARGS: &str =
    "--disable-gpu --disable-gpu-compositing --disable-software-rasterizer";

pub struct BootState {
    script_ran: AtomicBool,
    painted: AtomicBool,
}

impl BootState {
    pub fn new() -> Self {
        Self {
            script_ran: AtomicBool::new(false),
            painted: AtomicBool::new(false),
        }
    }

    pub fn mark_script_ran(&self) {
        if !self.script_ran.swap(true, Ordering::SeqCst) {
            log_line("webview executed startup script");
        }
    }

    pub fn mark_painted(&self) {
        if !self.painted.swap(true, Ordering::SeqCst) {
            log_line("webview presented its first frame");
        }
    }

    pub fn script_ran(&self) -> bool {
        self.script_ran.load(Ordering::SeqCst)
    }

    pub fn painted(&self) -> bool {
        self.painted.load(Ordering::SeqCst)
    }

    pub fn is_usable(&self) -> bool {
        if cfg!(windows) {
            self.painted()
        } else {
            self.script_ran()
        }
    }
}

fn app_local_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join("com.astermail.mail"))
}

fn marker_path(name: &str) -> Option<PathBuf> {
    app_local_dir().map(|d| d.join(name))
}

fn marker_exists(name: &str) -> bool {
    marker_path(name).map(|p| p.exists()).unwrap_or(false)
}

fn write_marker(name: &str) {
    if let Some(dir) = app_local_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(name), b"1");
    }
}

fn remove_marker(name: &str) {
    if let Some(path) = marker_path(name) {
        let _ = std::fs::remove_file(path);
    }
}

fn log_line(message: &str) {
    let Some(dir) = app_local_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(BOOT_LOG_FILE);
    if std::fs::metadata(&path)
        .map(|m| m.len() > BOOT_LOG_MAX_BYTES)
        .unwrap_or(false)
    {
        let _ = std::fs::remove_file(&path);
    }
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{stamp} {message}");
    }
}

pub fn compat_mode_active() -> bool {
    marker_exists(COMPAT_MODE_MARKER)
}

pub fn enable_compat_mode() {
    write_marker(COMPAT_MODE_MARKER);
    write_marker(WEBVIEW_RESET_MARKER);
    log_line("compatibility mode enabled by user");
}

pub fn disable_compat_mode() {
    remove_marker(COMPAT_MODE_MARKER);
    write_marker(WEBVIEW_RESET_MARKER);
    log_line("compatibility mode disabled by user");
}

pub fn request_display_reset() {
    write_marker(WEBVIEW_RESET_MARKER);
    log_line("display cache reset requested by user");
}

pub fn prepare() {
    log_line("---- launch ----");

    if marker_exists(WEBVIEW_RESET_MARKER) {
        remove_marker(WEBVIEW_RESET_MARKER);
        log_line("purging webview render caches");
        if let Some(dir) = app_local_dir() {
            for cache in [
                "EBWebView/GPUCache",
                "EBWebView/GrShaderCache",
                "EBWebView/GraphiteDawnCache",
                "EBWebView/ShaderCache",
                "EBWebView/Default/GPUCache",
                "EBWebView/Default/Code Cache",
                "EBWebView/Default/DawnGraphiteCache",
                "EBWebView/Default/DawnWebGPUCache",
            ] {
                let _ = std::fs::remove_dir_all(dir.join(cache));
            }
        }
    }
}

#[cfg(windows)]
pub fn apply_compat_browser_args(config: &mut tauri::utils::config::Config) {
    if !compat_mode_active() {
        return;
    }

    let Some(window) = config.app.windows.get_mut(0) else {
        return;
    };
    let existing = window.additional_browser_args.clone().unwrap_or_default();
    window.additional_browser_args = Some(if existing.is_empty() {
        COMPAT_BROWSER_ARGS.to_string()
    } else {
        format!("{existing} {COMPAT_BROWSER_ARGS}")
    });
    log_line("compatibility mode active, hardware acceleration disabled");
}

#[cfg(windows)]
fn webview2_runtime_version() -> String {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    for root in ["HKLM\\SOFTWARE\\WOW6432Node", "HKLM\\SOFTWARE", "HKCU\\SOFTWARE"] {
        let key = format!(
            "{root}\\Microsoft\\EdgeUpdate\\Clients\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}"
        );
        let output = std::process::Command::new("reg")
            .args(["query", &key, "/v", "pv"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        if let Ok(output) = output {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                if let Some(value) = text.split_whitespace().last() {
                    if value.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                        return value.to_string();
                    }
                }
            }
        }
    }
    "not detected".to_string()
}

fn window_is_on_screen(app: &tauri::AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false)
}

#[cfg(windows)]
fn warn_and_restart(app: &tauri::AppHandle) {
    rfd::MessageDialog::new()
        .set_title("Aster Mail - Display Problem")
        .set_description(
            "Aster Mail is running but its window is not being drawn.\n\nThis is almost always a graphics driver or Microsoft WebView2 problem, not a problem with your account or your mail.\n\nAster Mail will now restart with hardware acceleration turned off. Your mail is unaffected.",
        )
        .set_level(rfd::MessageLevel::Warning)
        .show();
    app.restart();
}

#[cfg(not(windows))]
fn warn_and_restart(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(
            "Aster Mail is running but its window is not being drawn.\n\nAster Mail will now restart with hardware acceleration turned off.",
        )
        .title("Aster Mail - Display Problem")
        .kind(MessageDialogKind::Warning)
        .blocking_show();
    app.restart();
}

#[cfg(windows)]
fn report_persistent_failure(app: &tauri::AppHandle) {
    let runtime = webview2_runtime_version();
    log_line(&format!("webview2 runtime version: {runtime}"));
    let log_hint = app_local_dir()
        .map(|d| d.join(BOOT_LOG_FILE).display().to_string())
        .unwrap_or_else(|| BOOT_LOG_FILE.to_string());
    let description = format!(
        "Aster Mail still cannot draw its window, even with hardware acceleration turned off.\n\nThe Microsoft WebView2 Runtime on this computer appears to be damaged. To repair it:\n\n1. Open Windows Settings, then Apps, then Installed apps.\n2. Find \"Microsoft Edge WebView2 Runtime\", choose Modify, then Repair.\n3. If Repair is unavailable, reinstall it from https://developer.microsoft.com/microsoft-edge/webview2/\n4. Start Aster Mail again.\n\nDetected WebView2 runtime: {runtime}\n\nIf this keeps happening, email support@astermail.org, mention code WV2-BOOT, and attach this file:\n{log_hint}\n\nQuit Aster Mail now?"
    );
    let answer = rfd::MessageDialog::new()
        .set_title("Aster Mail - Display Problem")
        .set_description(&description)
        .set_level(rfd::MessageLevel::Error)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();
    if answer == rfd::MessageDialogResult::Yes {
        app.exit(0);
    }
}

#[cfg(not(windows))]
fn report_persistent_failure(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(
            "Aster Mail still cannot draw its window. Please contact support@astermail.org and mention code WV2-BOOT.",
        )
        .title("Aster Mail - Display Problem")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

pub fn spawn_watchdog(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let started = Instant::now();
        let mut on_screen = Duration::ZERO;

        loop {
            let state: tauri::State<BootState> = app.state();
            if state.is_usable() {
                log_line(&format!(
                    "boot healthy after {}ms",
                    started.elapsed().as_millis()
                ));
                return;
            }

            if window_is_on_screen(&app) {
                on_screen += POLL_INTERVAL;
                if on_screen >= BOOT_TIMEOUT {
                    break;
                }
            }

            if started.elapsed() >= WATCHDOG_GIVE_UP {
                log_line("watchdog stood down, window never became visible");
                return;
            }

            std::thread::sleep(POLL_INTERVAL);
        }

        let state: tauri::State<BootState> = app.state();
        log_line(&format!(
            "boot failed: script_ran={} painted={} compat={}",
            state.script_ran(),
            state.painted(),
            compat_mode_active()
        ));

        if !compat_mode_active() {
            write_marker(COMPAT_MODE_MARKER);
            write_marker(WEBVIEW_RESET_MARKER);
            warn_and_restart(&app);
            return;
        }

        write_marker(WEBVIEW_RESET_MARKER);
        report_persistent_failure(&app);
    });
}

pub fn show_fatal_webview_error(error: &str) {
    log_line(&format!("webview failed to initialize: {error}"));
    if let Some(dir) = app_local_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(
            dir.join("boot_error.log"),
            format!("failed to initialize webview: {error}"),
        );
    }
    write_marker(WEBVIEW_RESET_MARKER);
    #[cfg(windows)]
    {
        rfd::MessageDialog::new()
            .set_title("Aster Mail - Startup Error")
            .set_description(
                "Aster Mail could not start because the Microsoft WebView2 Runtime failed to initialize.\n\nTo fix it, open Windows Settings > Apps > Installed apps, find \"Microsoft Edge WebView2 Runtime\", choose Modify, then Repair. If Repair is unavailable, reinstall it from https://developer.microsoft.com/microsoft-edge/webview2/\n\nThen start Aster Mail again. If the problem persists, contact support@astermail.org and mention code WV2-INIT.",
            )
            .set_level(rfd::MessageLevel::Error)
            .show();
    }
    #[cfg(not(windows))]
    eprintln!("failed to initialize webview: {error}");
}
