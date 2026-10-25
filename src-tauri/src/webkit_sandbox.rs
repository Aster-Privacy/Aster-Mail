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
#![cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]

use serde::Serialize;

pub const OVERRIDE_VAR: &str = "ASTER_WEBKIT_SANDBOX";
const WEBKIT_DISABLE_VAR: &str = "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS";
const FALLBACK_LAUNCH_LIMIT: u32 = 3;
const DETAIL_MAX_CHARS: usize = 200;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OverrideMode {
    Auto,
    On,
    Off,
    Invalid,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BwrapProbe {
    Works,
    Missing,
    Failed(String),
    TimedOut,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxReason {
    PlatformDefault,
    ForcedOn,
    ForcedOff,
    DisabledByEnvironment,
    StartupFailures,
    FlatpakPortal,
    ProbePassed,
    BwrapMissing,
    BwrapFailed,
    BwrapTimedOut,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SandboxStatus {
    pub enabled: bool,
    pub reason: SandboxReason,
    pub detail: Option<String>,
}

impl SandboxStatus {
    fn new(enabled: bool, reason: SandboxReason, detail: Option<String>) -> Self {
        Self {
            enabled,
            reason,
            detail,
        }
    }

    pub fn can_fall_back(&self) -> bool {
        self.enabled
            && matches!(
                self.reason,
                SandboxReason::ProbePassed | SandboxReason::FlatpakPortal
            )
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SandboxInputs {
    pub override_mode: OverrideMode,
    pub webkit_disable_preset: bool,
    pub inside_flatpak: bool,
    pub fallback_marker: bool,
    pub unstarted_launches: u32,
}

pub fn parse_override(value: Option<&str>) -> OverrideMode {
    let Some(value) = value else {
        return OverrideMode::Auto;
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "auto" => OverrideMode::Auto,
        "on" | "1" | "true" | "yes" => OverrideMode::On,
        "off" | "0" | "false" | "no" => OverrideMode::Off,
        _ => OverrideMode::Invalid,
    }
}

pub fn decide(inputs: &SandboxInputs, probe: impl FnOnce() -> BwrapProbe) -> SandboxStatus {
    match inputs.override_mode {
        OverrideMode::On => return SandboxStatus::new(true, SandboxReason::ForcedOn, None),
        OverrideMode::Off => return SandboxStatus::new(false, SandboxReason::ForcedOff, None),
        OverrideMode::Auto | OverrideMode::Invalid => {}
    }
    if inputs.webkit_disable_preset {
        return SandboxStatus::new(false, SandboxReason::DisabledByEnvironment, None);
    }
    if inputs.fallback_marker {
        return SandboxStatus::new(
            false,
            SandboxReason::StartupFailures,
            Some("an earlier launch with the sandbox on did not start".to_string()),
        );
    }
    if inputs.unstarted_launches >= FALLBACK_LAUNCH_LIMIT {
        return SandboxStatus::new(
            false,
            SandboxReason::StartupFailures,
            Some(format!(
                "{} launches in a row did not start",
                inputs.unstarted_launches
            )),
        );
    }
    if inputs.inside_flatpak {
        return SandboxStatus::new(true, SandboxReason::FlatpakPortal, None);
    }
    match probe() {
        BwrapProbe::Works => SandboxStatus::new(true, SandboxReason::ProbePassed, None),
        BwrapProbe::Missing => SandboxStatus::new(
            false,
            SandboxReason::BwrapMissing,
            Some("bubblewrap (bwrap) is not installed".to_string()),
        ),
        BwrapProbe::Failed(detail) => {
            SandboxStatus::new(false, SandboxReason::BwrapFailed, Some(detail))
        }
        BwrapProbe::TimedOut => SandboxStatus::new(
            false,
            SandboxReason::BwrapTimedOut,
            Some("bubblewrap did not finish in time".to_string()),
        ),
    }
}

pub fn fingerprint(app_version: &str, kernel_release: &str) -> String {
    format!("{} {}", app_version.trim(), kernel_release.trim())
}

pub fn marker_matches(contents: Option<&str>, fingerprint: &str) -> bool {
    contents
        .map(|text| text.trim() == fingerprint)
        .unwrap_or(false)
}

pub fn userns_hint(
    apparmor_restrict: Option<&str>,
    unprivileged_clone: Option<&str>,
    max_user_namespaces: Option<&str>,
) -> Option<String> {
    let is = |value: Option<&str>, expected: &str| value.map(str::trim) == Some(expected);
    if is(apparmor_restrict, "1") {
        return Some("kernel.apparmor_restrict_unprivileged_userns=1".to_string());
    }
    if is(unprivileged_clone, "0") {
        return Some("kernel.unprivileged_userns_clone=0".to_string());
    }
    if is(max_user_namespaces, "0") {
        return Some("user.max_user_namespaces=0".to_string());
    }

    None
}

pub fn failure_detail(stderr: &str, hint: Option<&str>) -> String {
    let line = stderr
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("bubblewrap exited with an error");
    let line: String = line.chars().take(DETAIL_MAX_CHARS).collect();
    match hint {
        Some(hint) => format!("{line} ({hint})"),
        None => line,
    }
}

pub fn describe(status: &SandboxStatus) -> String {
    let state = if status.enabled { "on" } else { "OFF" };
    let mut line = format!("webkit sandbox: {state} ({:?}", status.reason);
    if let Some(detail) = &status.detail {
        line.push_str(": ");
        line.push_str(detail);
    }
    line.push(')');
    if !status.enabled && status.reason != SandboxReason::ForcedOff {
        line.push_str(&format!("; set {OVERRIDE_VAR}=on to force it on"));
    }

    line
}

#[cfg(all(unix, not(target_os = "macos")))]
mod linux {
    use super::*;
    use crate::boot_guard;
    use std::io::Read;
    use std::path::Path;
    use std::process::{Command, Stdio};
    use std::sync::OnceLock;
    use std::time::{Duration, Instant};

    const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
    const PROBE_POLL: Duration = Duration::from_millis(20);
    const FALLBACK_MARKER: &str = "webkit_sandbox_fallback";
    const BWRAP_PATHS: &[&str] = &["/usr/bin/bwrap", "/usr/local/bin/bwrap", "/bin/bwrap"];

    static STATUS: OnceLock<SandboxStatus> = OnceLock::new();

    fn inside_flatpak() -> bool {
        Path::new("/.flatpak-info").exists()
    }

    fn read_trimmed(path: &str) -> Option<String> {
        std::fs::read_to_string(path)
            .ok()
            .map(|text| text.trim().to_string())
    }

    fn current_hint() -> Option<String> {
        userns_hint(
            read_trimmed("/proc/sys/kernel/apparmor_restrict_unprivileged_userns").as_deref(),
            read_trimmed("/proc/sys/kernel/unprivileged_userns_clone").as_deref(),
            read_trimmed("/proc/sys/user/max_user_namespaces").as_deref(),
        )
    }

    fn bwrap_program() -> &'static str {
        BWRAP_PATHS
            .iter()
            .copied()
            .find(|path| Path::new(path).is_file())
            .unwrap_or("bwrap")
    }

    fn run_bwrap_probe() -> BwrapProbe {
        let child = Command::new(bwrap_program())
            .args([
                "--die-with-parent",
                "--unshare-user",
                "--unshare-pid",
                "--unshare-ipc",
                "--unshare-uts",
                "--unshare-cgroup-try",
                "--ro-bind",
                "/",
                "/",
                "--dev",
                "/dev",
                "--proc",
                "/proc",
                "true",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn();

        let mut child = match child {
            Ok(child) => child,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return BwrapProbe::Missing
            }
            Err(error) => {
                return BwrapProbe::Failed(failure_detail(
                    &error.to_string(),
                    current_hint().as_deref(),
                ))
            }
        };

        let started = Instant::now();
        loop {
            match child.try_wait() {
                Ok(Some(status)) if status.success() => return BwrapProbe::Works,
                Ok(Some(_)) => {
                    let mut stderr = String::new();
                    if let Some(mut pipe) = child.stderr.take() {
                        let _ = pipe.read_to_string(&mut stderr);
                    }
                    return BwrapProbe::Failed(failure_detail(&stderr, current_hint().as_deref()));
                }
                Ok(None) if started.elapsed() < PROBE_TIMEOUT => std::thread::sleep(PROBE_POLL),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return BwrapProbe::TimedOut;
                }
            }
        }
    }

    fn current_fingerprint() -> String {
        fingerprint(
            env!("CARGO_PKG_VERSION"),
            &read_trimmed("/proc/sys/kernel/osrelease").unwrap_or_default(),
        )
    }

    fn read_fallback_marker() -> Option<String> {
        let path = boot_guard::app_local_dir()?.join(FALLBACK_MARKER);
        std::fs::read_to_string(path).ok()
    }

    fn write_fallback_marker(fingerprint: &str) {
        if let Some(dir) = boot_guard::app_local_dir() {
            let _ = std::fs::create_dir_all(&dir);
            let _ = std::fs::write(dir.join(FALLBACK_MARKER), fingerprint);
        }
    }

    fn remove_fallback_marker() {
        if let Some(dir) = boot_guard::app_local_dir() {
            let _ = std::fs::remove_file(dir.join(FALLBACK_MARKER));
        }
    }

    fn report(line: &str) {
        eprintln!("aster: {line}");
        boot_guard::log_line(line);
    }

    pub fn apply_policy() {
        let raw_override = std::env::var(OVERRIDE_VAR).ok();
        let override_mode = parse_override(raw_override.as_deref());
        if override_mode == OverrideMode::Invalid {
            report(&format!(
                "webkit sandbox: ignoring {OVERRIDE_VAR}={:?}, expected on, off or auto",
                raw_override.as_deref().unwrap_or_default()
            ));
        }

        let fingerprint = current_fingerprint();
        let marker = read_fallback_marker();
        let fallback_marker = marker_matches(marker.as_deref(), &fingerprint);
        if marker.is_some() && !fallback_marker {
            remove_fallback_marker();
            report("webkit sandbox: app or kernel changed since the last fallback, trying the sandbox again");
        }

        let inputs = SandboxInputs {
            override_mode,
            webkit_disable_preset: std::env::var_os(WEBKIT_DISABLE_VAR).is_some(),
            inside_flatpak: inside_flatpak(),
            fallback_marker,
            unstarted_launches: boot_guard::unstarted_launches(),
        };
        let status = decide(&inputs, run_bwrap_probe);

        if status.reason == SandboxReason::ForcedOn {
            std::env::remove_var(WEBKIT_DISABLE_VAR);
        } else if !status.enabled {
            if status.reason == SandboxReason::StartupFailures && !fallback_marker {
                write_fallback_marker(&fingerprint);
            }
            if std::env::var_os(WEBKIT_DISABLE_VAR).is_none() {
                std::env::set_var(WEBKIT_DISABLE_VAR, "1");
            }
        }

        report(&describe(&status));
        let _ = STATUS.set(status);
    }

    pub fn fall_back_after_failed_boot() -> bool {
        let Some(status) = STATUS.get() else {
            return false;
        };
        if !status.can_fall_back() {
            return false;
        }
        write_fallback_marker(&current_fingerprint());
        report("webkit sandbox: the window did not start with the sandbox on, the next launch runs without it");

        true
    }

    pub fn current_status() -> SandboxStatus {
        STATUS.get().cloned().unwrap_or_else(|| {
            SandboxStatus::new(
                std::env::var_os(WEBKIT_DISABLE_VAR).is_none(),
                SandboxReason::PlatformDefault,
                None,
            )
        })
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
pub use linux::{apply_policy, fall_back_after_failed_boot};

#[cfg(all(unix, not(target_os = "macos")))]
fn current_status() -> SandboxStatus {
    linux::current_status()
}

#[cfg(not(all(unix, not(target_os = "macos"))))]
fn current_status() -> SandboxStatus {
    SandboxStatus::new(true, SandboxReason::PlatformDefault, None)
}

#[tauri::command]
pub fn webkit_sandbox_status() -> SandboxStatus {
    current_status()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auto_inputs() -> SandboxInputs {
        SandboxInputs {
            override_mode: OverrideMode::Auto,
            webkit_disable_preset: false,
            inside_flatpak: false,
            fallback_marker: false,
            unstarted_launches: 0,
        }
    }

    fn probe_not_expected() -> BwrapProbe {
        panic!("the bwrap probe must not run for this decision")
    }

    #[test]
    fn parses_override_values() {
        assert_eq!(parse_override(None), OverrideMode::Auto);
        for value in ["", " ", "auto", "AUTO"] {
            assert_eq!(parse_override(Some(value)), OverrideMode::Auto);
        }
        for value in ["on", "ON", " on ", "1", "true", "yes"] {
            assert_eq!(parse_override(Some(value)), OverrideMode::On);
        }
        for value in ["off", "Off", "0", "false", "no"] {
            assert_eq!(parse_override(Some(value)), OverrideMode::Off);
        }
        for value in ["2", "maybe", "enabled"] {
            assert_eq!(parse_override(Some(value)), OverrideMode::Invalid);
        }
    }

    #[test]
    fn keeps_sandbox_when_probe_passes() {
        let status = decide(&auto_inputs(), || BwrapProbe::Works);
        assert!(status.enabled);
        assert_eq!(status.reason, SandboxReason::ProbePassed);
        assert!(status.can_fall_back());
    }

    #[test]
    fn disables_sandbox_when_bwrap_is_missing() {
        let status = decide(&auto_inputs(), || BwrapProbe::Missing);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::BwrapMissing);
    }

    #[test]
    fn disables_sandbox_when_bwrap_fails() {
        let status = decide(&auto_inputs(), || {
            BwrapProbe::Failed("setting up uid map: Permission denied".to_string())
        });
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::BwrapFailed);
        assert_eq!(
            status.detail.as_deref(),
            Some("setting up uid map: Permission denied")
        );
        assert!(!status.can_fall_back());
    }

    #[test]
    fn disables_sandbox_when_bwrap_times_out() {
        let status = decide(&auto_inputs(), || BwrapProbe::TimedOut);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::BwrapTimedOut);
    }

    #[test]
    fn keeps_sandbox_in_flatpak_without_probing() {
        let inputs = SandboxInputs {
            inside_flatpak: true,
            ..auto_inputs()
        };
        let status = decide(&inputs, probe_not_expected);
        assert!(status.enabled);
        assert_eq!(status.reason, SandboxReason::FlatpakPortal);
        assert!(status.can_fall_back());
    }

    #[test]
    fn override_on_wins_over_everything() {
        let inputs = SandboxInputs {
            override_mode: OverrideMode::On,
            webkit_disable_preset: true,
            fallback_marker: true,
            unstarted_launches: 10,
            ..auto_inputs()
        };
        let status = decide(&inputs, probe_not_expected);
        assert!(status.enabled);
        assert_eq!(status.reason, SandboxReason::ForcedOn);
        assert!(!status.can_fall_back());
    }

    #[test]
    fn override_off_disables_without_probing() {
        let inputs = SandboxInputs {
            override_mode: OverrideMode::Off,
            ..auto_inputs()
        };
        let status = decide(&inputs, probe_not_expected);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::ForcedOff);
    }

    #[test]
    fn invalid_override_behaves_like_auto() {
        let inputs = SandboxInputs {
            override_mode: OverrideMode::Invalid,
            ..auto_inputs()
        };
        assert_eq!(
            decide(&inputs, || BwrapProbe::Works).reason,
            SandboxReason::ProbePassed
        );
        assert_eq!(
            decide(&inputs, || BwrapProbe::Missing).reason,
            SandboxReason::BwrapMissing
        );
    }

    #[test]
    fn respects_a_preset_webkit_variable() {
        let inputs = SandboxInputs {
            webkit_disable_preset: true,
            ..auto_inputs()
        };
        let status = decide(&inputs, probe_not_expected);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::DisabledByEnvironment);
    }

    #[test]
    fn falls_back_when_the_marker_matches() {
        let inputs = SandboxInputs {
            fallback_marker: true,
            inside_flatpak: true,
            ..auto_inputs()
        };
        let status = decide(&inputs, probe_not_expected);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::StartupFailures);
    }

    #[test]
    fn falls_back_only_after_repeated_unstarted_launches() {
        for count in 0..FALLBACK_LAUNCH_LIMIT {
            let inputs = SandboxInputs {
                unstarted_launches: count,
                ..auto_inputs()
            };
            assert_eq!(
                decide(&inputs, || BwrapProbe::Works).reason,
                SandboxReason::ProbePassed
            );
        }
        let inputs = SandboxInputs {
            unstarted_launches: FALLBACK_LAUNCH_LIMIT,
            ..auto_inputs()
        };
        let status = decide(&inputs, probe_not_expected);
        assert!(!status.enabled);
        assert_eq!(status.reason, SandboxReason::StartupFailures);
    }

    #[test]
    fn marker_matches_only_the_same_fingerprint() {
        let current = fingerprint("1.4.70", "6.8.0-45-generic\n");
        assert_eq!(current, "1.4.70 6.8.0-45-generic");
        assert!(marker_matches(Some("1.4.70 6.8.0-45-generic\n"), &current));
        assert!(!marker_matches(Some("1.4.69 6.8.0-45-generic"), &current));
        assert!(!marker_matches(Some("1.4.70 6.8.0-47-generic"), &current));
        assert!(!marker_matches(Some(""), &current));
        assert!(!marker_matches(None, &current));
    }

    #[test]
    fn explains_userns_restrictions() {
        assert_eq!(
            userns_hint(Some("1"), Some("1"), Some("1000")).as_deref(),
            Some("kernel.apparmor_restrict_unprivileged_userns=1")
        );
        assert_eq!(
            userns_hint(Some("0"), Some("0"), None).as_deref(),
            Some("kernel.unprivileged_userns_clone=0")
        );
        assert_eq!(
            userns_hint(None, None, Some("0\n")).as_deref(),
            Some("user.max_user_namespaces=0")
        );
        assert_eq!(userns_hint(Some("0"), Some("1"), Some("1000")), None);
        assert_eq!(userns_hint(None, None, None), None);
    }

    #[test]
    fn builds_failure_detail_from_stderr() {
        assert_eq!(
            failure_detail("\nbwrap: setting up uid map: Permission denied\nmore", None),
            "bwrap: setting up uid map: Permission denied"
        );
        assert_eq!(
            failure_detail("", Some("user.max_user_namespaces=0")),
            "bubblewrap exited with an error (user.max_user_namespaces=0)"
        );
        let long = "x".repeat(500);
        assert_eq!(
            failure_detail(&long, None).chars().count(),
            DETAIL_MAX_CHARS
        );
    }

    #[test]
    fn describes_status_for_the_log() {
        let on = SandboxStatus::new(true, SandboxReason::ProbePassed, None);
        assert_eq!(describe(&on), "webkit sandbox: on (ProbePassed)");
        let off = SandboxStatus::new(
            false,
            SandboxReason::BwrapMissing,
            Some("bubblewrap (bwrap) is not installed".to_string()),
        );
        let line = describe(&off);
        assert!(line.starts_with("webkit sandbox: OFF (BwrapMissing: bubblewrap"));
        assert!(line.ends_with(&format!("set {OVERRIDE_VAR}=on to force it on")));
        let forced = SandboxStatus::new(false, SandboxReason::ForcedOff, None);
        assert!(!describe(&forced).contains("force it on"));
    }

    #[test]
    fn serializes_status_for_the_web_ui() {
        let status = SandboxStatus::new(
            false,
            SandboxReason::BwrapFailed,
            Some("denied".to_string()),
        );
        assert_eq!(
            serde_json::to_string(&status).unwrap(),
            r#"{"enabled":false,"reason":"bwrap_failed","detail":"denied"}"#
        );
    }
}
