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
export type ImageResizeHandle = "nw" | "ne" | "sw" | "se";

export const MIN_IMAGE_WIDTH = 32;
export const IMAGE_WIDTH_STEP = 10;
export const IMAGE_WIDTH_LARGE_STEP = 50;

export const IMAGE_RESIZE_HANDLES: readonly ImageResizeHandle[] = [
  "nw",
  "ne",
  "sw",
  "se",
];

export function clamp_image_width(width: number, max_width: number): number {
  const ceiling =
    Number.isFinite(max_width) && max_width > 0
      ? Math.max(MIN_IMAGE_WIDTH, Math.floor(max_width))
      : Infinity;

  if (!Number.isFinite(width)) return MIN_IMAGE_WIDTH;

  return Math.round(Math.min(ceiling, Math.max(MIN_IMAGE_WIDTH, width)));
}

export interface DragWidthInput {
  handle: ImageResizeHandle;
  start_width: number;
  start_height: number;
  dx: number;
  dy: number;
  max_width: number;
}

export function compute_drag_width({
  handle,
  start_width,
  start_height,
  dx,
  dy,
  max_width,
}: DragWidthInput): number {
  const x_sign = handle.endsWith("e") ? 1 : -1;
  const y_sign = handle.startsWith("s") ? 1 : -1;
  const aspect = start_height > 0 ? start_width / start_height : 1;
  const delta_from_x = x_sign * dx;
  const delta_from_y = y_sign * dy * aspect;
  const delta =
    Math.abs(delta_from_x) >= Math.abs(delta_from_y)
      ? delta_from_x
      : delta_from_y;

  return clamp_image_width(start_width + delta, max_width);
}

export function step_image_width(
  current_width: number,
  key: string,
  large: boolean,
  max_width: number,
): number | null {
  const step = large ? IMAGE_WIDTH_LARGE_STEP : IMAGE_WIDTH_STEP;

  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clamp_image_width(current_width + step, max_width);
    case "ArrowLeft":
    case "ArrowDown":
      return clamp_image_width(current_width - step, max_width);
    case "Home":
      return clamp_image_width(MIN_IMAGE_WIDTH, max_width);
    case "End":
      return Number.isFinite(max_width) && max_width > 0
        ? clamp_image_width(max_width, max_width)
        : null;
    default:
      return null;
  }
}

export function get_editor_content_width(editor: HTMLElement | null): number {
  if (!editor) return Infinity;

  const width = editor.clientWidth;

  if (!width) return Infinity;

  const style = editor.ownerDocument.defaultView?.getComputedStyle(editor);
  const padding =
    (parseFloat(style?.paddingLeft ?? "") || 0) +
    (parseFloat(style?.paddingRight ?? "") || 0);
  const content = width - padding;

  return content > 0 ? content : Infinity;
}

export function apply_image_width(img: HTMLImageElement, width: number): void {
  const rounded = Math.round(width);

  img.setAttribute("width", String(rounded));
  img.removeAttribute("height");
  img.style.width = `${rounded}px`;
  img.style.height = "auto";
  img.style.maxWidth = "100%";
}

export function read_image_width(img: HTMLImageElement): number {
  const rendered = img.offsetWidth;

  if (rendered > 0) return rendered;

  const from_style = parseFloat(img.style.width);

  if (from_style > 0) return from_style;

  const from_attribute = parseFloat(img.getAttribute("width") ?? "");

  return from_attribute > 0 ? from_attribute : 0;
}
