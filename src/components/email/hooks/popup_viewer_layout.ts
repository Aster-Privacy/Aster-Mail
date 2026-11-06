//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import {
  type PopupSize,
  POPUP_MARGIN,
  FULLSCREEN_MARGIN,
} from "@/components/email/hooks/popup_viewer_types";

export interface PopupViewport {
  width: number;
  height: number;
}

export interface PopupDimensions {
  width: number;
  height: number;
}

export interface PopupPosition {
  x: number;
  y: number;
}

const POPUP_WIDTH = 680;
const POPUP_HEIGHT_DEFAULT = 720;
const POPUP_HEIGHT_EXPANDED = 860;
const POPUP_MIN_SIZE = 200;

export function read_popup_viewport(): PopupViewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function get_popup_dimensions(
  size: PopupSize,
  viewport: PopupViewport,
): PopupDimensions {
  if (size === "fullscreen") {
    return {
      width: Math.max(POPUP_MIN_SIZE, viewport.width - FULLSCREEN_MARGIN * 2),
      height: Math.max(POPUP_MIN_SIZE, viewport.height - FULLSCREEN_MARGIN * 2),
    };
  }

  const target_height =
    size === "expanded" ? POPUP_HEIGHT_EXPANDED : POPUP_HEIGHT_DEFAULT;

  return {
    width: Math.max(
      POPUP_MIN_SIZE,
      Math.min(POPUP_WIDTH, viewport.width - POPUP_MARGIN * 2),
    ),
    height: Math.max(
      POPUP_MIN_SIZE,
      Math.min(target_height, viewport.height - POPUP_MARGIN * 2),
    ),
  };
}

export function clamp_popup_position(
  position: PopupPosition,
  dimensions: PopupDimensions,
  viewport: PopupViewport,
): PopupPosition {
  const max_x = viewport.width - dimensions.width - POPUP_MARGIN;
  const max_y = viewport.height - dimensions.height - POPUP_MARGIN;

  return {
    x: Math.max(0, Math.min(Math.max(POPUP_MARGIN, position.x), max_x)),
    y: Math.max(0, Math.min(Math.max(POPUP_MARGIN, position.y), max_y)),
  };
}

export function get_centered_popup_position(
  dimensions: PopupDimensions,
  viewport: PopupViewport,
): PopupPosition {
  return clamp_popup_position(
    {
      x: Math.round((viewport.width - dimensions.width) / 2),
      y: Math.round((viewport.height - dimensions.height) / 2),
    },
    dimensions,
    viewport,
  );
}
