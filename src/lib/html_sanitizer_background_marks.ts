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
  ascii_ci_at,
  index_of_ascii_ci,
  skip_js_whitespace,
} from "./html_sanitizer_constants";
import { create_selector_budget, is_affordable_selector } from "./selector_budget";

export const BACKGROUND_IMAGE_MARK = "data-aster-bg-image";

const MAX_MARKED_SELECTORS = 4_000;
const MARK_TIME_BUDGET_MS = 150;

function has_url_call(value: string, from: number, end: number): boolean {
  for (
    let start = index_of_ascii_ci(value, "url", from, end);
    start !== -1;
    start = index_of_ascii_ci(value, "url", start + 1, end)
  ) {
    if (value.charCodeAt(skip_js_whitespace(value, start + 3)) === 0x28) {
      return true;
    }
  }

  return false;
}

export function has_background_image_declaration(value: string): boolean {
  let from = 0;

  for (;;) {
    const start = index_of_ascii_ci(value, "background", from);

    if (start === -1) return false;

    let position = start + 10;

    if (ascii_ci_at(value, position, "-image")) position += 6;

    position = skip_js_whitespace(value, position);

    if (value.charCodeAt(position) !== 0x3a) {
      from = start + 1;
      continue;
    }

    const semicolon = value.indexOf(";", position + 1);
    const end = semicolon === -1 ? value.length : semicolon;

    if (has_url_call(value, position + 1, end)) return true;

    if (semicolon === -1) return false;

    from = semicolon + 1;
  }
}

const INLINE_BACKGROUND_IMAGE_VALUE = /background-image\s*:\s*([^;]*)/gi;

const NO_BACKGROUND_IMAGE =
  /^(?:none|initial|unset|inherit|revert|revert-layer)?$/i;

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

    if (
      selector_text.length === 0 ||
      block_end === -1 ||
      css[block_end] === "{"
    ) {
      segment_start = index + 1;
      index = next_brace_index(css, segment_start);
      continue;
    }

    if (has_background_image_declaration(css.slice(index + 1, block_end))) {
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

  const budget = create_selector_budget(
    MAX_MARKED_SELECTORS,
    MARK_TIME_BUDGET_MS,
  );

  for (const selector of selectors) {
    if (!is_affordable_selector(selector)) continue;
    if (!budget.take()) return;

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

export function has_inline_background_image(style: string): boolean {
  for (const match of style.matchAll(INLINE_BACKGROUND_IMAGE_VALUE)) {
    const value = match[1].replace(/!\s*important/i, "").trim();

    if (!NO_BACKGROUND_IMAGE.test(value)) return true;
  }

  return false;
}

export function mark_inline_background_images(root: Element): void {
  const candidates = Array.from(
    root.querySelectorAll("[style*='background-image' i]"),
  );

  for (const element of candidates) {
    if (has_inline_background_image(element.getAttribute("style") || "")) {
      element.setAttribute(BACKGROUND_IMAGE_MARK, "1");
    }
  }
}
