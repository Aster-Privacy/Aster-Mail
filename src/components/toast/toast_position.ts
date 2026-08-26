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
import { use_preferences } from "@/contexts/preferences_context";

export type ToastPosition =
  | "top"
  | "bottom"
  | "top-right"
  | "bottom-right"
  | "top-left"
  | "bottom-left";

export interface ToastPositionLayout {
  anchor: string;
  align: string;
  column: string;
  style: { top: string } | { bottom: string };
}

const TOP_STYLE = { top: "calc(env(safe-area-inset-top, 0px) + 12px)" };
const BOTTOM_STYLE = { bottom: "24px" };
const BOTTOM_ISLAND_STYLE = { bottom: "80px" };

export const TOAST_POSITION_LAYOUT: Record<ToastPosition, ToastPositionLayout> =
  {
    top: {
      anchor: "left-1/2 -translate-x-1/2",
      align: "items-center",
      column: "flex-col",
      style: TOP_STYLE,
    },
    bottom: {
      anchor: "left-1/2 -translate-x-1/2",
      align: "items-center",
      column: "flex-col-reverse",
      style: BOTTOM_STYLE,
    },
    "top-right": {
      anchor: "right-4",
      align: "items-end",
      column: "flex-col",
      style: TOP_STYLE,
    },
    "top-left": {
      anchor: "left-4",
      align: "items-start",
      column: "flex-col",
      style: TOP_STYLE,
    },
    "bottom-right": {
      anchor: "right-4",
      align: "items-end",
      column: "flex-col-reverse",
      style: BOTTOM_STYLE,
    },
    "bottom-left": {
      anchor: "left-4",
      align: "items-start",
      column: "flex-col-reverse",
      style: BOTTOM_STYLE,
    },
  };

export const DEFAULT_TOAST_POSITION: ToastPosition = "bottom";

export function is_top_position(position: ToastPosition) {
  return position.startsWith("top");
}

export function resolve_toast_position(value: string | undefined) {
  return value && value in TOAST_POSITION_LAYOUT
    ? (value as ToastPosition)
    : DEFAULT_TOAST_POSITION;
}

interface ResolvedToastPosition {
  position: ToastPosition;
  layout: ToastPositionLayout;
  is_top: boolean;
  y_offset: number;
}

export function use_toast_position(
  override?: ToastPosition,
  lift_above_island = false,
): ResolvedToastPosition {
  const { preferences } = use_preferences();
  const position =
    override ?? resolve_toast_position(preferences.toast_position);
  const base_layout = TOAST_POSITION_LAYOUT[position];
  const is_top = is_top_position(position);
  const layout =
    lift_above_island && !is_top
      ? { ...base_layout, style: BOTTOM_ISLAND_STYLE }
      : base_layout;

  return { position, layout, is_top, y_offset: is_top ? -20 : 20 };
}
