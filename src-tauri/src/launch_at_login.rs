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
use std::path::{Path, PathBuf};

use crate::boot_guard;

pub const AUTOSTART_ARG: &str = "--autostart";
const START_MINIMIZED_FILE: &str = "start_minimized";

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
pub struct LaunchAtLoginStatus {
    pub enabled: bool,
    pub start_minimized: bool,
    pub needs_install: bool,
}

pub fn launched_at_login<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    args.into_iter()
        .skip(1)
        .any(|arg| arg.as_ref() == OsStr::new(AUTOSTART_ARG))
}

pub fn should_start_hidden(launched_at_login: bool, start_minimized: bool) -> bool {
    launched_at_login && start_minimized
}

pub fn parse_flag(text: &str) -> bool {
    text.trim() == "1"
}

fn flag_path(name: &str) -> Option<PathBuf> {
    boot_guard::app_local_dir().map(|dir| dir.join(name))
}

fn read_flag(name: &str) -> bool {
    flag_path(name)
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|text| parse_flag(&text))
        .unwrap_or(false)
}

fn write_flag(name: &str, enabled: bool) -> Result<(), String> {
    let dir = boot_guard::app_local_dir().ok_or("app data folder unavailable")?;
    let path = dir.join(name);

    if !enabled {
        return match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        };
    }

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    write_atomic(&path, "1")
}

pub fn start_minimized() -> bool {
    read_flag(START_MINIMIZED_FILE)
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("invalid path")?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("invalid path")?;
    let temp = parent.join(format!(".{name}.{}.tmp", std::process::id()));

    let result = (|| {
        use std::io::Write;

        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o644);
        }
        let mut file = options.open(&temp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        std::fs::rename(&temp, path)
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }

    result.map_err(|e| e.to_string())
}

#[cfg(any(target_os = "macos", test))]
pub fn is_unstable_location(path: &str) -> bool {
    path.contains("/AppTranslocation/")
        || path.starts_with("/Volumes/")
        || path.starts_with("/private/var/folders/")
}

fn executable() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    if !exe.is_absolute() || !exe.is_file() {
        return Err("the app's location could not be confirmed".into());
    }
    Ok(exe)
}

#[cfg(windows)]
mod platform {
    use windows_registry::CURRENT_USER;

    use super::AUTOSTART_ARG;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    pub const VALUE_NAME: &str = "Aster Mail";

