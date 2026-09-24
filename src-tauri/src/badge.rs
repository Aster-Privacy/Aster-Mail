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

#[cfg(windows)]
mod taskbar_icon {
    use std::collections::HashMap;
    use std::sync::Mutex;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateIcon, SendMessageW, HICON, ICON_BIG, ICON_SMALL, WM_SETICON,
    };

    const BASE_ICON: &[u8] = include_bytes!("../icons/128x128.png");

    static ICON_CACHE: Mutex<Option<HashMap<u32, isize>>> = Mutex::new(None);

    fn cached_icon(count: u32) -> Result<isize, String> {
        let mut guard = ICON_CACHE.lock().map_err(|e| e.to_string())?;
        let cache = guard.get_or_insert_with(HashMap::new);

        if let Some(handle) = cache.get(&count) {
            return Ok(*handle);
        }

        let (pixels, width, height) = composite(count)?;
        let handle = create_icon(pixels, width, height)?.0 as isize;
        cache.insert(count, handle);
        Ok(handle)
    }

    fn blend_over(base: &mut [u8], overlay: &[u8]) {
        for (dst, src) in base.chunks_exact_mut(4).zip(overlay.chunks_exact(4)) {
            let alpha = src[3] as u32;
            if alpha == 0 {
                continue;
            }
            let inverse = 255 - alpha;
            for channel in 0..3 {
                dst[channel] =
                    ((src[channel] as u32 * alpha + dst[channel] as u32 * inverse) / 255) as u8;
            }
            dst[3] = (alpha + dst[3] as u32 * inverse / 255).min(255) as u8;
        }
    }

    fn composite(count: u32) -> Result<(Vec<u8>, u32, u32), String> {
        let base = tauri::image::Image::from_bytes(BASE_ICON).map_err(|e| e.to_string())?;
        let mut pixels = base.rgba().to_vec();

        if count > 0 {
            let index = (count.min(100) - 1) as usize;
            let badge = tauri::image::Image::from_bytes(crate::badges_data::BADGES[index])
                .map_err(|e| e.to_string())?;

            if badge.width() != base.width() || badge.height() != base.height() {
                return Err("badge size mismatch".to_string());
            }

            blend_over(&mut pixels, badge.rgba());
        }

        Ok((pixels, base.width(), base.height()))
    }

    fn create_icon(mut pixels: Vec<u8>, width: u32, height: u32) -> Result<HICON, String> {
        let mut and_mask = Vec::with_capacity(pixels.len() / 4);

        for pixel in pixels.chunks_exact_mut(4) {
            and_mask.push(255 - pixel[3]);
            pixel.swap(0, 2);
        }

        unsafe {
            CreateIcon(
                None,
                width as i32,
                height as i32,
                1,
                32,
                and_mask.as_ptr(),
                pixels.as_ptr(),
            )
        }
        .map_err(|e| e.to_string())
    }

    pub fn apply(hwnd: HWND, count: u32) -> Result<(), String> {
        let icon = cached_icon(count.min(100))?;

        unsafe {
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_BIG as usize)),
                Some(LPARAM(icon)),
            );
            SendMessageW(
                hwnd,
                WM_SETICON,
                Some(WPARAM(ICON_SMALL as usize)),
                Some(LPARAM(icon)),
            );
        }

        Ok(())
    }
}

#[tauri::command]
pub fn set_unread_badge(window: tauri::WebviewWindow, count: u32) -> std::result::Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        let _ = window.set_overlay_icon(None);
        taskbar_icon::apply(hwnd, count)
    }
    #[cfg(not(windows))]
    {
        let value = if count == 0 { None } else { Some(count as i64) };
        let _ = window.set_badge_count(value);
        Ok(())
    }
}
