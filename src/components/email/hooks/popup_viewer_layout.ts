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
const POPUP_WIDTH_EXPANDED_MAX = 1280;
const POPUP_HEIGHT_EXPANDED_MIN = 860;
const EXPANDED_WIDTH_RATIO = 0.7;
const EXPANDED_HEIGHT_RATIO = 0.9;
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

  const is_expanded = size === "expanded";
  const target_width = is_expanded
    ? Math.min(
        POPUP_WIDTH_EXPANDED_MAX,
        Math.max(
          POPUP_WIDTH,
          Math.round(viewport.width * EXPANDED_WIDTH_RATIO),
        ),
      )
    : POPUP_WIDTH;
  const target_height = is_expanded
    ? Math.max(
        POPUP_HEIGHT_EXPANDED_MIN,
        Math.round(viewport.height * EXPANDED_HEIGHT_RATIO),
      )
    : POPUP_HEIGHT_DEFAULT;

  return {
    width: Math.max(
      POPUP_MIN_SIZE,
      Math.min(target_width, viewport.width - POPUP_MARGIN * 2),
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

export function get_resized_popup_position(
  position: PopupPosition,
  from: PopupDimensions,
  to: PopupDimensions,
  viewport: PopupViewport,
): PopupPosition {
  return clamp_popup_position(
    {
      x: Math.round(position.x + (from.width - to.width) / 2),
      y: Math.round(position.y + (from.height - to.height) / 2),
    },
    to,
    viewport,
  );
}
