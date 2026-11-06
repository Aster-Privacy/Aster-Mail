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
    "accda", "accde", "accdr", "action", "ade", "adp", "apk", "app", "appcontent-ms", "appimage",
    "appinstaller", "applescript", "application", "appref-ms", "appx", "appxbundle", "bas", "bat",
    "bin", "cab", "cdxml", "cer", "chm", "cmd", "cnt", "com", "command", "cpl", "crt", "crx", "csh",
    "deb", "der", "deskthemepack", "desktop", "diagcab", "diagcfg", "diagpkg", "dll", "dmg", "doc",
    "docm", "dot", "dotm", "dqy", "dylib", "elf", "exe", "fileloc", "flatpakref", "gadget", "glk",
    "grp", "hlp", "hpj", "hta", "htm", "html", "img", "inetloc", "inf", "ins", "iqy", "iso", "isp",
    "its", "jar", "jnlp", "js", "jse", "kext", "ksh", "library-ms", "lnk", "mad", "maf", "mag",
    "mam", "maq", "mar", "mas", "mat", "mau", "mav", "maw", "mcf", "mda", "mdb", "mde", "mdt",
    "mdw", "mdz", "mht", "mhtml", "mobileconfig", "mpkg", "msc", "msh", "msh1", "msh1xml", "msh2",
    "msh2xml", "mshxml", "msi", "msix", "msixbundle", "msp", "mst", "msu", "ocx", "one", "onepkg",
    "ops", "oqy", "osd", "pcd", "pif", "pkg", "pl", "plg", "plist", "pot", "potm", "ppa", "ppam",
    "ppkg", "pps", "ppsm", "ppt", "pptm", "prefpane", "prf", "prg", "printerexport", "ps1",
    "ps1xml", "ps2", "ps2xml", "psc1", "psc2", "psd1", "psdm1", "psm1", "py", "pyc", "pyo", "pyw",
    "pyz", "pyzw", "rb", "reg", "rgs", "rpm", "rqy", "rtf", "run", "scf", "scpt", "scptd", "scr",
    "sct", "search-ms", "searchconnector-ms", "settingcontent-ms", "sh", "shb", "shortcut", "shs",
    "shtml", "sldm", "slk", "snap", "so", "svg", "sys", "terminal", "theme", "themepack", "tool",
    "udf", "url", "vb", "vbe", "vbs", "vhd", "vhdx", "vsmacros", "vsw", "wbk", "webloc", "website",
    "wiz", "wll", "workflow", "ws", "wsb", "wsc", "wsf", "wsh", "xbap", "xht", "xhtml", "xla",
    "xlam", "xll", "xlm", "xls", "xlsb", "xlsm", "xlt", "xltm", "xlw", "xnk", "xpi",
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
        .filter(|c| !c.is_control() && !is_bidi_control(*c))
        .take(MAX_FILE_NAME_CHARS)
        .collect()
}

fn is_bidi_control(c: char) -> bool {
    matches!(
        c,
        '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
    )
}

#[cfg(any(windows, test))]
const ZONE_IDENTIFIER_CONTENTS: &str = "[ZoneTransfer]\r\nZoneId=3\r\n";

#[cfg(any(windows, test))]
fn zone_identifier_stream(path: &Path) -> PathBuf {
    let mut stream = path.as_os_str().to_os_string();

    stream.push(":Zone.Identifier");

    PathBuf::from(stream)
}

