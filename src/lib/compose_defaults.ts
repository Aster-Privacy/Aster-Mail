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
import type { FontSizeLabel } from "@/hooks/editor_utils";

import { FONT_SIZE_MAP } from "@/hooks/editor_utils";

export const DEFAULT_COMPOSE_FONT_SIZE: FontSizeLabel = "normal";
export const DEFAULT_COMPOSE_FONT_COLOR = "";

const STRICT_HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function normalize_compose_font_size(value: unknown): FontSizeLabel {
  if (typeof value !== "string") return DEFAULT_COMPOSE_FONT_SIZE;

  if (!Object.prototype.hasOwnProperty.call(FONT_SIZE_MAP, value)) {
    return DEFAULT_COMPOSE_FONT_SIZE;
  }

  return value as FontSizeLabel;
}

export function normalize_compose_font_color(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_COMPOSE_FONT_COLOR;

  const trimmed = value.trim();

  if (!STRICT_HEX_COLOR_REGEX.test(trimmed)) return DEFAULT_COMPOSE_FONT_COLOR;

  return trimmed.toLowerCase();
}

export function build_compose_default_style(
  size: unknown,
  color: unknown,
): string {
  const normalized_size = normalize_compose_font_size(size);
  const normalized_color = normalize_compose_font_color(color);
  const declarations: string[] = [];

  if (normalized_size !== DEFAULT_COMPOSE_FONT_SIZE) {
    declarations.push(`font-size: ${FONT_SIZE_MAP[normalized_size]}`);
  }

  if (normalized_color !== DEFAULT_COMPOSE_FONT_COLOR) {
    declarations.push(`color: ${normalized_color}`);
  }

  return declarations.join("; ");
}

export function build_compose_default_block(
  size: unknown,
  color: unknown,
): string {
  const style = build_compose_default_style(size, color);

  if (!style) return "";

  return `<div style="${style}"><br></div>`;
}
