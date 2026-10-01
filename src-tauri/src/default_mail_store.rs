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
use std::path::Path;

const FILE_NAME: &str = "previous_mail_handler";
const MAX_LENGTH: usize = 255;

pub fn is_valid(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_LENGTH
        && !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

pub fn save(store_dir: &Path, value: &str) {
    if !is_valid(value) {
        return;
    }

    let _ = std::fs::create_dir_all(store_dir);
    let _ = std::fs::write(store_dir.join(FILE_NAME), value);
}

pub fn load(store_dir: &Path) -> Option<String> {
    let value = std::fs::read_to_string(store_dir.join(FILE_NAME)).ok()?;
    let value = value.trim();

    is_valid(value).then(|| value.to_string())
}

pub fn forget(store_dir: &Path) {
    let _ = std::fs::remove_file(store_dir.join(FILE_NAME));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_bundle_ids_and_desktop_file_names() {
        assert!(is_valid("com.apple.mail"));
        assert!(is_valid("org.gnome.Evolution.desktop"));
        assert!(is_valid("userapp-mail_client-X1Y2.desktop"));
    }

    #[test]
    fn rejects_values_that_could_act_as_arguments_or_paths() {
        assert!(!is_valid(""));
        assert!(!is_valid("--help"));
        assert!(!is_valid("../evil.desktop"));
        assert!(!is_valid("a b.desktop"));
        assert!(!is_valid("a;b"));
        assert!(!is_valid(&"a".repeat(256)));
    }

    #[test]
    fn round_trips_and_forgets() {
        let dir = std::env::temp_dir().join(format!("aster_store_test_{}", std::process::id()));

        save(&dir, "org.gnome.Evolution.desktop");
        assert_eq!(load(&dir).as_deref(), Some("org.gnome.Evolution.desktop"));

        save(&dir, "../evil");
        assert_eq!(load(&dir).as_deref(), Some("org.gnome.Evolution.desktop"));

        forget(&dir);
        assert!(load(&dir).is_none());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
