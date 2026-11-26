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
use std::ffi::OsStr;
use std::sync::OnceLock;

pub const DISABLE_UPDATER_VAR: &str = "ASTER_DISABLE_UPDATER";
#[cfg(any(all(unix, not(target_os = "macos")), test))]
pub const LAUNCH_COMMAND_VAR: &str = "ASTER_LAUNCH_COMMAND";

pub fn parse_disable_updater(value: Option<&OsStr>) -> bool {
    value
        .map(|raw| {
            let text = raw.to_string_lossy();
            let text = text.trim();
            !text.is_empty() && text != "0"
        })
        .unwrap_or(false)
}

#[cfg(any(all(unix, not(target_os = "macos")), test))]
pub fn parse_launch_command(value: Option<&OsStr>) -> Option<String> {
    let text = value?.to_str()?;
    if text.trim().is_empty() || text.chars().any(char::is_control) {
        return None;
    }
    Some(text.to_string())
}

fn is_flatpak() -> bool {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        crate::flatpak::is_flatpak()
    }
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        false
    }
}

pub fn updates_disabled() -> bool {
    static DISABLED: OnceLock<bool> = OnceLock::new();

    *DISABLED.get_or_init(|| {
        is_flatpak() || parse_disable_updater(std::env::var_os(DISABLE_UPDATER_VAR).as_deref())
    })
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn launch_command() -> Option<String> {
    parse_launch_command(std::env::var_os(LAUNCH_COMMAND_VAR).as_deref())
}

pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let script = if updates_disabled() {
        "window.__ASTER_UPDATES_MANAGED__ = true;"
    } else {
        ""
    };

    tauri::plugin::Builder::new("aster-package-managed")
        .js_init_script(script.to_string())
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disable_updater_accepts_any_value_but_zero() {
        assert!(parse_disable_updater(Some(OsStr::new("1"))));
        assert!(parse_disable_updater(Some(OsStr::new("true"))));
        assert!(parse_disable_updater(Some(OsStr::new("yes"))));
        assert!(parse_disable_updater(Some(OsStr::new(" 1 "))));
        assert!(!parse_disable_updater(Some(OsStr::new("0"))));
        assert!(!parse_disable_updater(Some(OsStr::new(" 0\n"))));
        assert!(!parse_disable_updater(Some(OsStr::new(""))));
        assert!(!parse_disable_updater(Some(OsStr::new("   "))));
        assert!(!parse_disable_updater(None));
    }

    #[test]
    fn launch_command_is_used_verbatim() {
        assert_eq!(
            parse_launch_command(Some(OsStr::new("aster-mail"))).as_deref(),
            Some("aster-mail")
        );
        assert_eq!(
            parse_launch_command(Some(OsStr::new("/run/current-system/sw/bin/aster-mail")))
                .as_deref(),
            Some("/run/current-system/sw/bin/aster-mail")
        );
        assert_eq!(
            parse_launch_command(Some(OsStr::new("/home/ada/My Apps/aster mail"))).as_deref(),
            Some("/home/ada/My Apps/aster mail")
        );
    }

    #[test]
    fn launch_command_rejects_empty_and_control_characters() {
        assert_eq!(parse_launch_command(None), None);
        assert_eq!(parse_launch_command(Some(OsStr::new(""))), None);
        assert_eq!(parse_launch_command(Some(OsStr::new("  "))), None);
        assert_eq!(parse_launch_command(Some(OsStr::new("aster\nmail"))), None);
    }
}
