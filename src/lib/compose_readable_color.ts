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
import type { Rgba } from "@/lib/email_contrast_repair";

import { BODY_TEXT_CONTRAST, contrast_ratio, normalize_hex } from "@/lib/email_ink";
import {
  composite_over,
  parse_css_color,
  rgba_to_hex,
} from "@/lib/email_contrast_repair";

export const COMPOSE_EDITOR_ATTRIBUTE = "data-compose-editor";

const OPAQUE_WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export function compose_display_text_color(
  stored: string,
  background: string,
  readable: string,
): string {
  const stored_hex = normalize_hex(stored);
  const background_hex = normalize_hex(background);

  if (!stored_hex || !background_hex) return stored;

  return contrast_ratio(stored_hex, background_hex) >= BODY_TEXT_CONTRAST
    ? stored
    : readable;
}

export function build_compose_readable_css(
  stored: string,
  display: string,
): string {
  const stored_hex = normalize_hex(stored);
  const display_hex = normalize_hex(display);

  if (!stored_hex || !display_hex || stored_hex === display_hex) return "";

  const value = Number.parseInt(stored_hex.slice(1), 16);
  const rgb = `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
  const scope = `[${COMPOSE_EDITOR_ATTRIBUTE}]`;
  const selectors = [
    `${scope} [style*="color: ${stored_hex}" i]`,
    `${scope} [style*="color:${stored_hex}" i]`,
    `${scope} [style*="color: ${rgb}"]`,
    `${scope} font[color="${stored_hex}" i]`,
  ];

  return `${selectors.join(",\n")} {\n  color: ${display_hex} !important;\n}`;
}

export function resolve_effective_background(element: Element | null): string {
  const layers: Rgba[] = [];
  let current: Element | null = element;

  while (current) {
    const color = parse_css_color(getComputedStyle(current).backgroundColor);

    if (color && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) break;
    }
    current = current.parentElement;
  }

  const base = layers.reduceRight<Rgba>(
    (backdrop, layer) => composite_over(layer, backdrop),
    OPAQUE_WHITE,
  );

  return rgba_to_hex(base);
}

export function resolve_text_color(element: Element | null): string | null {
  if (!element) return null;

  const color = parse_css_color(getComputedStyle(element).color);

  return color ? rgba_to_hex(color) : null;
}
