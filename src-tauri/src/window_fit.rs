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
use tauri::{LogicalSize, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkArea {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub x: i32,
    pub y: i32,
    pub inner_width: u32,
    pub inner_height: u32,
}

pub fn fit_placement(
    current: Placement,
    frame_width: u32,
    frame_height: u32,
    area: WorkArea,
) -> Option<Placement> {
    if area.width == 0 || area.height == 0 {
        return None;
    }

    let inner_width = current
        .inner_width
        .min(area.width.saturating_sub(frame_width))
        .max(1);
    let inner_height = current
        .inner_height
        .min(area.height.saturating_sub(frame_height))
        .max(1);
    let outer_width = i64::from(inner_width) + i64::from(frame_width);
    let outer_height = i64::from(inner_height) + i64::from(frame_height);
    let slack = i64::from(frame_width / 2);
    let left = i64::from(area.x);
    let top = i64::from(area.y);
    let right = left + i64::from(area.width);
    let bottom = top + i64::from(area.height);
    let min_x = left - slack;
    let max_x = (right - outer_width + slack).max(min_x);
    let min_y = top - slack;
    let max_y = (bottom - outer_height + slack).max(min_y);
    let fitted = Placement {
        x: i64::from(current.x).clamp(min_x, max_x) as i32,
        y: i64::from(current.y).clamp(min_y, max_y) as i32,
        inner_width,
        inner_height,
    };

    (fitted != current).then_some(fitted)
}

pub fn fit_to_work_area<R: Runtime>(window: &WebviewWindow<R>, min_logical: (f64, f64)) {
    if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }

    let Some(monitor) = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
    else {
        return;
    };

    let (Ok(position), Ok(inner), Ok(outer)) =
        (window.outer_position(), window.inner_size(), window.outer_size())
    else {
        return;
    };

    let work = monitor.work_area();
    let area = WorkArea {
        x: work.position.x,
        y: work.position.y,
        width: work.size.width,
        height: work.size.height,
    };
    let current = Placement {
        x: position.x,
        y: position.y,
        inner_width: inner.width,
        inner_height: inner.height,
    };

    let Some(fitted) = fit_placement(
        current,
        outer.width.saturating_sub(inner.width),
        outer.height.saturating_sub(inner.height),
        area,
    ) else {
        return;
    };

    let scale = monitor.scale_factor().max(f64::EPSILON);
    let min_size = LogicalSize::new(
        min_logical.0.min(f64::from(fitted.inner_width) / scale),
        min_logical.1.min(f64::from(fitted.inner_height) / scale),
    );

    if let Err(error) = window.set_min_size(Some(min_size)) {
        tracing::warn!(%error, "could not relax the minimum window size");
    }
    if let Err(error) = window.set_size(PhysicalSize::new(fitted.inner_width, fitted.inner_height)) {
        tracing::warn!(%error, "could not fit the window to the screen");
    }
    if let Err(error) = window.set_position(PhysicalPosition::new(fitted.x, fitted.y)) {
        tracing::warn!(%error, "could not move the window onto the screen");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AREA: WorkArea = WorkArea {
        x: 0,
        y: 0,
        width: 1920,
        height: 1032,
    };

    fn placement(x: i32, y: i32, inner_width: u32, inner_height: u32) -> Placement {
        Placement {
            x,
            y,
            inner_width,
            inner_height,
        }
    }

    #[test]
    fn leaves_a_window_that_already_fits() {
        assert_eq!(fit_placement(placement(100, 80, 1280, 860), 14, 38, AREA), None);
    }

    #[test]
    fn leaves_a_window_snapped_to_the_left_edge() {
        assert_eq!(fit_placement(placement(-7, 0, 946, 994), 14, 38, AREA), None);
    }

    #[test]
    fn shrinks_a_window_wider_than_the_screen() {
        let fitted = fit_placement(placement(0, 0, 2560, 860), 14, 38, AREA).unwrap();

        assert_eq!(fitted.inner_width, 1906);
        assert_eq!(fitted.inner_height, 860);
        assert!(i64::from(fitted.x) + 1906 + 14 <= 1920 + 7);
    }

    #[test]
    fn shrinks_a_window_taller_than_the_screen() {
        let fitted = fit_placement(placement(50, 20, 1280, 1400), 14, 38, AREA).unwrap();

        assert_eq!(fitted.inner_height, 994);
        assert!(fitted.y >= -7);
        assert!(i64::from(fitted.y) + 994 + 38 <= 1032 + 7);
    }

    #[test]
    fn pulls_back_a_window_hanging_past_the_right_edge() {
        let fitted = fit_placement(placement(1200, 100, 1280, 860), 14, 38, AREA).unwrap();

        assert_eq!(fitted.inner_width, 1280);
        assert_eq!(fitted.x, 1920 - 1280 - 14 + 7);
        assert_eq!(fitted.y, 100);
    }

    #[test]
    fn keeps_the_window_on_a_secondary_monitor() {
        let area = WorkArea {
            x: -1366,
            y: 0,
            width: 1366,
            height: 728,
        };
        let fitted = fit_placement(placement(-1366, 0, 1280, 860), 14, 38, area).unwrap();

        assert_eq!(fitted.inner_height, 690);
        assert!(fitted.x >= -1366 - 7);
        assert!(i64::from(fitted.x) + 1280 + 14 <= 7);
    }

    #[test]
    fn ignores_an_empty_work_area() {
        let area = WorkArea {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };

        assert_eq!(fit_placement(placement(0, 0, 1280, 860), 14, 38, area), None);
    }
}
