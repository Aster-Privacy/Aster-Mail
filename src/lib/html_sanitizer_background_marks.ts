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

const BACKGROUND_IMAGE_DECLARATION = /background(?:-image)?\s*:[^;]*url\s*\(/i;

function next_brace_index(css: string, from: number): number {
  const open_index = css.indexOf("{", from);
  const close_index = css.indexOf("}", from);

  if (open_index === -1) return close_index;
  if (close_index === -1) return open_index;

  return Math.min(open_index, close_index);
}

function collect_selector_parts(selector_text: string, into: string[]): void {
  for (const part of selector_text.split(",")) {
    const trimmed = part.trim();

    if (!trimmed || trimmed.startsWith("@") || trimmed.includes("::")) {
      continue;
    }

    into.push(trimmed);
  }
}

export function selectors_with_background_image(css: string): string[] {
  const selectors: string[] = [];
  let segment_start = 0;
  let index = next_brace_index(css, 0);

  while (index !== -1) {
    if (css[index] === "}") {
      segment_start = index + 1;
      index = next_brace_index(css, segment_start);
      continue;
    }

    const selector_text = css.slice(segment_start, index);
    const block_end = next_brace_index(css, index + 1);

    if (selector_text.length === 0 || block_end === -1 || css[block_end] === "{") {
      segment_start = index + 1;
      index = next_brace_index(css, segment_start);
      continue;
    }

    if (BACKGROUND_IMAGE_DECLARATION.test(css.slice(index + 1, block_end))) {
      collect_selector_parts(selector_text.trim(), selectors);
    }

    segment_start = block_end + 1;
    index = next_brace_index(css, segment_start);
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
