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
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const COMPAT_MODE_MARKER: &str = "compat_mode";
const WEBVIEW_RESET_MARKER: &str = "webview_reset_pending";
#[cfg(windows)]
const WEBVIEW_STALL_MARKER: &str = "webview_stalled";
#[cfg(windows)]
const RESTART_WAIT_ENV: &str = "ASTER_MAIL_RESTART_AFTER_PID";
#[cfg(windows)]
const RESTART_WAIT_LIMIT: Duration = Duration::from_secs(15);
#[cfg(windows)]
const HELPER_TIMEOUT: Duration = Duration::from_secs(15);
#[cfg(windows)]
const MAIN_WINDOW_TITLE: &str = "Aster Mail";
#[cfg(all(unix, not(target_os = "macos")))]
const SOFTWARE_RENDERING_MARKER: &str = "software_rendering";
#[cfg(all(unix, not(target_os = "macos")))]
const UNSTARTED_LAUNCHES_FILE: &str = "unstarted_launches";
const BOOT_LOG_FILE: &str = "boot.log";
const BOOT_LOG_MAX_BYTES: u64 = 65_536;
const BOOT_TIMEOUT: Duration = Duration::from_secs(25);
const POLL_INTERVAL: Duration = Duration::from_millis(500);
#[cfg(windows)]
const WEBVIEW_RESTART_MIN_UPTIME: Duration = Duration::from_secs(30);
#[cfg(windows)]
pub const COMPAT_BROWSER_ARGS: &str =
    "--disable-gpu --disable-gpu-compositing --disable-software-rasterizer";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(u8)]
pub enum SetupStage {
    Starting = 0,
    TrayReady = 1,
    CreatingWindow = 2,
    WindowCreated = 3,
    Finished = 4,
}

impl SetupStage {
    fn from_u8(value: u8) -> Self {
        match value {
            1 => Self::TrayReady,
            2 => Self::CreatingWindow,
            3 => Self::WindowCreated,
            4 => Self::Finished,
            _ => Self::Starting,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Starting => "setup started",
            Self::TrayReady => "tray ready",
            Self::CreatingWindow => "creating the webview window",
            Self::WindowCreated => "webview window created",
            Self::Finished => "setup finished",
        }
    }
}

pub struct BootState {
    script_ran: AtomicBool,
    painted: AtomicBool,
    stage: AtomicU8,
    created: Instant,
    started_hidden: AtomicBool,
    shown_after_hidden_start: AtomicBool,
    watchdog_running: AtomicBool,
}

impl BootState {
    pub fn new() -> Self {
        Self {
            script_ran: AtomicBool::new(false),
            painted: AtomicBool::new(false),
            stage: AtomicU8::new(SetupStage::Starting as u8),
            created: Instant::now(),
            started_hidden: AtomicBool::new(false),
            shown_after_hidden_start: AtomicBool::new(false),
            watchdog_running: AtomicBool::new(false),
        }
    }

    pub fn mark_started_hidden(&self) {
        if !self.started_hidden.swap(true, Ordering::SeqCst) {
            log_line("window started hidden");
        }
    }

    pub fn started_hidden(&self) -> bool {
        self.started_hidden.load(Ordering::SeqCst)
    }

    fn take_first_show_after_hidden_start(&self) -> bool {
        self.started_hidden() && !self.shown_after_hidden_start.swap(true, Ordering::SeqCst)
    }

    fn prepare_reload(&self) {
        self.shown_after_hidden_start.store(true, Ordering::SeqCst);
        self.painted.store(false, Ordering::SeqCst);
    }

    #[cfg(windows)]
    fn uptime(&self) -> Duration {
        self.created.elapsed()
    }

    fn advance_stage(&self, stage: SetupStage) -> bool {
        self.stage.fetch_max(stage as u8, Ordering::SeqCst) < stage as u8
    }

    pub fn enter_stage(&self, stage: SetupStage) {
        if self.advance_stage(stage) {
            log_line(&format!(
                "startup: {} after {}ms",
                stage.label(),
                self.created.elapsed().as_millis()
            ));
        }
    }

