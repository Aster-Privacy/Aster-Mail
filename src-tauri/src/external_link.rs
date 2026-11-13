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
use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::time::Duration;

use ashpd::desktop::open_uri::OpenFileRequest;

const PORTAL_TIMEOUT: Duration = Duration::from_secs(10);

const APPIMAGE_ONLY_VARS: &[&str] = &["APPDIR", "APPIMAGE", "ARGV0", "OWD", "_ASTER_REEXEC"];

const PATH_LIST_VARS: &[&str] = &[
    "LD_LIBRARY_PATH",
    "XDG_DATA_DIRS",
    "PATH",
    "GI_TYPELIB_PATH",
    "GTK_PATH",
    "GIO_EXTRA_MODULES",
    "QT_PLUGIN_PATH",
    "PYTHONPATH",
    "PERLLIB",
    "GST_PLUGIN_PATH",
    "GST_PLUGIN_SYSTEM_PATH",
];

const OPENERS: &[(&str, &[&str])] = &[("xdg-open", &[]), ("gio", &["open"])];

#[derive(Debug, PartialEq, Eq)]
pub enum EnvChange {
    Remove(String),
    Set(String, String),
}

fn is_inside(value: &str, app_dir: &str) -> bool {
    !app_dir.is_empty() && (value == app_dir || value.starts_with(&format!("{app_dir}/")))
}

fn filter_list(value: &str, keep: impl Fn(&str) -> bool) -> String {
    value
        .split(':')
        .filter(|entry| !entry.is_empty() && keep(entry))
        .collect::<Vec<_>>()
        .join(":")
}

fn list_change(name: &str, value: &str, kept: String) -> Option<EnvChange> {
    if kept.is_empty() {
        Some(EnvChange::Remove(name.to_string()))
    } else if kept != value {
        Some(EnvChange::Set(name.to_string(), kept))
    } else {
        None
    }
}

pub fn clean_env_changes(env: &HashMap<String, String>) -> Vec<EnvChange> {
    let app_dir = env
        .get("APPDIR")
        .map(|dir| dir.trim_end_matches('/').to_string())
        .unwrap_or_default();
    let reexec = env.contains_key("_ASTER_REEXEC");

    if app_dir.is_empty() && !reexec {
        return Vec::new();
    }

    let mut names: Vec<&String> = env.keys().collect();
    names.sort();

    let mut changes = Vec::new();

    for name in names {
        let value = &env[name];

        if APPIMAGE_ONLY_VARS.contains(&name.as_str()) {
            changes.push(EnvChange::Remove(name.clone()));
        } else if name == "LD_PRELOAD" {
            let kept = filter_list(value, |entry| {
                !is_inside(entry, &app_dir) && !(reexec && entry.contains("libwayland-client"))
            });
            changes.extend(list_change(name, value, kept));
        } else if app_dir.is_empty() {
            continue;
        } else if PATH_LIST_VARS.contains(&name.as_str()) {
            let kept = filter_list(value, |entry| !is_inside(entry, &app_dir));
            changes.extend(list_change(name, value, kept));
        } else if is_inside(value, &app_dir) {
            changes.push(EnvChange::Remove(name.clone()));
        }
    }

    changes
}

async fn open_with_portal(url: &str) -> Result<(), String> {
    let uri = ashpd::Uri::parse(url).map_err(|e| e.to_string())?;

    OpenFileRequest::default()
        .ask(false)
        .send_uri(&uri)
        .await
        .map_err(|e| e.to_string())?
        .response()
        .map_err(|e| e.to_string())
}

fn spawn_opener(
    program: &str,
    args: &[&str],
    url: &str,
    changes: &[EnvChange],
) -> Result<(), String> {
    let mut command = Command::new(program);

    command
        .args(args)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    for change in changes {
        match change {
            EnvChange::Remove(name) => {
                command.env_remove(name);
            }
            EnvChange::Set(name, value) => {
                command.env(name, value);
            }
        }
    }

    let mut child = command.spawn().map_err(|e| format!("{program}: {e}"))?;

    std::thread::spawn(move || {
        let _ = child.wait();
    });

    Ok(())
}

