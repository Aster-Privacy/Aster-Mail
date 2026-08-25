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
export const BACKGROUND_IMAGE_MARK = "data-aster-bg-image";

const RULE_PATTERN = /([^{}]+)\{([^{}]*)\}/g;

const BACKGROUND_IMAGE_DECLARATION = /background(?:-image)?\s*:[^;]*url\s*\(/i;

function rule_selector_text(raw: string): string {
  const segments = raw.split("}");

  return (segments[segments.length - 1] || "").trim();
}

export function selectors_with_background_image(css: string): string[] {
  const selectors: string[] = [];
  const pattern = new RegExp(RULE_PATTERN.source, RULE_PATTERN.flags);
  let match;

  while ((match = pattern.exec(css)) !== null) {
    if (!BACKGROUND_IMAGE_DECLARATION.test(match[2] || "")) continue;

    const selector_text = rule_selector_text(match[1] || "");

    for (const part of selector_text.split(",")) {
      const trimmed = part.trim();

      if (!trimmed || trimmed.startsWith("@") || trimmed.includes("::")) {
        continue;
      }

      selectors.push(trimmed);
    }
  }

  return selectors;
}

export function mark_stylesheet_background_images(root: Element): void {
  const style_elements = Array.from(root.querySelectorAll("style"));

  if (style_elements.length === 0) return;

  const selectors = style_elements.flatMap((element) =>
    selectors_with_background_image(element.textContent || ""),
  );

  for (const selector of selectors) {
    let matches: Element[] = [];

    try {
      matches = Array.from(root.querySelectorAll(selector));
    } catch {
      continue;
    }

    for (const element of matches) {
      element.setAttribute(BACKGROUND_IMAGE_MARK, "1");
    }
  }
}