    pub fn stage(&self) -> SetupStage {
        SetupStage::from_u8(self.stage.load(Ordering::SeqCst))
    }

    pub fn setup_finished(&self) -> bool {
        self.stage() == SetupStage::Finished
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

const APP_DIR_NAME: &str = "com.astermail.mail";

pub fn app_local_dir() -> Option<PathBuf> {
    dirs::data_local_dir().map(|d| d.join(APP_DIR_NAME))
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

pub fn log_line(message: &str) {
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
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let _ = writeln!(file, "{stamp} {message}");
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn software_rendering_marked() -> bool {
    marker_exists(SOFTWARE_RENDERING_MARKER)
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn mark_software_rendering() {
    if !marker_exists(SOFTWARE_RENDERING_MARKER) {
        write_marker(SOFTWARE_RENDERING_MARKER);
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn unstarted_launches() -> u32 {
    marker_path(UNSTARTED_LAUNCHES_FILE)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| text.trim().parse::<u32>().ok())
        .unwrap_or(0)
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn record_launch_attempt() {
    let next = unstarted_launches().saturating_add(1).min(100);
    if let Some(dir) = app_local_dir() {
        let _ = std::fs::create_dir_all(&dir);
        let _ = std::fs::write(dir.join(UNSTARTED_LAUNCHES_FILE), next.to_string());
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn clear_launch_attempts() {
    remove_marker(UNSTARTED_LAUNCHES_FILE);
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

    #[cfg(windows)]
    {
        wait_for_previous_instance();
        clear_stalled_webview();
    }

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

#[cfg(any(windows, test))]
fn windows_dir_in(system_root: Option<std::ffi::OsString>) -> PathBuf {
    system_root
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .filter(|root| root.is_absolute())
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"))
}

#[cfg(any(windows, test))]
fn explorer_exe_in(system_root: Option<std::ffi::OsString>) -> PathBuf {
    windows_dir_in(system_root).join("explorer.exe")
}

#[cfg(windows)]
pub(crate) fn explorer_exe() -> PathBuf {
    explorer_exe_in(std::env::var_os("SystemRoot"))
}

#[cfg(any(windows, test))]
fn system32_tool_in(system_root: Option<std::ffi::OsString>, parts: &[&str]) -> PathBuf {
    let mut path = windows_dir_in(system_root);
    path.push("System32");
    for part in parts {
        path.push(part);
    }
    path
}

#[cfg(windows)]
fn system32_tool(parts: &[&str]) -> PathBuf {
    system32_tool_in(std::env::var_os("SystemRoot"), parts)
}

#[cfg(windows)]
fn reg_exe() -> PathBuf {
    system32_tool(&["reg.exe"])
}

#[cfg(windows)]
fn powershell_exe() -> PathBuf {
    system32_tool(&["WindowsPowerShell", "v1.0", "powershell.exe"])
}

#[cfg(windows)]
fn run_hidden_bounded(
    program: &std::path::Path,
    args: &[&str],
    timeout: Duration,
) -> Option<String> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut child = std::process::Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut output = String::new();
        let _ = stdout.read_to_string(&mut output);
        output
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = reader.join().unwrap_or_default();
                return status.success().then_some(output);
            }
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(100));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

#[cfg(windows)]
fn webview2_runtime_version() -> String {
    for root in [
        "HKLM\\SOFTWARE\\WOW6432Node",
        "HKLM\\SOFTWARE",
        "HKCU\\SOFTWARE",
    ] {
        let key = format!(
            "{root}\\Microsoft\\EdgeUpdate\\Clients\\{{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}}"
        );
        let Some(text) =
            run_hidden_bounded(&reg_exe(), &["query", &key, "/v", "pv"], HELPER_TIMEOUT)
        else {
            continue;
        };
        if let Some(value) = text.split_whitespace().last() {
            if value
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
            {
                return value.to_string();
            }
        }
    }
    "not detected".to_string()
}

#[cfg(windows)]
fn webview_process_script(stop: bool) -> String {
    let action = if stop {
        "$found | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; "
    } else {
        ""
    };
    format!(
        "$found = @(Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" | Where-Object {{ $_.CommandLine -like '*\\{APP_DIR_NAME}\\EBWebView*' }}); {action}$found.Count"
    )
}

#[cfg(windows)]
fn encode_powershell(script: &str) -> String {
    use base64::Engine;
    let wide: Vec<u8> = script
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    base64::engine::general_purpose::STANDARD.encode(wide)
}

#[cfg(windows)]
fn webview_processes_for_profile(stop: bool) -> Option<u32> {
    let encoded = encode_powershell(&webview_process_script(stop));
    run_hidden_bounded(
        &powershell_exe(),
        &["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded],
        HELPER_TIMEOUT,
    )
    .and_then(|text| text.trim().parse::<u32>().ok())
}

#[cfg(windows)]
fn stop_webview_after_exit_script(pid: u32) -> String {
    format!(
        "Wait-Process -Id {pid} -Timeout {} -ErrorAction SilentlyContinue; {}",
        HELPER_TIMEOUT.as_secs(),
        webview_process_script(true)
    )
}

#[cfg(windows)]
fn stop_webview_after_exit() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let encoded = encode_powershell(&stop_webview_after_exit_script(std::process::id()));
    std::process::Command::new(powershell_exe())
        .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .is_ok()
}

#[cfg(windows)]
mod native {
    use std::time::Duration;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{
        GetCurrentProcess, OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, InternalGetWindowText, IsIconic, IsWindowVisible,
    };

    struct Search {
        pid: u32,
        title: Vec<u16>,
        found: bool,
    }

    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam.0 as *mut Search);
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid != search.pid || !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return BOOL(1);
        }
        let mut buffer = [0u16; 128];
        let length = InternalGetWindowText(hwnd, &mut buffer).max(0) as usize;
        if buffer[..length] == search.title[..] {
            search.found = true;
            return BOOL(0);
        }
        BOOL(1)
    }

    pub fn window_on_screen(title: &str) -> bool {
        let mut search = Search {
            pid: std::process::id(),
            title: title.encode_utf16().collect(),
            found: false,
        };
        unsafe {
            let _ = EnumWindows(Some(visit), LPARAM(&mut search as *mut Search as isize));
        }
        search.found
    }

    pub fn wait_for_exit(pid: u32, limit: Duration) -> bool {
        unsafe {
            let Ok(handle) = OpenProcess(PROCESS_SYNCHRONIZE, false, pid) else {
                return true;
            };
            let result = WaitForSingleObject(handle, limit.as_millis() as u32);
            let _ = CloseHandle(handle);
            result == WAIT_OBJECT_0
        }
    }

    pub fn terminate_now() -> ! {
        unsafe {
            let _ = TerminateProcess(GetCurrentProcess(), 0);
        }
        std::process::exit(0)
    }
}

#[cfg(windows)]
fn parse_restart_pid(value: Option<&std::ffi::OsStr>, own_pid: u32) -> Option<u32> {
    value
        .and_then(|text| text.to_str())
        .and_then(|text| text.trim().parse::<u32>().ok())
        .filter(|pid| *pid != 0 && *pid != own_pid)
}

#[cfg(windows)]
fn wait_for_previous_instance() {
    let value = std::env::var_os(RESTART_WAIT_ENV);
    if value.is_none() {
        return;
    }
    std::env::remove_var(RESTART_WAIT_ENV);
    let Some(pid) = parse_restart_pid(value.as_deref(), std::process::id()) else {
        return;
    };
    let exited = native::wait_for_exit(pid, RESTART_WAIT_LIMIT);
    log_line(&format!(
        "restarted after a stalled launch, previous process {}",
        if exited { "exited" } else { "is still running" }
    ));
}

#[cfg(windows)]
fn clear_stalled_webview() {
    if !marker_exists(WEBVIEW_STALL_MARKER) {
        return;
    }
    remove_marker(WEBVIEW_STALL_MARKER);
    match webview_processes_for_profile(true) {
        Some(count) => log_line(&format!("stopped {count} leftover webview processes")),
        None => log_line("could not check for leftover webview processes"),
    }
}

#[cfg(windows)]
fn restart_args(args: Vec<std::ffi::OsString>, window_visible: bool) -> Vec<std::ffi::OsString> {
    if !window_visible {
        return args;
    }
    args.into_iter()
        .filter(|arg| {
            arg.as_os_str() != std::ffi::OsStr::new(crate::launch_at_login::AUTOSTART_ARG)
        })
        .collect()
}

#[cfg(windows)]
fn should_restart_after_webview_loss(uptime: Duration) -> bool {
    uptime >= WEBVIEW_RESTART_MIN_UPTIME
}

#[cfg(windows)]
pub fn handle_webview_process_failure(app: &tauri::AppHandle, browser_exited: bool) {
    if !browser_exited {
        reload_main_webview(app, "the webview page process stopped");
        return;
    }
    let state: tauri::State<BootState> = app.state();
    let uptime = state.uptime();
    log_line(&format!(
        "webview browser process exited after {}s",
        uptime.as_secs()
    ));
    if !should_restart_after_webview_loss(uptime) {
        return;
    }
    let visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(true);
    restart_process(restart_args(std::env::args_os().skip(1).collect(), visible))
}

#[cfg(windows)]
fn restart_without_event_loop() -> ! {
    log_line("restarting without the event loop");
    restart_process(std::env::args_os().skip(1).collect())
}

#[cfg(windows)]
fn restart_process(args: Vec<std::ffi::OsString>) -> ! {
    if let Ok(exe) = std::env::current_exe() {
        let spawned = std::process::Command::new(exe)
            .args(args)
            .env(RESTART_WAIT_ENV, std::process::id().to_string())
            .spawn();
        if let Err(error) = spawned {
            log_line(&format!("restart failed: {error}"));
        }
    }
    native::terminate_now()
}

#[cfg(not(windows))]
fn window_is_on_screen(app: &tauri::AppHandle) -> bool {
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    window.is_visible().unwrap_or(true) && !window.is_minimized().unwrap_or(false)
}

fn main_window_on_screen(app: &tauri::AppHandle, setup_finished: bool) -> bool {
    #[cfg(windows)]
    {
        let _ = (app, setup_finished);
        native::window_on_screen(MAIN_WINDOW_TITLE)
    }
    #[cfg(not(windows))]
    {
        setup_finished && window_is_on_screen(app)
    }
}

#[cfg(windows)]
fn show_restart_warning() {
    rfd::MessageDialog::new()
        .set_title("Aster Mail - Display Problem")
        .set_description(
            "Aster Mail is running but its window is not being drawn.\n\nThis is almost always a graphics driver or Microsoft WebView2 problem, not a problem with your account or your mail.\n\nAster Mail will now restart with hardware acceleration turned off. Your mail is unaffected.",
        )
        .set_level(rfd::MessageLevel::Warning)
        .show();
}

#[cfg(windows)]
fn warn_and_restart(app: &tauri::AppHandle) {
    show_restart_warning();
    app.restart();
}

#[cfg(all(unix, not(target_os = "macos")))]
fn warn_and_restart(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    app.dialog()
        .message(
            "Aster Mail is running but its window is not being drawn.

This is almost always a graphics driver or system webview problem, not a problem with your account or your mail.

Aster Mail will now restart in compatibility mode. Your mail is unaffected.",
        )
        .title("Aster Mail - Display Problem")
        .kind(MessageDialogKind::Warning)
        .blocking_show();
    app.restart();
}

#[cfg(windows)]
fn persistent_failure_description(runtime: &str, closing: bool) -> String {
    let log_hint = app_local_dir()
        .map(|d| d.join(BOOT_LOG_FILE).display().to_string())
        .unwrap_or_else(|| BOOT_LOG_FILE.to_string());
    let ending = if closing {
        "Aster Mail will now close."
    } else {
        "Quit Aster Mail now?"
    };
    format!(
        "Aster Mail still cannot draw its window, even with hardware acceleration turned off.\n\nThe Microsoft WebView2 Runtime on this computer appears to be damaged, or other software on this computer is blocking it. To repair it:\n\n1. Open Windows Settings, then Apps, then Installed apps.\n2. Find \"Microsoft Edge WebView2 Runtime\", choose Modify, then Repair.\n3. If Repair is unavailable, reinstall it from https://developer.microsoft.com/microsoft-edge/webview2/\n4. Start Aster Mail again.\n\nDetected WebView2 runtime: {runtime}\n\nIf this keeps happening, email support@astermail.org, mention code WV2-BOOT, and attach this file:\n{log_hint}\n\n{ending}"
    )
}

#[cfg(windows)]
fn report_persistent_failure(app: &tauri::AppHandle) {
    let runtime = webview2_runtime_version();
    log_line(&format!("webview2 runtime version: {runtime}"));
    let answer = rfd::MessageDialog::new()
        .set_title("Aster Mail - Display Problem")
        .set_description(persistent_failure_description(&runtime, false))
        .set_level(rfd::MessageLevel::Error)
        .set_buttons(rfd::MessageButtons::YesNo)
        .show();
    if answer == rfd::MessageDialogResult::Yes {
        app.exit(0);
    }
}

#[cfg(windows)]
fn report_stalled_failure(runtime: &str) -> ! {
    rfd::MessageDialog::new()
        .set_title("Aster Mail - Display Problem")
        .set_description(persistent_failure_description(runtime, true))
        .set_level(rfd::MessageLevel::Error)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
    log_line("closing after a stalled launch");
    if !stop_webview_after_exit() {
        log_line("could not schedule webview cleanup");
    }
    native::terminate_now()
}

#[cfg(not(windows))]
fn report_persistent_failure(app: &tauri::AppHandle) {
    use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
    let log_hint = app_local_dir()
        .map(|d| d.join(BOOT_LOG_FILE).display().to_string())
        .unwrap_or_else(|| BOOT_LOG_FILE.to_string());
    app.dialog()
        .message(&format!(
            "Aster Mail is running but its window is not being drawn.\n\nThis is almost always a graphics driver or system webview problem, not a problem with your account or your mail.\n\nRestarting your computer resolves most cases. If it keeps happening, email support@astermail.org, mention code GFX-BOOT, and attach this file:\n{log_hint}"
        ))
        .title("Aster Mail - Display Problem")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

#[derive(Debug, PartialEq, Eq)]
enum WatchdogStep {
    Healthy,
    Wait,
    Reload,
    Failed,
}

#[derive(Default)]
struct WatchdogClock {
    on_screen: Duration,
    reloaded: bool,
}

impl WatchdogClock {
    fn step(&mut self, usable: bool, on_screen: bool, can_reload: bool) -> WatchdogStep {
        if usable {
            return WatchdogStep::Healthy;
        }
        if !on_screen {
            return WatchdogStep::Wait;
        }
        self.on_screen += POLL_INTERVAL;
        if self.on_screen < BOOT_TIMEOUT {
            return WatchdogStep::Wait;
        }
        self.on_screen = Duration::ZERO;
        if can_reload && !self.reloaded {
            self.reloaded = true;
            return WatchdogStep::Reload;
        }
        WatchdogStep::Failed
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Recovery {
    RestartInCompat,
    RestartWithoutEventLoop,
    Report,
    ReportAndClose,
}

fn choose_recovery(compat_active: bool, setup_finished: bool, can_restart: bool) -> Recovery {
    match (compat_active || !can_restart, setup_finished) {
        (false, true) => Recovery::RestartInCompat,
        (false, false) => Recovery::RestartWithoutEventLoop,
        (true, true) => Recovery::Report,
        (true, false) => Recovery::ReportAndClose,
    }
}

fn eval_reload(app: &tauri::AppHandle) {
    let state: tauri::State<BootState> = app.state();
    state.prepare_reload();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(crate::RELOAD_WITHOUT_OPEN_EMAIL_JS);
    }
}

pub fn reload_main_webview(app: &tauri::AppHandle, reason: &str) {
    log_line(&format!("reloading the window: {reason}"));
    eval_reload(app);
    spawn_watchdog(app.clone());
}

pub fn reload_on_first_show_after_hidden_start(app: &tauri::AppHandle) {
    let state: tauri::State<BootState> = app.state();
    if !state.setup_finished() || !state.take_first_show_after_hidden_start() {
        return;
    }
    reload_main_webview(app, "first show after a hidden start");
}

struct WatchdogLease(tauri::AppHandle);

impl Drop for WatchdogLease {
    fn drop(&mut self) {
        let state: tauri::State<BootState> = self.0.state();
        state.watchdog_running.store(false, Ordering::SeqCst);
    }
}

pub fn spawn_watchdog(app: tauri::AppHandle) {
    {
        let state: tauri::State<BootState> = app.state();
        if state.watchdog_running.swap(true, Ordering::SeqCst) {
            return;
        }
    }
    std::thread::spawn(move || {
        let _lease = WatchdogLease(app.clone());
        let started = Instant::now();
        let mut clock = WatchdogClock::default();

        loop {
            let state: tauri::State<BootState> = app.state();
            let setup_finished = state.setup_finished();
            let stalled = cfg!(windows) && !setup_finished;
            let on_screen = stalled || main_window_on_screen(&app, setup_finished);
            let can_reload = setup_finished && state.started_hidden();
            match clock.step(state.is_usable(), on_screen, can_reload) {
                WatchdogStep::Healthy => {
                    log_line(&format!(
                        "boot healthy after {}ms",
                        started.elapsed().as_millis()
                    ));
                    return;
                }
                WatchdogStep::Reload => {
                    log_line("window is on screen without a frame, reloading it");
                    eval_reload(&app);
                    std::thread::sleep(POLL_INTERVAL);
                }
                WatchdogStep::Failed => break,
                WatchdogStep::Wait => std::thread::sleep(POLL_INTERVAL),
            }
        }

        let state: tauri::State<BootState> = app.state();
        let setup_finished = state.setup_finished();
        log_line(&format!(
            "boot failed: stage={} script_ran={} painted={} compat={}",
            state.stage().label(),
            state.script_ran(),
            state.painted(),
            compat_mode_active()
        ));

        #[cfg(windows)]
        let runtime = if setup_finished {
            String::new()
        } else {
            let runtime = webview2_runtime_version();
            let processes = webview_processes_for_profile(false)
                .map(|count| count.to_string())
                .unwrap_or_else(|| "unknown".to_string());
            log_line(&format!(
                "startup stalled: webview2 runtime {runtime}, webview processes for this profile {processes}"
            ));
            write_marker(WEBVIEW_STALL_MARKER);
            runtime
        };

        let can_restart = cfg!(any(windows, all(unix, not(target_os = "macos"))));
        match choose_recovery(compat_mode_active(), setup_finished, can_restart) {
            Recovery::RestartInCompat => {
                write_marker(COMPAT_MODE_MARKER);
                write_marker(WEBVIEW_RESET_MARKER);
                #[cfg(any(windows, all(unix, not(target_os = "macos"))))]
                warn_and_restart(&app);
                return;
            }
            Recovery::RestartWithoutEventLoop => {
                write_marker(COMPAT_MODE_MARKER);
                write_marker(WEBVIEW_RESET_MARKER);
                #[cfg(windows)]
                {
                    show_restart_warning();
                    restart_without_event_loop();
                }
                #[cfg(not(windows))]
                return;
            }
            Recovery::Report | Recovery::ReportAndClose => {}
        }

        #[cfg(all(unix, not(target_os = "macos")))]
        if crate::webkit_sandbox::fall_back_after_failed_boot() {
            write_marker(WEBVIEW_RESET_MARKER);
            warn_and_restart(&app);
            return;
        }

        write_marker(WEBVIEW_RESET_MARKER);
        #[cfg(windows)]
        if !setup_finished {
            report_stalled_failure(&runtime);
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stage_only_moves_forward() {
        let state = BootState::new();
        assert_eq!(state.stage(), SetupStage::Starting);
        assert!(state.advance_stage(SetupStage::CreatingWindow));
        assert!(!state.advance_stage(SetupStage::TrayReady));
        assert!(!state.advance_stage(SetupStage::CreatingWindow));
        assert_eq!(state.stage(), SetupStage::CreatingWindow);
        assert!(!state.setup_finished());
        assert!(state.advance_stage(SetupStage::Finished));
        assert!(state.setup_finished());
    }

    #[test]
    fn stage_round_trips_through_its_number() {
        for stage in [
            SetupStage::Starting,
            SetupStage::TrayReady,
            SetupStage::CreatingWindow,
            SetupStage::WindowCreated,
            SetupStage::Finished,
        ] {
            assert_eq!(SetupStage::from_u8(stage as u8), stage);
        }
        assert_eq!(SetupStage::from_u8(200), SetupStage::Starting);
    }

    fn polls_until_timeout() -> usize {
        (BOOT_TIMEOUT.as_millis() / POLL_INTERVAL.as_millis()) as usize
    }

    #[test]
    fn watchdog_fails_after_the_window_stays_dark() {
        let mut clock = WatchdogClock::default();
        for _ in 1..polls_until_timeout() {
            assert_eq!(clock.step(false, true, false), WatchdogStep::Wait);
        }
        assert_eq!(clock.step(false, true, false), WatchdogStep::Failed);
    }

    #[test]
    fn watchdog_keeps_watching_a_hidden_window() {
        let mut clock = WatchdogClock::default();
        for _ in 0..100_000 {
            assert_eq!(clock.step(false, false, true), WatchdogStep::Wait);
        }
        for _ in 1..polls_until_timeout() {
            assert_eq!(clock.step(false, true, true), WatchdogStep::Wait);
        }
        assert_eq!(clock.step(false, true, true), WatchdogStep::Reload);
    }

    #[test]
    fn watchdog_reloads_once_before_failing() {
        let mut clock = WatchdogClock::default();
        for _ in 1..polls_until_timeout() {
            clock.step(false, true, true);
        }
        assert_eq!(clock.step(false, true, true), WatchdogStep::Reload);
        for _ in 1..polls_until_timeout() {
            assert_eq!(clock.step(false, true, true), WatchdogStep::Wait);
        }
        assert_eq!(clock.step(false, true, true), WatchdogStep::Failed);
    }

    #[test]
    fn watchdog_recovers_when_the_reload_paints() {
        let mut clock = WatchdogClock::default();
        for _ in 1..polls_until_timeout() {
            clock.step(false, true, true);
        }
        assert_eq!(clock.step(false, true, true), WatchdogStep::Reload);
        assert_eq!(clock.step(true, true, true), WatchdogStep::Healthy);
    }

    #[test]
    fn watchdog_reports_healthy_once_painted() {
        let mut clock = WatchdogClock::default();
        assert_eq!(clock.step(false, true, false), WatchdogStep::Wait);
        assert_eq!(clock.step(true, true, false), WatchdogStep::Healthy);
    }

    #[test]
    fn first_show_after_a_hidden_start_is_taken_once() {
        let state = BootState::new();
        assert!(!state.take_first_show_after_hidden_start());
        state.mark_started_hidden();
        assert!(state.take_first_show_after_hidden_start());
        assert!(!state.take_first_show_after_hidden_start());
    }

    #[test]
    fn a_reload_consumes_the_first_show_and_clears_the_frame() {
        let state = BootState::new();
        state.mark_started_hidden();
        state.mark_painted();
        state.prepare_reload();
        assert!(!state.painted());
        assert!(!state.take_first_show_after_hidden_start());
    }

    #[cfg(windows)]
    #[test]
    fn restart_after_webview_loss_shows_a_visible_window() {
        let args = vec![
            std::ffi::OsString::from(crate::launch_at_login::AUTOSTART_ARG),
            std::ffi::OsString::from("mailto:a@b.c"),
        ];
        assert_eq!(restart_args(args.clone(), false), args);
        assert_eq!(
            restart_args(args, true),
            vec![std::ffi::OsString::from("mailto:a@b.c")]
        );
    }

    #[cfg(windows)]
    #[test]
    fn webview_loss_restarts_only_after_a_settled_start() {
        assert!(!should_restart_after_webview_loss(Duration::from_secs(5)));
        assert!(should_restart_after_webview_loss(
            WEBVIEW_RESTART_MIN_UPTIME
        ));
    }

    #[test]
    fn stalled_setup_restarts_without_the_event_loop() {
        assert_eq!(
            choose_recovery(false, false, true),
            Recovery::RestartWithoutEventLoop
        );
        assert_eq!(choose_recovery(true, false, true), Recovery::ReportAndClose);
    }

    #[test]
    fn finished_setup_keeps_the_regular_recovery() {
        assert_eq!(
            choose_recovery(false, true, true),
            Recovery::RestartInCompat
        );
        assert_eq!(choose_recovery(true, true, true), Recovery::Report);
        assert_eq!(choose_recovery(false, true, false), Recovery::Report);
    }

    #[cfg(windows)]
    #[test]
    fn restart_pid_is_parsed_and_validated() {
        use std::ffi::OsStr;
        assert_eq!(parse_restart_pid(Some(OsStr::new("4242")), 1), Some(4242));
        assert_eq!(parse_restart_pid(Some(OsStr::new(" 17 ")), 1), Some(17));
        assert_eq!(parse_restart_pid(Some(OsStr::new("1")), 1), None);
        assert_eq!(parse_restart_pid(Some(OsStr::new("0")), 1), None);
        assert_eq!(parse_restart_pid(Some(OsStr::new("abc")), 1), None);
        assert_eq!(parse_restart_pid(None, 1), None);
    }

    #[cfg(windows)]
    #[test]
    fn webview_cleanup_only_targets_this_profile() {
        let script = webview_process_script(true);
        assert!(script.contains("msedgewebview2.exe"));
        assert!(script.contains(r"\com.astermail.mail\EBWebView"));
        let after_exit = stop_webview_after_exit_script(4242);
        assert!(after_exit.starts_with("Wait-Process -Id 4242 -Timeout 15 "));
        assert!(after_exit.contains("Stop-Process"));
        assert_eq!(encode_powershell("a"), "YQA=");
        assert!(script.contains("Stop-Process"));
        assert!(!webview_process_script(false).contains("Stop-Process"));
    }

    #[cfg(windows)]
    #[test]
    fn hidden_command_returns_output_and_times_out() {
        let output = run_hidden_bounded(
            &system32_tool(&["cmd.exe"]),
            &["/C", "echo ready"],
            HELPER_TIMEOUT,
        );
        assert_eq!(output.as_deref().map(str::trim), Some("ready"));
        let started = Instant::now();
        let stuck = run_hidden_bounded(
            &powershell_exe(),
            &["-NoProfile", "-Command", "Start-Sleep -Seconds 30"],
            Duration::from_secs(2),
        );
        assert!(stuck.is_none());
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn system_tools_resolve_under_the_system_root() {
        let root = std::env::temp_dir();
        assert_eq!(
            system32_tool_in(Some(root.clone().into_os_string()), &["reg.exe"]),
            root.join("System32").join("reg.exe")
        );
        let fallback = PathBuf::from(r"C:\Windows")
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        let parts = ["WindowsPowerShell", "v1.0", "powershell.exe"];
        assert_eq!(system32_tool_in(None, &parts), fallback);
        assert_eq!(system32_tool_in(Some("".into()), &parts), fallback);
        assert_eq!(system32_tool_in(Some("Windows".into()), &parts), fallback);
    }

    #[test]
    fn explorer_resolves_under_the_system_root() {
        let root = std::env::temp_dir();
        assert_eq!(
            explorer_exe_in(Some(root.clone().into_os_string())),
            root.join("explorer.exe")
        );
        let fallback = PathBuf::from(r"C:\Windows").join("explorer.exe");
        assert_eq!(explorer_exe_in(None), fallback);
        assert_eq!(explorer_exe_in(Some("Windows".into())), fallback);
    }

    #[cfg(windows)]
    #[test]
    fn missing_window_is_not_on_screen() {
        assert!(!native::window_on_screen("no window has this title 7f3c"));
    }
}
