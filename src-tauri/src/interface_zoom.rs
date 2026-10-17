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
use crate::boot_guard;

const ZOOM_FILE: &str = "interface_zoom";
pub const ZOOM_MIN: f64 = 0.8;
pub const ZOOM_MAX: f64 = 2.0;
pub const ZOOM_DEFAULT: f64 = 1.0;

pub fn normalize_zoom(value: f64) -> f64 {
    if !value.is_finite() {
        return ZOOM_DEFAULT;
    }
    let clamped = value.clamp(ZOOM_MIN, ZOOM_MAX);

    (clamped * 100.0).round() / 100.0
}

pub fn parse_zoom(text: &str) -> Option<f64> {
    let value = text.trim().parse::<f64>().ok()?;
    if !value.is_finite() {
        return None;
    }

    Some(normalize_zoom(value))
}

pub fn saved_zoom() -> f64 {
    boot_guard::app_local_dir()
        .and_then(|dir| std::fs::read_to_string(dir.join(ZOOM_FILE)).ok())
        .and_then(|text| parse_zoom(&text))
        .unwrap_or(ZOOM_DEFAULT)
}

fn save_zoom(value: f64) {
    let Some(dir) = boot_guard::app_local_dir() else {
        return;
    };
    if (value - ZOOM_DEFAULT).abs() < f64::EPSILON {
        let _ = std::fs::remove_file(dir.join(ZOOM_FILE));
        return;
    }
    let _ = std::fs::create_dir_all(&dir);
    let _ = std::fs::write(dir.join(ZOOM_FILE), format!("{value:.2}"));
}

#[tauri::command]
pub fn get_interface_zoom() -> f64 {
    saved_zoom()
}

#[tauri::command]
pub fn set_interface_zoom(window: tauri::WebviewWindow, zoom: f64) -> Result<f64, String> {
    let value = normalize_zoom(zoom);
    window.set_zoom(value).map_err(|error| error.to_string())?;
    save_zoom(value);

    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_and_rounds() {
        assert_eq!(normalize_zoom(1.0), 1.0);
        assert_eq!(normalize_zoom(0.1), ZOOM_MIN);
        assert_eq!(normalize_zoom(9.0), ZOOM_MAX);
        assert_eq!(normalize_zoom(1.254), 1.25);
        assert_eq!(normalize_zoom(f64::NAN), ZOOM_DEFAULT);
        assert_eq!(normalize_zoom(f64::INFINITY), ZOOM_DEFAULT);
    }

    #[test]
    fn parses_saved_values() {
        assert_eq!(parse_zoom("1.50\n"), Some(1.5));
        assert_eq!(parse_zoom("3"), Some(ZOOM_MAX));
        assert_eq!(parse_zoom("abc"), None);
        assert_eq!(parse_zoom("NaN"), None);
        assert_eq!(parse_zoom(""), None);
    }
}
