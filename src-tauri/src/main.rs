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

mod device;
mod tor;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, State, WindowEvent,
};

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
fn open_external_url(url: String) -> std::result::Result<(), String> {
    if !url.starts_with("https://") {
        return Err("only https urls allowed".into());
    }
    std::thread::spawn(move || {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = std::process::Command::new("rundll32")
                .args(["url.dll,FileProtocolHandler", &url])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
        }
        #[cfg(target_os = "macos")]
        {
            let _ = std::process::Command::new("open").arg(&url).spawn();
        }
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let _ = std::process::Command::new("xdg-open").arg(&url).spawn();
        }
    });
    Ok(())
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

    let search_paths = [
        "/usr/lib64/libwayland-client.so",
        "/usr/lib/x86_64-linux-gnu/libwayland-client.so",
        "/usr/lib/libwayland-client.so",
    ];

    let Some(system_lib) = search_paths
        .iter()
        .find(|p| std::path::Path::new(p).exists())
    else {
        return;
    };

    let current_preload = std::env::var("LD_PRELOAD").unwrap_or_default();
    let new_preload = if current_preload.is_empty() {
        system_lib.to_string()
    } else {
        format!("{system_lib}:{current_preload}")
    };

    std::env::set_var("LD_PRELOAD", new_preload);
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
            .args(["delete-generic-password", "-l", "Aster Mail Desktop web mail web crypto master key"])
            .output();
        match result {
            Ok(output) if output.status.success() => continue,
            _ => break,
        }
    }
}

fn main() {
    #[cfg(all(unix, not(target_os = "macos")))]
    ensure_system_wayland();

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .manage(TrayState(Mutex::new(None)))
        .manage(tor::TorState::default())
        .invoke_handler(tauri::generate_handler![
            set_tray_visible,
            set_tray_tooltip,
            open_external_url,
            tor::commands::tor_start,
            tor::commands::tor_stop,
            tor::commands::tor_status,
            tor::commands::tor_fetch,
            device::crypto::device_get_pubkeys,
            device::crypto::device_set_id,
            device::crypto::device_sign_challenge,
            device::crypto::device_unseal_vault_envelope,
            device::crypto::device_get_stored_passphrase,
            device::crypto::device_clear_session,
            device::crypto::device_clear_identity,
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

            #[cfg(target_os = "macos")]
            let icon_bytes = include_bytes!("../icons/icon_macos.png");
            #[cfg(not(target_os = "macos"))]
            let icon_bytes = include_bytes!("../icons/icon_hires.png");
            let hires_icon = tauri::image::Image::from_bytes(icon_bytes)
                .expect("failed to load hires icon");

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(hires_icon.clone());
            }

            let show =
                MenuItem::with_id(app, "show", "Show Aster Mail", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let tray = TrayIconBuilder::new()
                .icon(hires_icon)
                .menu(&menu)
                .tooltip("Aster Mail")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
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

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to start aster mail desktop");
}
