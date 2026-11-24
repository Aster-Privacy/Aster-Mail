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
use std::ffi::CString;
use std::os::raw::{c_char, c_int, c_void};
use std::os::unix::ffi::OsStrExt;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;

pub const ORIGIN_ATTRIBUTE: &str = "user.xdg.origin.url";
pub const ORIGIN_VALUE: &str = "aster-mail:attachment";
const EXECUTE_BITS: u32 = 0o111;

extern "C" {
    fn setxattr(
        path: *const c_char,
        name: *const c_char,
        value: *const c_void,
        size: usize,
        flags: c_int,
    ) -> c_int;
}

pub fn clear_execute_bits(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };

    if !metadata.is_file() {
        return false;
    }

    let mode = metadata.permissions().mode();

    if mode & EXECUTE_BITS == 0 {
        return true;
    }

    std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode & !EXECUTE_BITS)).is_ok()
}

pub fn write_origin(path: &Path) -> bool {
    let (Ok(target), Ok(name)) = (
        CString::new(path.as_os_str().as_bytes()),
        CString::new(ORIGIN_ATTRIBUTE),
    ) else {
        return false;
    };
    let value = ORIGIN_VALUE.as_bytes();

    unsafe {
        setxattr(
            target.as_ptr(),
            name.as_ptr(),
            value.as_ptr().cast(),
            value.len(),
            0,
        ) == 0
    }
}

pub fn mark_download(path: &Path) {
    clear_execute_bits(path);
    write_origin(path);
}

#[cfg(test)]
mod tests {
    use super::*;

    extern "C" {
        fn getxattr(
            path: *const c_char,
            name: *const c_char,
            value: *mut c_void,
            size: usize,
        ) -> isize;
    }

    fn scratch_file(name: &str, mode: u32) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("aster_download_{}_{name}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(name);

        std::fs::write(&path, b"#!/bin/sh\necho hi\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(mode)).unwrap();

        path
    }

    fn read_origin(path: &Path) -> Option<String> {
        let target = CString::new(path.as_os_str().as_bytes()).ok()?;
        let name = CString::new(ORIGIN_ATTRIBUTE).ok()?;
        let mut buffer = vec![0u8; 256];
        let read = unsafe {
            getxattr(
                target.as_ptr(),
                name.as_ptr(),
                buffer.as_mut_ptr().cast(),
                buffer.len(),
            )
        };

        if read < 0 {
            return None;
        }
        buffer.truncate(read as usize);

        String::from_utf8(buffer).ok()
    }

    #[test]
    fn saved_files_lose_execute_permission() {
        let path = scratch_file("tool.odt", 0o755);

        mark_download(&path);

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();

        assert_eq!(mode & 0o777, 0o644);
    }

    #[test]
    fn plain_files_keep_their_mode() {
        let path = scratch_file("notes.txt", 0o600);

        mark_download(&path);

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();

        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn saved_files_carry_an_origin_mark() {
        let supported = write_origin(&scratch_file("probe.pdf", 0o644));
        let path = scratch_file("report.pdf", 0o644);

        mark_download(&path);

        if supported {
            assert_eq!(read_origin(&path).as_deref(), Some(ORIGIN_VALUE));
        } else {
            eprintln!("filesystem has no user attributes");
        }
    }

    #[test]
    fn missing_files_are_ignored() {
        assert!(!clear_execute_bits(Path::new("/nonexistent/aster/file.bin")));
        assert!(!write_origin(Path::new("/nonexistent/aster/file.bin")));
    }
}
