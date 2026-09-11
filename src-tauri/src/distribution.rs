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
use std::sync::OnceLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DistributionChannel {
    Mas,
    Msstore,
    Flatpak,
    Snap,
    Direct,
}

static CHANNEL: OnceLock<DistributionChannel> = OnceLock::new();

fn env_flag_set(name: &str) -> bool {
    std::env::var_os(name).is_some_and(|value| !value.is_empty())
}

fn resolve(
    is_mas_build: bool,
    is_msix_packaged: bool,
    has_env: impl Fn(&str) -> bool,
) -> DistributionChannel {
    if is_mas_build {
        return DistributionChannel::Mas;
    }
    if has_env("FLATPAK_ID") {
        return DistributionChannel::Flatpak;
    }
    if has_env("SNAP") {
        return DistributionChannel::Snap;
    }
    if is_msix_packaged {
        return DistributionChannel::Msstore;
    }
    DistributionChannel::Direct
}

#[cfg(windows)]
fn is_msix_packaged() -> bool {
    const ERROR_SUCCESS: i32 = 0;
    const ERROR_INSUFFICIENT_BUFFER: i32 = 122;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentPackageFullName(package_full_name_length: *mut u32, package_full_name: *mut u16) -> i32;
    }

    let mut length: u32 = 0;
    let status = unsafe { GetCurrentPackageFullName(&mut length, std::ptr::null_mut()) };

    status == ERROR_SUCCESS || status == ERROR_INSUFFICIENT_BUFFER
}

#[cfg(not(windows))]
fn is_msix_packaged() -> bool {
    false
}

pub fn current() -> DistributionChannel {
    *CHANNEL.get_or_init(|| resolve(cfg!(feature = "mas"), is_msix_packaged(), env_flag_set))
}

#[tauri::command]
pub fn get_distribution_channel() -> DistributionChannel {
    current()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn no_env(_: &str) -> bool {
        false
    }

    #[test]
    fn mas_build_wins_over_everything() {
        assert_eq!(resolve(true, true, |_| true), DistributionChannel::Mas);
    }

    #[test]
    fn flatpak_and_snap_come_from_env() {
        assert_eq!(resolve(false, false, |name| name == "FLATPAK_ID"), DistributionChannel::Flatpak);
        assert_eq!(resolve(false, false, |name| name == "SNAP"), DistributionChannel::Snap);
    }

    #[test]
    fn msix_package_maps_to_msstore() {
        assert_eq!(resolve(false, true, no_env), DistributionChannel::Msstore);
    }

    #[test]
    fn plain_install_is_direct() {
        assert_eq!(resolve(false, false, no_env), DistributionChannel::Direct);
    }

    #[test]
    fn channel_serializes_lowercase() {
        let names: Vec<String> = [
            DistributionChannel::Mas,
            DistributionChannel::Msstore,
            DistributionChannel::Flatpak,
            DistributionChannel::Snap,
            DistributionChannel::Direct,
        ]
        .iter()
        .map(|channel| serde_json::to_string(channel).expect("serializes"))
        .collect();
        assert_eq!(names, ["\"mas\"", "\"msstore\"", "\"flatpak\"", "\"snap\"", "\"direct\""]);
    }
}