    pub fn run_command(exe: &str) -> Option<String> {
        let exe = exe.strip_prefix(r"\\?\").unwrap_or(exe);
        if exe.is_empty() || exe.contains('"') || exe.chars().any(char::is_control) {
            return None;
        }
        Some(format!("\"{exe}\" {AUTOSTART_ARG}"))
    }

    pub fn approval_allows(bytes: &[u8]) -> bool {
        bytes.first().map_or(true, |flag| flag & 1 == 0)
    }

    fn registered_command() -> Option<String> {
        CURRENT_USER.open(RUN_KEY).ok()?.get_string(VALUE_NAME).ok()
    }

    fn approved() -> bool {
        CURRENT_USER
            .open(APPROVED_KEY)
            .and_then(|key| key.get_bytes(VALUE_NAME))
            .map(|bytes| approval_allows(&bytes))
            .unwrap_or(true)
    }

    pub fn is_enabled() -> bool {
        registered_command().is_some() && approved()
    }

    fn desired_command() -> Result<String, String> {
        let exe = super::executable()?;
        let exe = exe.to_str().ok_or("the app's location is not valid text")?;
        run_command(exe).ok_or_else(|| "the app's location is not supported".into())
    }

    fn clear_approval() {
        if let Ok(key) = CURRENT_USER.options().read().write().open(APPROVED_KEY) {
            if key.get_bytes(VALUE_NAME).is_ok() {
                let _ = key.remove_value(VALUE_NAME);
            }
        }
    }

    pub fn enable() -> Result<(), String> {
        let command = desired_command()?;
        let key = CURRENT_USER.create(RUN_KEY).map_err(|e| e.to_string())?;
        key.set_string(VALUE_NAME, &command)
            .map_err(|e| e.to_string())?;
        clear_approval();
        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        if let Ok(key) = CURRENT_USER.options().read().write().open(RUN_KEY) {
            if key.get_string(VALUE_NAME).is_ok() {
                key.remove_value(VALUE_NAME).map_err(|e| e.to_string())?;
            }
        }
        clear_approval();
        Ok(())
    }

    pub fn refresh() {
        if !is_enabled() {
            return;
        }
        let Ok(command) = desired_command() else {
            return;
        };
        if registered_command().as_deref() != Some(command.as_str()) {
            let _ = enable();
        }
    }

    pub fn needs_install() -> bool {
        false
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::path::PathBuf;

    use super::{is_unstable_location, write_atomic, AUTOSTART_ARG};

    const LABEL: &str = "com.astermail.mail";

    pub fn escape_xml(text: &str) -> String {
        let mut escaped = String::with_capacity(text.len());
        for c in text.chars() {
            match c {
                '&' => escaped.push_str("&amp;"),
                '<' => escaped.push_str("&lt;"),
                '>' => escaped.push_str("&gt;"),
                '"' => escaped.push_str("&quot;"),
                '\'' => escaped.push_str("&apos;"),
                _ => escaped.push(c),
            }
        }
        escaped
    }

    pub fn plist(exe: &str) -> Option<String> {
        if exe.is_empty() || !exe.starts_with('/') || exe.chars().any(char::is_control) {
            return None;
        }
        Some(format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
<plist version=\"1.0\">\n\
<dict>\n\
\t<key>Label</key>\n\
\t<string>{LABEL}</string>\n\
\t<key>AssociatedBundleIdentifiers</key>\n\
\t<array>\n\
\t\t<string>{LABEL}</string>\n\
\t</array>\n\
\t<key>ProgramArguments</key>\n\
\t<array>\n\
\t\t<string>{}</string>\n\
\t\t<string>{AUTOSTART_ARG}</string>\n\
\t</array>\n\
\t<key>RunAtLoad</key>\n\
\t<true/>\n\
\t<key>ProcessType</key>\n\
\t<string>Interactive</string>\n\
\t<key>LimitLoadToSessionType</key>\n\
\t<string>Aqua</string>\n\
</dict>\n\
</plist>\n",
            escape_xml(exe)
        ))
    }

    fn agent_path() -> Result<PathBuf, String> {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .filter(|home| home.is_absolute())
            .map(|home| {
                home.join("Library")
                    .join("LaunchAgents")
                    .join(format!("{LABEL}.plist"))
            })
            .ok_or_else(|| "home folder unavailable".to_string())
    }

    pub fn needs_install() -> bool {
        super::executable()
            .ok()
            .and_then(|exe| exe.to_str().map(is_unstable_location))
            .unwrap_or(false)
    }

    pub fn is_enabled() -> bool {
        agent_path().map(|path| path.is_file()).unwrap_or(false)
    }

    fn desired_plist() -> Result<String, String> {
        let exe = super::executable()?;
        let exe = exe.to_str().ok_or("the app's location is not valid text")?;
        if is_unstable_location(exe) {
            return Err("move Aster Mail to the Applications folder first".into());
        }
        plist(exe).ok_or_else(|| "the app's location is not supported".into())
    }

    pub fn enable() -> Result<(), String> {
        let contents = desired_plist()?;
        let path = agent_path()?;
        let dir = path.parent().ok_or("invalid path")?;
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        write_atomic(&path, &contents)
    }

    pub fn disable() -> Result<(), String> {
        let path = agent_path()?;
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn refresh() {
        if !is_enabled() {
            return;
        }
        let (Ok(contents), Ok(path)) = (desired_plist(), agent_path()) else {
            return;
        };
        let current = std::fs::read_to_string(&path).unwrap_or_default();
        if current != contents {
            let _ = write_atomic(&path, &contents);
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod platform {
    use std::path::PathBuf;

    use super::{write_atomic, AUTOSTART_ARG};
    use crate::default_mail_linux::quote_exec;

    const DESKTOP_FILE: &str = "com.astermail.mail.desktop";

    pub fn autostart_entry(target: &str) -> String {
        format!(
            "[Desktop Entry]\nType=Application\nName=Aster Mail\nExec={} {AUTOSTART_ARG}\nIcon=aster-mail-desktop\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
            quote_exec(target)
        )
    }

    pub fn entry_enabled(text: &str) -> bool {
        let mut in_main_group = false;
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                in_main_group = line == "[Desktop Entry]";
                continue;
            }
            if !in_main_group {
                continue;
            }
            let Some((key, value)) = line.split_once('=') else {
                continue;
            };
            let value = value.trim();
            match key.trim() {
                "Hidden" if value.eq_ignore_ascii_case("true") => return false,
                "X-GNOME-Autostart-enabled" if value.eq_ignore_ascii_case("false") => return false,
                _ => {}
            }
        }
        true
    }

    fn autostart_path() -> Result<PathBuf, String> {
        if let Some(config_home) = std::env::var_os("XDG_CONFIG_HOME") {
            let config_home = PathBuf::from(config_home);
            if config_home.is_absolute() {
                return Ok(config_home.join("autostart").join(DESKTOP_FILE));
            }
        }

        std::env::var_os("HOME")
            .map(PathBuf::from)
            .filter(|home| home.is_absolute())
            .map(|home| home.join(".config").join("autostart").join(DESKTOP_FILE))
            .ok_or_else(|| "home folder unavailable".to_string())
    }

    fn launch_target() -> Result<String, String> {
        if let Some(appimage) = std::env::var_os("APPIMAGE") {
            let appimage = PathBuf::from(appimage);
            if appimage.is_absolute() && appimage.is_file() {
                return appimage
                    .to_str()
                    .map(str::to_string)
                    .ok_or_else(|| "the app's location is not valid text".into());
            }
        }

        let exe = super::executable()?;
        exe.to_str()
            .map(str::to_string)
            .ok_or_else(|| "the app's location is not valid text".into())
    }

    fn desired_entry() -> Result<String, String> {
        let target = launch_target()?;
        if target.chars().any(char::is_control) {
            return Err("the app's location is not supported".into());
        }
        Ok(autostart_entry(&target))
    }

    pub fn is_enabled() -> bool {
        autostart_path()
            .ok()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .map(|text| entry_enabled(&text))
            .unwrap_or(false)
    }

    pub fn enable() -> Result<(), String> {
        let contents = desired_entry()?;
        let path = autostart_path()?;
        let dir = path.parent().ok_or("invalid path")?;
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        write_atomic(&path, &contents)
    }

    pub fn disable() -> Result<(), String> {
        let path = autostart_path()?;
        match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    pub fn refresh() {
        if !is_enabled() {
            return;
        }
        let (Ok(contents), Ok(path)) = (desired_entry(), autostart_path()) else {
            return;
        };
        let current = std::fs::read_to_string(&path).unwrap_or_default();
        if current != contents {
            let _ = write_atomic(&path, &contents);
        }
    }

    pub fn needs_install() -> bool {
        false
    }

    pub mod portal {
        use std::time::Duration;

        use ashpd::desktop::background::Background;

        const STATE_FILE: &str = "launch_at_login_portal";
        const PORTAL_TIMEOUT: Duration = Duration::from_secs(120);

        pub fn is_enabled() -> bool {
            super::super::read_flag(STATE_FILE)
        }

        pub fn remember(enabled: bool) {
            let _ = super::super::write_flag(STATE_FILE, enabled);
        }

        pub async fn request(enabled: bool, reason: &str) -> Result<bool, String> {
            let request = Background::request()
                .reason(reason)
                .auto_start(enabled)
                .command(["aster-mail-desktop", super::AUTOSTART_ARG])
                .dbus_activatable(false)
                .send();

            let response = tokio::time::timeout(PORTAL_TIMEOUT, async {
                request
                    .await
                    .map_err(|e| e.to_string())?
                    .response()
                    .map_err(|e| e.to_string())
            })
            .await
            .map_err(|_| "the system did not respond in time".to_string())??;

            let granted = response.auto_start();
            if enabled && !granted {
                return Err("the system did not allow Aster Mail to start at login".into());
            }
            remember(granted);
            Ok(granted)
        }
    }
}

fn uses_portal() -> bool {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        crate::flatpak::is_flatpak()
    }
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        false
    }
}

fn enabled_now() -> bool {
    #[cfg(all(unix, not(target_os = "macos")))]
    if uses_portal() {
        return platform::portal::is_enabled();
    }
    platform::is_enabled()
}

pub fn status() -> LaunchAtLoginStatus {
    LaunchAtLoginStatus {
        enabled: enabled_now(),
        start_minimized: start_minimized(),
        needs_install: !uses_portal() && platform::needs_install(),
    }
}

pub fn refresh_registration() {
    if uses_portal() {
        #[cfg(all(unix, not(target_os = "macos")))]
        if launched_at_login(std::env::args_os()) {
            platform::portal::remember(true);
        }
        return;
    }
    std::thread::spawn(platform::refresh);
}

#[tauri::command]
pub fn launch_at_login_status() -> LaunchAtLoginStatus {
    status()
}

#[tauri::command]
pub async fn set_launch_at_login(
    enabled: bool,
    reason: Option<String>,
) -> Result<LaunchAtLoginStatus, String> {
    if uses_portal() {
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            let reason = reason
                .as_deref()
                .map(str::trim)
                .filter(|r| !r.is_empty() && r.chars().count() <= 200)
                .unwrap_or("Open Aster Mail when you sign in.");
            platform::portal::request(enabled, reason).await?;
        }
        return Ok(status());
    }

    let _ = reason;
    tauri::async_runtime::spawn_blocking(move || {
        if enabled {
            platform::enable()
        } else {
            platform::disable()
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let current = status();
    if current.enabled != enabled {
        return Err("the system did not keep the change".into());
    }
    Ok(current)
}

#[tauri::command]
pub fn set_start_minimized(enabled: bool) -> Result<LaunchAtLoginStatus, String> {
    write_flag(START_MINIMIZED_FILE, enabled)?;
    Ok(status())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_autostart_argument_after_program_name() {
        assert!(launched_at_login(["aster-mail", "--autostart"]));
        assert!(launched_at_login([
            "aster-mail",
            "mailto:a@b.c",
            "--autostart"
        ]));
        assert!(!launched_at_login(["--autostart"]));
        assert!(!launched_at_login(["aster-mail"]));
        assert!(!launched_at_login(["aster-mail", "--autostart=1"]));
        assert!(!launched_at_login(["aster-mail", "--AUTOSTART"]));
        assert!(!launched_at_login(["aster-mail", "mailto:--autostart"]));
    }

    #[test]
    fn starts_hidden_only_for_login_launch_with_setting_on() {
        assert!(should_start_hidden(true, true));
        assert!(!should_start_hidden(true, false));
        assert!(!should_start_hidden(false, true));
        assert!(!should_start_hidden(false, false));
    }

    #[test]
    fn parses_flag_files_strictly() {
        assert!(parse_flag("1"));
        assert!(parse_flag("1\n"));
        assert!(!parse_flag("0"));
        assert!(!parse_flag(""));
        assert!(!parse_flag("true"));
        assert!(!parse_flag("11"));
    }

    #[test]
    fn flags_unstable_mac_locations() {
        assert!(is_unstable_location(
            "/private/var/folders/x/AppTranslocation/ABC/d/Aster Mail.app/Contents/MacOS/aster"
        ));
        assert!(is_unstable_location(
            "/Volumes/Aster Mail/Aster Mail.app/Contents/MacOS/aster"
        ));
        assert!(!is_unstable_location(
            "/Applications/Aster Mail.app/Contents/MacOS/aster"
        ));
        assert!(!is_unstable_location(
            "/Users/ada/Applications/Aster Mail.app/Contents/MacOS/aster"
        ));
    }

    #[test]
    fn atomic_write_replaces_contents() {
        let dir = std::env::temp_dir().join(format!("aster_lal_test_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("entry");
        write_atomic(&path, "first").unwrap();
        write_atomic(&path, "second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
        let leftovers = std::fs::read_dir(&dir).unwrap().count();
        assert_eq!(leftovers, 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn windows_run_command_is_quoted() {
        assert_eq!(
            platform::run_command(r"C:\Program Files\Aster Mail\aster-mail.exe").as_deref(),
            Some(r#""C:\Program Files\Aster Mail\aster-mail.exe" --autostart"#)
        );
        assert_eq!(
            platform::run_command(r"\\?\C:\Apps\aster.exe").as_deref(),
            Some(r#""C:\Apps\aster.exe" --autostart"#)
        );
        assert_eq!(platform::run_command(r#"C:\a"b\aster.exe"#), None);
        assert_eq!(platform::run_command("C:\\a\nb.exe"), None);
        assert_eq!(platform::run_command(""), None);
    }

    #[cfg(windows)]
    #[test]
    fn windows_startup_approval_bytes() {
        assert!(platform::approval_allows(&[0x02, 0, 0, 0]));
        assert!(platform::approval_allows(&[0x06]));
        assert!(platform::approval_allows(&[]));
        assert!(!platform::approval_allows(&[0x03, 0, 0, 0]));
        assert!(!platform::approval_allows(&[0x07]));
    }

    #[cfg(windows)]
    #[test]
    #[ignore]
    fn windows_registry_round_trip() {
        use windows_registry::{Type, CURRENT_USER};

        let run_key = r"Software\Microsoft\Windows\CurrentVersion\Run";
        let approved_key =
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
        let existing = CURRENT_USER
            .open(run_key)
            .and_then(|key| key.get_string(platform::VALUE_NAME));
        assert!(
            existing.is_err(),
            "an Aster Mail startup entry already exists"
        );

        platform::enable().unwrap();
        assert!(platform::is_enabled());
        let exe = std::env::current_exe().unwrap();
        let expected = platform::run_command(exe.to_str().unwrap()).unwrap();
        let stored = CURRENT_USER
            .open(run_key)
            .unwrap()
            .get_string(platform::VALUE_NAME)
            .unwrap();
        assert_eq!(stored, expected);

        CURRENT_USER
            .create(approved_key)
            .unwrap()
            .set_bytes(
                platform::VALUE_NAME,
                Type::Bytes,
                &[0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            )
            .unwrap();
        assert!(!platform::is_enabled());
        platform::refresh();
        assert!(!platform::is_enabled());

        platform::enable().unwrap();
        assert!(platform::is_enabled());
        assert!(CURRENT_USER
            .open(approved_key)
            .unwrap()
            .get_bytes(platform::VALUE_NAME)
            .is_err());

        platform::disable().unwrap();
        assert!(!platform::is_enabled());
        assert!(CURRENT_USER
            .open(run_key)
            .unwrap()
            .get_string(platform::VALUE_NAME)
            .is_err());
        platform::disable().unwrap();
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn mac_plist_escapes_path() {
        let plist = platform::plist("/Applications/A & <B>.app/Contents/MacOS/aster").unwrap();
        assert!(plist
            .contains("<string>/Applications/A &amp; &lt;B&gt;.app/Contents/MacOS/aster</string>"));
        assert!(plist.contains("<string>--autostart</string>"));
        assert!(plist.contains("<key>RunAtLoad</key>\n\t<true/>"));
        assert!(platform::plist("relative/aster").is_none());
        assert!(platform::plist("/a\nb").is_none());
        assert_eq!(platform::escape_xml("'\""), "&apos;&quot;");
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_entry_quotes_exec() {
        let entry = platform::autostart_entry("/home/ada/My Apps/Aster $HOME 100%.AppImage");
        assert!(
            entry.contains("Exec=\"/home/ada/My Apps/Aster \\$HOME 100%%.AppImage\" --autostart\n")
        );
        let plain = platform::autostart_entry("/usr/bin/aster-mail-desktop");
        assert!(plain.contains("Exec=/usr/bin/aster-mail-desktop --autostart\n"));
        assert!(platform::entry_enabled(&plain));
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn linux_entry_respects_disabled_markers() {
        assert!(!platform::entry_enabled("[Desktop Entry]\nHidden=true\n"));
        assert!(!platform::entry_enabled(
            "[Desktop Entry]\nX-GNOME-Autostart-enabled=false\n"
        ));
        assert!(platform::entry_enabled(
            "[Desktop Entry]\nExec=a\n[Desktop Action x]\nHidden=true\n"
        ));
        assert!(platform::entry_enabled("[Desktop Entry]\nHidden=false\n"));
    }

    #[cfg(unix)]
    #[test]
    #[ignore]
    fn unix_entry_round_trip_in_temp_home() {
        let home = std::env::temp_dir().join(format!("aster_login_test_{}", std::process::id()));
        std::fs::create_dir_all(&home).unwrap();
        std::env::set_var("HOME", &home);
        std::env::set_var("XDG_CONFIG_HOME", home.join(".config"));
        std::env::remove_var("APPIMAGE");

        assert!(!platform::is_enabled());
        platform::enable().unwrap();
        assert!(platform::is_enabled());

        #[cfg(target_os = "macos")]
        let path = home
            .join("Library")
            .join("LaunchAgents")
            .join("com.astermail.mail.plist");
        #[cfg(not(target_os = "macos"))]
        let path = home
            .join(".config")
            .join("autostart")
            .join("com.astermail.mail.desktop");

        let text = std::fs::read_to_string(&path).unwrap();
        let exe = std::env::current_exe().unwrap();
        assert!(text.contains(exe.to_str().unwrap()));
        assert!(text.contains("--autostart"));
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o644);
        }

        #[cfg(target_os = "macos")]
        assert!(std::process::Command::new("/usr/bin/plutil")
            .arg("-lint")
            .arg(&path)
            .status()
            .unwrap()
            .success());
        #[cfg(not(target_os = "macos"))]
        {
            std::fs::write(
                &path,
                text.replace(
                    "[Desktop Entry]
",
                    "[Desktop Entry]
Hidden=true
",
                ),
            )
            .unwrap();
            assert!(!platform::is_enabled());
            platform::refresh();
            assert!(!platform::is_enabled());
            platform::enable().unwrap();
            assert!(platform::is_enabled());
        }

        std::fs::write(&path, "stale").unwrap();
        platform::refresh();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), text);

        platform::disable().unwrap();
        assert!(!path.exists());
        assert!(!platform::is_enabled());
        platform::disable().unwrap();
        std::fs::remove_dir_all(&home).unwrap();
    }
}