#[cfg(windows)]
pub fn mark_from_internet(path: &Path) {
    let stream = zone_identifier_stream(path);

    if std::fs::metadata(&stream).is_ok() {
        return;
    }

    let _ = std::fs::write(stream, ZONE_IDENTIFIER_CONTENTS);
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
    fn blocks_disk_images_packages_and_macro_documents() {
        for name in [
            "update.iso",
            "disk.IMG",
            "drive.vhdx",
            "notes.one",
            "package.msixbundle",
            "app.appx",
            "bundle.appxbundle",
            "installer.appinstaller",
            "invoice.docm",
            "budget.xlsm",
            "budget.xlsb",
            "deck.pptm",
            "addin.xlam",
            "patch.msu",
            "archive.cab",
            "trouble.diagcab",
            "query.iqy",
            "search.search-ms",
            "desk.themepack",
            "cert.cer",
            "sandbox.wsb",
        ] {
            assert!(!is_safe_to_open(Path::new(name)), "{name}");
        }
    }

    const LEGACY_OFFICE_AND_SHORTCUT_EXTENSIONS: &[&str] = &[
        "doc", "dot", "xls", "xlt", "ppt", "pot", "pps", "rtf", "fileloc", "inetloc",
        "mobileconfig", "shortcut", "ppkg", "wll", "dqy", "rqy", "oqy", "crx", "action",
        "prefpane", "kext", "xlm", "xlw", "wbk", "wiz", "ocx", "mpkg", "dylib", "scptd",
    ];

    #[test]
    fn blocks_legacy_office_documents_shortcuts_and_extensions() {
        for extension in LEGACY_OFFICE_AND_SHORTCUT_EXTENSIONS {
            assert!(BLOCKED_OPEN_EXTENSIONS.contains(extension), "{extension}");
            for name in [
                format!("file.{extension}"),
                format!("FILE.{}", extension.to_ascii_uppercase()),
                format!(
                    "File.{}{}",
                    extension[..1].to_ascii_uppercase(),
                    &extension[1..]
                ),
                format!("file.{extension}."),
                format!("file.{extension} "),
                format!("file.{extension}. ."),
                format!("invoice.pdf.{extension}"),
            ] {
                assert!(!is_safe_to_open(Path::new(&name)), "{name}");
            }
        }
    }

    #[test]
    fn blocks_the_rest_of_the_dangerous_type_class() {
        for name in [
            "addin.xll",
            "query.iqy",
            "data.slk",
            "folder.library-ms",
            "app.appref-ms",
            "app.application",
            "widget.gadget",
            "shell.msh",
            "shell.msh1",
            "shell.msh2",
            "shell.mshxml",
            "shell.msh1xml",
            "shell.msh2xml",
            "types.ps1xml",
            "console.psc1",
            "panel.cpl",
            "explorer.scf",
            "help.chm",
            "page.hta",
            "tool.jar",
            "launch.jnlp",
            "patch.msp",
            "transform.mst",
            "settings.reg",
            "setup.inf",
            "script.ws",
            "component.wsc",
            "host.wsh",
            "browser.xbap",
            "addon.xpi",
            "shell.terminal",
            "run.command",
            "run.tool",
            "automator.workflow",
            "Viewer.app",
            "Viewer.APP.",
        ] {
            assert!(!is_safe_to_open(Path::new(name)), "{name}");
        }
    }

    #[test]
    fn modern_office_documents_stay_openable_while_legacy_ones_are_blocked() {
        for (allowed, blocked) in [
            ("report.docx", "report.doc"),
            ("sheet.xlsx", "sheet.xls"),
            ("deck.pptx", "deck.ppt"),
            ("report.pdf", "report.rtf"),
        ] {
            assert!(is_safe_to_open(Path::new(allowed)), "{allowed}");
            assert!(!is_safe_to_open(Path::new(blocked)), "{blocked}");
        }
    }

    #[test]
    fn blocked_extensions_are_sorted_lowercase_and_unique() {
        let mut sorted = BLOCKED_OPEN_EXTENSIONS.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted, BLOCKED_OPEN_EXTENSIONS);
        for extension in BLOCKED_OPEN_EXTENSIONS {
            assert_eq!(*extension, extension.to_ascii_lowercase(), "{extension}");
            assert!(!extension.starts_with('.'), "{extension}");
        }
    }

    #[test]
    fn display_name_strips_bidi_controls() {
        assert_eq!(
            display_file_name(Path::new("invoice\u{202E}fdp.exe")),
            "invoicefdp.exe"
        );

        for mark in [
            '\u{061C}', '\u{200E}', '\u{200F}', '\u{202A}', '\u{202B}', '\u{202C}', '\u{202D}',
            '\u{202E}', '\u{2066}', '\u{2067}', '\u{2068}', '\u{2069}',
        ] {
            assert_eq!(
                display_file_name(Path::new(&format!("a{mark}b.pdf"))),
                "ab.pdf",
                "{:04X}",
                mark as u32
            );
        }

        assert_eq!(
            display_file_name(Path::new("\u{0627}\u{0644}.pdf")),
            "\u{0627}\u{0644}.pdf"
        );
    }

    #[test]
    fn zone_identifier_marks_internet_zone() {
        assert_eq!(ZONE_IDENTIFIER_CONTENTS, "[ZoneTransfer]\r\nZoneId=3\r\n");
        assert_eq!(
            zone_identifier_stream(Path::new("report.pdf")),
            PathBuf::from("report.pdf:Zone.Identifier")
        );
    }

    #[test]
    fn display_name_strips_control_characters() {
        assert_eq!(
            display_file_name(Path::new("bad\u{7}name.pdf")),
            "badname.pdf"
        );
    }
}