fn open_with_command(url: &str) -> Result<(), String> {
    let env: HashMap<String, String> = std::env::vars().collect();
    let changes = clean_env_changes(&env);
    let mut errors = Vec::new();

    for (program, args) in OPENERS {
        match spawn_opener(program, args, url, &changes) {
            Ok(()) => return Ok(()),
            Err(e) => errors.push(e),
        }
    }

    Err(errors.join("; "))
}

pub async fn open_url(url: &str) -> Result<(), String> {
    match tokio::time::timeout(PORTAL_TIMEOUT, open_with_portal(url)).await {
        Ok(Ok(())) => return Ok(()),
        Ok(Err(e)) => tracing::warn!("opening link through the desktop portal failed: {e}"),
        Err(_) => {
            tracing::warn!("opening link through the desktop portal timed out");
            return Ok(());
        }
    }

    let url = url.to_string();

    tokio::task::spawn_blocking(move || open_with_command(&url))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn touches(changes: &[EnvChange], name: &str) -> bool {
        changes.iter().any(|change| match change {
            EnvChange::Remove(n) | EnvChange::Set(n, _) => n == name,
        })
    }

    #[test]
    fn leaves_plain_environment_alone() {
        let vars = env(&[("PATH", "/usr/bin:/bin"), ("HOME", "/home/u")]);

        assert!(clean_env_changes(&vars).is_empty());
    }

    #[test]
    fn strips_appimage_entries() {
        let vars = env(&[
            ("APPDIR", "/tmp/.mount_Aster/"),
            ("APPIMAGE", "/home/u/Aster.AppImage"),
            ("OWD", "/home/u"),
            ("PATH", "/tmp/.mount_Aster/usr/bin:/usr/bin"),
            ("XDG_DATA_DIRS", "/tmp/.mount_Aster/usr/share:/usr/share"),
            ("GTK_PATH", "/tmp/.mount_Aster/usr/lib/gtk-3.0"),
            (
                "GDK_PIXBUF_MODULE_FILE",
                "/tmp/.mount_Aster/usr/lib/loaders.cache",
            ),
            ("GTK_DATA_PREFIX", "/tmp/.mount_Aster"),
            ("HOME", "/home/u"),
            ("BROWSER", "/usr/bin/firefox-esr"),
        ]);
        let changes = clean_env_changes(&vars);

        assert!(changes.contains(&EnvChange::Remove("APPDIR".into())));
        assert!(changes.contains(&EnvChange::Remove("APPIMAGE".into())));
        assert!(changes.contains(&EnvChange::Remove("OWD".into())));
        assert!(changes.contains(&EnvChange::Set("PATH".into(), "/usr/bin".into())));
        assert!(changes.contains(&EnvChange::Set(
            "XDG_DATA_DIRS".into(),
            "/usr/share".into()
        )));
        assert!(changes.contains(&EnvChange::Remove("GTK_PATH".into())));
        assert!(changes.contains(&EnvChange::Remove("GDK_PIXBUF_MODULE_FILE".into())));
        assert!(changes.contains(&EnvChange::Remove("GTK_DATA_PREFIX".into())));
        assert!(!touches(&changes, "HOME"));
        assert!(!touches(&changes, "BROWSER"));
    }

    #[test]
    fn keeps_sibling_prefix_paths() {
        let vars = env(&[
            ("APPDIR", "/tmp/.mount_Aster"),
            ("PATH", "/tmp/.mount_AsterOther/bin:/usr/bin"),
        ]);

        assert!(!touches(&clean_env_changes(&vars), "PATH"));
    }

    #[test]
    fn drops_reexec_wayland_preload() {
        let vars = env(&[
            ("_ASTER_REEXEC", "1"),
            (
                "LD_PRELOAD",
                "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0:/usr/lib/libfoo.so",
            ),
        ]);
        let changes = clean_env_changes(&vars);

        assert!(changes.contains(&EnvChange::Remove("_ASTER_REEXEC".into())));
        assert!(changes.contains(&EnvChange::Set(
            "LD_PRELOAD".into(),
            "/usr/lib/libfoo.so".into()
        )));
    }

    #[test]
    fn removes_preload_when_only_wayland_remains() {
        let vars = env(&[
            ("_ASTER_REEXEC", "1"),
            (
                "LD_PRELOAD",
                "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
            ),
        ]);

        assert!(clean_env_changes(&vars).contains(&EnvChange::Remove("LD_PRELOAD".into())));
    }
}
