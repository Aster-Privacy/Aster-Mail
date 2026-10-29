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
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Emitter, Manager, State};

pub const DOWNLOAD_FINISHED_EVENT: &str = "aster://download-finished";
pub const DOWNLOAD_FAILED_EVENT: &str = "aster://download-failed";

const MAX_TRACKED_DOWNLOADS: usize = 64;
const MAX_FILE_NAME_CHARS: usize = 255;

const BLOCKED_OPEN_EXTENSIONS: &[&str] = &[
    "ade", "adp", "app", "appimage", "appref-ms", "application", "apk", "applescript", "bas",
    "bat", "bin", "chm", "cmd", "com", "command", "cpl", "crt", "csh", "deb", "desktop", "dll",
    "dmg", "elf", "exe", "flatpakref", "gadget", "hlp", "hta", "inf", "ins", "isp", "jar",
    "jnlp", "js", "jse", "ksh", "lnk", "mde", "msc", "msi", "msix", "msixbundle", "msp", "mst",
    "pif", "pkg", "pl", "plist", "ps1", "ps1xml", "ps2", "psc1", "psm1", "py", "pyc", "pyw",
    "rb", "reg", "rgs", "rpm", "run", "scf", "scpt", "scr", "sct", "settingcontent-ms", "sh",
    "shb", "shs", "snap", "so", "svg", "sys", "terminal", "tool", "url", "vb", "vbe", "vbs",
    "vhd", "vhdx", "webloc", "workflow", "ws", "wsc", "wsf", "wsh", "xbap", "xll", "xpi",
    "htm", "html", "xht", "xhtml", "mht", "mhtml", "shtml",
];

#[derive(Clone, Serialize)]
pub struct DownloadFinished {
    pub id: String,
    pub file_name: String,
    pub can_open: bool,
}

#[derive(Clone, Serialize)]
pub struct DownloadFailed {
    pub file_name: String,
}

#[derive(Default)]
pub struct CompletedDownloads(Mutex<VecDeque<(String, PathBuf)>>);

impl CompletedDownloads {
    fn insert(&self, path: PathBuf) -> Option<String> {
        let id = uuid::Uuid::new_v4().to_string();
        let mut guard = self.0.lock().ok()?;

        while guard.len() >= MAX_TRACKED_DOWNLOADS {
            guard.pop_front();
        }
        guard.push_back((id.clone(), path));

        Some(id)
    }

    fn get(&self, id: &str) -> Option<PathBuf> {
        let guard = self.0.lock().ok()?;

        guard
            .iter()
            .find(|(entry_id, _)| entry_id == id)
            .map(|(_, path)| path.clone())
    }
}

pub fn display_file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_FILE_NAME_CHARS)
        .collect()
}

pub fn is_safe_to_open(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    let lowered = name.trim_end_matches(['.', ' ']).to_ascii_lowercase();

    match Path::new(&lowered).extension().and_then(|ext| ext.to_str()) {
        Some(extension) => !BLOCKED_OPEN_EXTENSIONS.contains(&extension),
        None => false,
    }
}

pub fn record_finished(app: &tauri::AppHandle, path: PathBuf) {
    let file_name = display_file_name(&path);
    let can_open = is_safe_to_open(&path);
    let state: State<CompletedDownloads> = app.state();

    let Some(id) = state.insert(path) else {
        return;
    };

    let _ = app.emit(
        DOWNLOAD_FINISHED_EVENT,
        DownloadFinished {
            id,
            file_name,
            can_open,
        },
    );
}

pub fn record_failed(app: &tauri::AppHandle, path: Option<&Path>) {
    let file_name = path.map(display_file_name).unwrap_or_default();
    let _ = app.emit(DOWNLOAD_FAILED_EVENT, DownloadFailed { file_name });
}

fn tracked_file(state: &CompletedDownloads, id: &str) -> std::result::Result<PathBuf, String> {
    let path = state.get(id).ok_or_else(|| "unknown download".to_string())?;

    if !path.is_file() {
        return Err("file not found".into());
    }

    Ok(path)
}

