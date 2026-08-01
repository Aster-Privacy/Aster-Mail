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
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const COMPAT_MODE_MARKER: &str = "compat_mode";
const WEBVIEW_RESET_MARKER: &str = "webview_reset_pending";
const BOOT_TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(windows)]
const CONFIG_BROWSER_ARGS: &str = "--disable-logging --disable-crash-reporter --no-first-run --disable-sync --disk-cache-size=0 --disable-background-networking --disable-default-browser-check";
#[cfg(windows)]
const COMPAT_BROWSER_ARGS: &str = "--disable-gpu --disable-gpu-compositing --disable-software-rasterizer";

pub struct BootState {
    frontend_ready: AtomicBool,
}

impl BootState {
    pub fn new() -> Self {
        Self {
            frontend_ready: AtomicBool::new(false),
        }
    }

    pub fn mark_ready(&self) {
        self.frontend_ready.store(true, Ordering::SeqCst);
    }

    pub fn is_ready(&self) -> bool {
        self.frontend_ready.load(Ordering::SeqCst)
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

pub fn compat_mode_active() -> bool {
    marker_exists(COMPAT_MODE_MARKER)
}

pub fn prepare() {
    if marker_exists(WEBVIEW_RESET_MARKER) {
        remove_marker(WEBVIEW_RESET_MARKER);
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

    #[cfg(windows)]
    if compat_mode_active() {
        let existing = std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").unwrap_or_default();
        let combined = if existing.is_empty() {
            format!("{CONFIG_BROWSER_ARGS} {COMPAT_BROWSER_ARGS}")
        } else {
            format!("{existing} {COMPAT_BROWSER_ARGS}")
        };
        std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", combined);
    }
}

pub fn spawn_watchdog(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(BOOT_TIMEOUT);
        let state: tauri::State<BootState> = app.state();
        if state.is_ready() {
            return;
        }

        if !compat_mode_active() {
            write_marker(COMPAT_MODE_MARKER);
            write_marker(WEBVIEW_RESET_MARKER);
            app.dialog()
                .message(
                    "Aster Mail could not display its interface.\n\nThis is usually caused by a graphics driver or Microsoft WebView2 issue. Aster Mail will now restart in compatibility mode with hardware acceleration disabled.",
                )
                .title("Aster Mail - Display Problem")
                .kind(MessageDialogKind::Warning)
                .blocking_show();
            app.restart();
        }

        write_marker(WEBVIEW_RESET_MARKER);
        app.dialog()
            .message(
                "Aster Mail still could not display its interface, even in compatibility mode.\n\nThe Microsoft WebView2 Runtime on this computer appears to be damaged. To fix it:\n\n1. Close Aster Mail (right-click the tray icon and choose Quit).\n2. Open Windows Settings > Apps > Installed apps.\n3. Find \"Microsoft Edge WebView2 Runtime\", choose Modify, and select Repair. If Repair is unavailable, reinstall it from https://developer.microsoft.com/microsoft-edge/webview2/\n4. Start Aster Mail again.\n\nIf the problem persists, please contact support@astermail.org and mention code WV2-BOOT.",
            )
            .title("Aster Mail - Display Problem")
            .kind(MessageDialogKind::Error)
            .blocking_show();
    });
}

pub fn show_fatal_webview_error(error: &str) {
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
