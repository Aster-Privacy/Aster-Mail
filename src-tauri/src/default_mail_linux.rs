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
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::default_mail_store;

pub const DESKTOP_FILE: &str = "com.astermail.mail.mailto.desktop";
const MIME_TYPE: &str = "x-scheme-handler/mailto";

pub fn supported() -> bool {
    Command::new("xdg-mime")
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok()
}

fn applications_dir() -> std::result::Result<PathBuf, String> {
    if let Some(data_home) = std::env::var_os("XDG_DATA_HOME") {
        let data_home = PathBuf::from(data_home);

        if data_home.is_absolute() {
            return Ok(data_home.join("applications"));
        }
    }

    std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
        .map(|home| home.join(".local").join("share").join("applications"))
        .ok_or_else(|| "home directory unavailable".to_string())
}

fn launch_target() -> std::result::Result<String, String> {
    if let Ok(appimage) = std::env::var("APPIMAGE") {
        if !appimage.is_empty() {
            return Ok(appimage);
        }
    }

    std::env::current_exe()
        .map(|exe| exe.display().to_string())
        .map_err(|e| e.to_string())
}

pub fn quote_exec(target: &str) -> String {
    let is_plain = !target.is_empty()
        && target
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '.' | '_' | '-' | '+' | '@'));

    if is_plain {
        return target.to_string();
    }

    let mut quoted = String::with_capacity(target.len() + 2);

    quoted.push('"');
    for c in target.chars() {
        match c {
            '"' | '`' | '$' | '\\' => {
                quoted.push('\\');
                quoted.push(c);
            }
            '%' => quoted.push_str("%%"),
            _ => quoted.push(c),
        }
    }
    quoted.push('"');

    quoted
}

pub fn desktop_entry(target: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Aster Mail\nExec={} %u\nIcon=aster-mail-desktop\nTerminal=false\nNoDisplay=true\nCategories=Network;Email;\nMimeType={};\n",
        quote_exec(target),
        MIME_TYPE
    )
}

fn refresh_desktop_database(dir: &Path) {
    let _ = Command::new("update-desktop-database")
        .arg(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

fn write_desktop_entry() -> std::result::Result<(), String> {
    let dir = applications_dir()?;
    let path = dir.join(DESKTOP_FILE);
    let entry = desktop_entry(&launch_target()?);

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let unchanged = std::fs::read_to_string(&path)
        .map(|existing| existing == entry)
        .unwrap_or(false);

    if !unchanged {
        std::fs::write(&path, entry).map_err(|e| e.to_string())?;
        refresh_desktop_database(&dir);
    }

    Ok(())
}

pub fn current_handler() -> Option<String> {
    let output = Command::new("xdg-mime")
        .args(["query", "default", MIME_TYPE])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()?;
    let handler = String::from_utf8_lossy(&output.stdout).trim().to_string();

    (!handler.is_empty()).then_some(handler)
}

fn assign_handler(desktop_file: &str) -> std::result::Result<(), String> {
    let status = Command::new("xdg-mime")
        .args(["default", desktop_file, MIME_TYPE])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| e.to_string())?;

    if status.success() {
        Ok(())
    } else {
        Err("xdg-mime could not change the handler".to_string())
    }
}

pub fn is_default() -> bool {
    current_handler()
        .map(|handler| handler == DESKTOP_FILE)
        .unwrap_or(false)
}

pub fn set_default(store_dir: &Path) -> std::result::Result<(), String> {
    if let Some(previous) = current_handler() {
        if previous != DESKTOP_FILE {
            default_mail_store::save(store_dir, &previous);
        }
    }

    let _ = std::fs::create_dir_all(store_dir);
    write_desktop_entry()?;
    assign_handler(DESKTOP_FILE)?;

    if is_default() {
        Ok(())
    } else {
        Err("the handler did not change".to_string())
    }
}

pub fn clear_default(store_dir: &Path) -> bool {
    if !is_default() {
        return true;
    }

    if let Some(previous) = default_mail_store::load(store_dir) {
        let _ = assign_handler(&previous);
    }
    default_mail_store::forget(store_dir);

    if let Ok(dir) = applications_dir() {
        let _ = std::fs::remove_file(dir.join(DESKTOP_FILE));
        refresh_desktop_database(&dir);
    }

    !is_default()
}

pub fn refresh_registration() {
    let Ok(dir) = applications_dir() else { return };

    if dir.join(DESKTOP_FILE).exists() {
        let _ = write_desktop_entry();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_entry_quotes_the_launch_target() {
        let entry = desktop_entry("/home/ada/My Apps/Aster \"Mail\" $HOME 100%.AppImage");

        assert!(entry.contains(
            "Exec=\"/home/ada/My Apps/Aster \\\"Mail\\\" \\$HOME 100%%.AppImage\" %u\n"
        ));
        assert!(desktop_entry("/usr/bin/aster-mail-desktop")
            .contains("Exec=/usr/bin/aster-mail-desktop %u\n"));
        assert!(entry.contains("MimeType=x-scheme-handler/mailto;\n"));
        assert!(entry.contains("NoDisplay=true\n"));
    }
}
