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
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod badge;
mod badges_data;
mod boot_guard;
mod device;
mod http_client;

use std::sync::Mutex;
#[cfg(windows)]
use tauri::menu::Submenu;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::NewWindowResponse,
    Emitter, Manager, State, Url, WindowEvent,
};

const LINK_ACTIVATED_EVENT: &str = "aster://link-activated";

const APP_NAVIGATION_HOSTS: &[&str] = &[
    "tauri.localhost",
    "asset.localhost",
    "ipc.localhost",
    "localhost",
    "127.0.0.1",
    "challenges.cloudflare.com",
    "js.stripe.com",
    "hooks.stripe.com",
    "api.stripe.com",
    "m.stripe.network",
    "r.stripe.com",
    "q.stripe.com",
];

const APP_NAVIGATION_SUFFIXES: &[&str] = &[
    ".astermail.org",
    ".astermail.com",
    ".stripe.com",
    ".stripe.network",
    ".onion",
];

const INTERNAL_SCHEMES: &[&str] = &["about", "blob", "data", "tauri", "asset", "ipc", "file"];

const FORWARDED_SCHEMES: &[&str] = &["http", "https", "mailto", "aster"];

fn is_app_navigation(url: &Url) -> bool {
    if INTERNAL_SCHEMES.contains(&url.scheme()) {
        return true;
    }

    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }

    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.to_ascii_lowercase();

    APP_NAVIGATION_HOSTS.iter().any(|entry| host == *entry)
        || APP_NAVIGATION_SUFFIXES
            .iter()
            .any(|suffix| host.ends_with(suffix))
}

fn should_forward_to_app(url: &Url) -> bool {
    FORWARDED_SCHEMES.contains(&url.scheme())
}

struct TrayState(Mutex<Option<tauri::tray::TrayIcon>>);

#[tauri::command]
fn set_tray_visible(state: State<TrayState>, visible: bool) {
    let Ok(guard) = state.0.lock() else { return };
    if let Some(tray) = guard.as_ref() {
        let _ = tray.set_visible(visible);
    }
}

