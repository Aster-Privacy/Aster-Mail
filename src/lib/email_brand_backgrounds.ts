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
import { parse_css_color, rgba_to_hex } from "@/lib/email_contrast_repair";
import { relative_luminance } from "@/lib/email_ink";

export const BRAND_BACKGROUND_MARK = "data-aster-keep-bg";

export const PAGE_SURFACE_LUMINANCE_LIMIT = 0.5;

const BACKGROUND_COLOR_DECLARATION = /background(?:-color)?\s*:\s*([^;]+)/i;

const BACKGROUND_IMAGE_DECLARATION = /background(?:-image)?\s*:[^;]*url\s*\(/i;

export function is_page_surface(color: string): boolean {
  const parsed = parse_css_color(color);

  if (!parsed || parsed.a < 1) return true;

  return (
    relative_luminance(rgba_to_hex(parsed)) >= PAGE_SURFACE_LUMINANCE_LIMIT
  );
}

function declared_background(element: Element): string | null {
  const attribute = (element.getAttribute("bgcolor") || "").trim();

  if (attribute) return attribute;

  const style = element.getAttribute("style") || "";

  if (!style || BACKGROUND_IMAGE_DECLARATION.test(style)) return null;

  const match = style.match(BACKGROUND_COLOR_DECLARATION);

  if (!match) return null;

  return match[1].replace(/!important/i, "").trim();
}

export function mark_brand_backgrounds(root: Element): void {
  const candidates = Array.from(
    root.querySelectorAll("[bgcolor],[style*='background']"),
  );

  for (const element of candidates) {
    const background = declared_background(element);

    if (!background || !parse_css_color(background)) continue;
    if (is_page_surface(background)) continue;

    element.setAttribute(BRAND_BACKGROUND_MARK, "1");

    for (const link of Array.from(element.querySelectorAll("a"))) {
      link.setAttribute(BRAND_BACKGROUND_MARK, "1");
    }
  }
}