#[tauri::command]
pub async fn open_download(
    app: tauri::AppHandle,
    state: State<'_, CompletedDownloads>,
    id: String,
) -> std::result::Result<(), String> {
    let path = tracked_file(&state, &id)?;

    if !is_safe_to_open(&path) {
        return Err("file type cannot be opened from the app".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_shell::ShellExt;

        #[allow(deprecated)]
        app.shell()
            .open(path.to_string_lossy().into_owned(), None)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn reveal_download(
    state: State<'_, CompletedDownloads>,
    id: String,
) -> std::result::Result<(), String> {
    let path = tracked_file(&state, &id)?;

    tauri::async_runtime::spawn_blocking(move || platform::reveal(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
mod platform {
    use std::os::windows::process::CommandExt;
    use std::path::Path;

    pub fn reveal(path: &Path) -> std::result::Result<(), String> {
        let display = path.to_string_lossy();

        if display.contains('"') {
            return Err("invalid path".into());
        }

        std::process::Command::new("explorer.exe")
            .raw_arg(format!("/select,\"{display}\""))
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::Path;

    pub fn reveal(path: &Path) -> std::result::Result<(), String> {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;

        if status.success() {
            Ok(())
        } else {
            Err("could not reveal the file".into())
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::path::Path;
    use std::process::{Command, Stdio};

    fn show_in_file_manager(path: &Path) -> bool {
        let Ok(uri) = tauri::Url::from_file_path(path) else {
            return false;
        };

        Command::new("dbus-send")
            .args([
                "--session",
                "--print-reply",
                "--dest=org.freedesktop.FileManager1",
                "--type=method_call",
                "/org/freedesktop/FileManager1",
                "org.freedesktop.FileManager1.ShowItems",
            ])
            .arg(format!("array:string:{uri}"))
            .arg("string:")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|status| status.success())
            .unwrap_or(false)
    }

    pub fn reveal(path: &Path) -> std::result::Result<(), String> {
        if show_in_file_manager(path) {
            return Ok(());
        }

        let folder = path
            .parent()
            .ok_or_else(|| "file has no folder".to_string())?;

        Command::new("xdg-open")
            .arg(folder)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_executables_scripts_and_pages() {
        for name in [
            "setup.exe",
            "SETUP.EXE",
            "invoice.pdf.exe",
            "run.bat",
            "script.ps1",
            "app.msi",
            "trap.exe.",
            "trap.exe ",
            "shortcut.lnk",
            "installer.dmg",
            "tool.AppImage",
            "noextension",
            "script.sh",
            "page.hta",
            "page.html",
            "image.svg",
        ] {
            assert!(!is_safe_to_open(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn allows_documents_and_media() {
        for name in [
            "report.pdf",
            "photo.JPG",
            "notes.txt",
            "sheet.xlsx",
            "archive.zip",
            "backup.tar.gz",
            "message.eml",
        ] {
            assert!(is_safe_to_open(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn registry_returns_only_known_ids() {
        let registry = CompletedDownloads::default();
        let id = registry.insert(PathBuf::from("report.pdf")).unwrap();

        assert_eq!(registry.get(&id), Some(PathBuf::from("report.pdf")));
        assert_eq!(registry.get("../../etc/passwd"), None);
    }

    #[test]
    fn registry_drops_oldest_entries() {
        let registry = CompletedDownloads::default();
        let first = registry.insert(PathBuf::from("first.pdf")).unwrap();

        for index in 0..MAX_TRACKED_DOWNLOADS {
            registry.insert(PathBuf::from(format!("{index}.pdf")));
        }

        assert_eq!(registry.get(&first), None);
    }

    #[test]
    fn display_name_strips_control_characters() {
        assert_eq!(
            display_file_name(Path::new("bad\u{7}name.pdf")),
            "badname.pdf"
        );
    }
}
