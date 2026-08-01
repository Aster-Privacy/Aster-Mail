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

#[tauri::command]
pub fn set_unread_badge(window: tauri::WebviewWindow, count: u32) -> std::result::Result<(), String> {
    #[cfg(windows)]
    {
        if count == 0 {
            window.set_overlay_icon(None).map_err(|e| e.to_string())
        } else {
            let index = (count.min(100) - 1) as usize;
            let image = tauri::image::Image::from_bytes(crate::badges_data::BADGES[index])
                .map_err(|e| e.to_string())?;
            window
                .set_overlay_icon(Some(image))
                .map_err(|e| e.to_string())
        }
    }
    #[cfg(not(windows))]
    {
        let value = if count == 0 { None } else { Some(count as i64) };
        let _ = window.set_badge_count(value);
        Ok(())
    }
}