#[tauri::command]
fn set_tray_tooltip(state: State<TrayState>, tooltip: String) {
    let Ok(guard) = state.0.lock() else { return };
    if let Some(tray) = guard.as_ref() {
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

#[tauri::command]
fn frontend_ready(state: State<boot_guard::BootState>) {
    state.mark_script_ran();
}

#[tauri::command]
fn frontend_painted(state: State<boot_guard::BootState>) {
    state.mark_painted();
}

#[tauri::command]
fn set_content_protection(window: tauri::WebviewWindow, enabled: bool) -> std::result::Result<(), String> {
    window
        .set_content_protected(enabled)
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
fn open_in_default_handler(app: &tauri::AppHandle, url: String) {
    let _ = app.run_on_main_thread(move || {
        use objc2_app_kit::NSWorkspace;
        use objc2_foundation::{NSString, NSURL};

        let target = NSURL::URLWithString(&NSString::from_str(&url));

        if let Some(target) = target {
            NSWorkspace::sharedWorkspace().openURL(&target);
        }
    });
}

#[tauri::command]
async fn open_external_url(app: tauri::AppHandle, url: String) -> std::result::Result<(), String> {
    if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("url contains invalid characters".into());
    }

    let parsed = reqwest::Url::parse(&url).map_err(|_| "invalid url".to_string())?;
    match parsed.scheme() {
        "https" | "http" => {
            if parsed.host_str().map(|h| h.is_empty()).unwrap_or(true) {
                return Err("url must have a host".into());
            }
        }
        "mailto" => {}
        _ => return Err("scheme not allowed".into()),
    }

    #[cfg(target_os = "macos")]
    {
        open_in_default_handler(&app, url);

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            use tauri_plugin_shell::ShellExt;

            #[allow(deprecated)]
            app.shell().open(&url, None).map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| e.to_string())?
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn ensure_system_wayland() {
    use std::os::unix::process::CommandExt;

    if std::env::var("_ASTER_REEXEC").is_ok() {
        return;
    }

    if std::env::var("APPIMAGE").is_err() {
        return;
    }

    let multiarch_dir = format!("/usr/lib/{}-linux-gnu", std::env::consts::ARCH);

    let system_lib = [
        "/usr/lib64/libwayland-client.so.0".to_string(),
        "/usr/lib64/libwayland-client.so".to_string(),
        format!("{multiarch_dir}/libwayland-client.so.0"),
        format!("{multiarch_dir}/libwayland-client.so"),
        "/usr/lib/libwayland-client.so.0".to_string(),
        "/usr/lib/libwayland-client.so".to_string(),
    ].iter().find(|p| std::path::Path::new(p).exists()).cloned();

    let system_lib = match system_lib {
        Some(lib) => lib,
        None => {
            let lib_dirs = [
                "/usr/lib64".to_string(),
                "/usr/lib".to_string(),
                multiarch_dir,
            ];
            let mut found = None;
            for dir in &lib_dirs {
                if let Ok(entries) = std::fs::read_dir(dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name();
                        if let Some(name_str) = name.to_str() {
                            if name_str.starts_with("libwayland-client.so") {
                                found = Some(format!("{dir}/{name_str}"));
                                break;
                            }
                        }
                    }
                }
                if found.is_some() {
                    break;
                }
            }
            match found {
                Some(lib) => lib,
                None => return,
            }
        }
    };

    let current_preload = std::env::var("LD_PRELOAD").unwrap_or_default();
    let new_preload = if current_preload.is_empty() {
        system_lib
    } else {
        format!("{system_lib}:{current_preload}")
    };

    std::env::set_var("LD_PRELOAD", &new_preload);
    std::env::set_var("_ASTER_REEXEC", "1");

    let Ok(exe) = std::env::current_exe() else {
        return;
    };

    let args: Vec<String> = std::env::args().skip(1).collect();
    let _err = std::process::Command::new(exe).args(&args).exec();
}

#[cfg(target_os = "macos")]
fn clear_stale_webkit_keychain() {
    use std::process::Command;
    for _ in 0..5 {
        let result = Command::new("security")
            .args(["delete-generic-password", "-s", "com.astermail.mail", "-l", "Aster Mail Desktop web mail web crypto master key"])
            .output();
        match result {
            Ok(output) if output.status.success() => continue,
            _ => break,
        }
    }
}

fn main() {
    boot_guard::prepare();

    #[cfg(all(unix, not(target_os = "macos")))]
    ensure_system_wayland();

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_THREADED_COMPOSITOR", "1");
        if std::env::var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS").is_err() {
            std::env::set_var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let was_visible = window.is_visible().unwrap_or(true);
                if !was_visible {
                    let _ = window.eval("window.location.reload()");
                }
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(TrayState(Mutex::new(None)))
        .manage(boot_guard::BootState::new())
        .invoke_handler(tauri::generate_handler![
            frontend_ready,
            frontend_painted,
            badge::set_unread_badge,
            set_tray_visible,
            set_tray_tooltip,
            set_content_protection,
            open_external_url,
            device::crypto::device_get_pubkeys,
            device::crypto::device_set_id,
            device::crypto::device_sign_challenge,
            device::crypto::device_unseal_vault_envelope,
            device::crypto::device_get_stored_passphrase,
            device::crypto::device_clear_session,
            device::crypto::device_clear_identity,
            device::crypto::device_auth_store_set,
            device::crypto::device_auth_store_get,
            device::crypto::device_auth_store_clear,
            device::crypto::device_http_request,
            device::crypto::crypto_pbkdf2,
            device::crypto::crypto_hkdf,
            device::crypto::crypto_aes_gcm_encrypt,
            device::crypto::crypto_aes_gcm_decrypt,
            device::crypto::crypto_hmac_sign,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            clear_stale_webkit_keychain();

            let window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .cloned()
                .ok_or("main window is missing from the app configuration")?;

            let navigation_handle = app.handle().clone();
            let new_window_handle = app.handle().clone();

            tauri::WebviewWindowBuilder::from_config(app, &window_config)?
                .on_navigation(move |url| {
                    if is_app_navigation(url) {
                        return true;
                    }
                    if should_forward_to_app(url) {
                        let _ = navigation_handle.emit(LINK_ACTIVATED_EVENT, url.to_string());
                    }

                    false
                })
                .on_new_window(move |url, _features| {
                    if should_forward_to_app(&url) {
                        let _ = new_window_handle.emit(LINK_ACTIVATED_EVENT, url.to_string());
                    }

                    NewWindowResponse::Deny
                })
                .build()?;

            #[cfg(target_os = "macos")]
            let tray_icon_bytes = include_bytes!("../icons/icon_macos_template.png").as_slice();
            #[cfg(windows)]
            let tray_icon_bytes = include_bytes!("../icons/32x32.png").as_slice();
            #[cfg(all(unix, not(target_os = "macos")))]
            let tray_icon_bytes = include_bytes!("../icons/icon_hires.png").as_slice();
            let tray_icon = tauri::image::Image::from_bytes(tray_icon_bytes)
                .expect("failed to load tray icon");

            let show =
                MenuItem::with_id(app, "show", "Show Aster Mail", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            #[cfg(windows)]
            let compat_on = MenuItem::with_id(
                app,
                "compat_on",
                "Restart in compatibility mode",
                !boot_guard::compat_mode_active(),
                None::<&str>,
            )?;
            #[cfg(windows)]
            let compat_off = MenuItem::with_id(
                app,
                "compat_off",
                "Restart with hardware acceleration",
                boot_guard::compat_mode_active(),
                None::<&str>,
            )?;
            #[cfg(windows)]
            let display_reset = MenuItem::with_id(
                app,
                "display_reset",
                "Reset display cache and restart",
                true,
                None::<&str>,
            )?;
            #[cfg(windows)]
            let troubleshooting = Submenu::with_items(
                app,
                "If the window is blank",
                true,
                &[&compat_on, &compat_off, &display_reset],
            )?;
            #[cfg(windows)]
            let menu = Menu::with_items(app, &[&show, &troubleshooting, &quit])?;
            #[cfg(not(windows))]
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .icon_as_template(true)
                .menu(&menu)
                .tooltip("Aster Mail")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "compat_on" => {
                        boot_guard::enable_compat_mode();
                        app.restart();
                    }
                    "compat_off" => {
                        boot_guard::disable_compat_mode();
                        app.restart();
                    }
                    "display_reset" => {
                        boot_guard::request_display_reset();
                        app.restart();
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            let state: State<TrayState> = app.state();
            if let Ok(mut guard) = state.0.lock() {
                *guard = Some(tray);
            }

            boot_guard::spawn_watchdog(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state: State<boot_guard::BootState> = window.state();
                if !state.is_usable() {
                    return;
                }
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build({
            #[allow(unused_mut)]
            let mut context = tauri::generate_context!();
            #[cfg(windows)]
            boot_guard::apply_compat_browser_args(context.config_mut());
            context
        })
        .unwrap_or_else(|error| {
            boot_guard::show_fatal_webview_error(&error.to_string());
            std::process::exit(1);
        })
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
