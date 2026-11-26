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
  ascii_lower,
  is_ascii_word_code,
  next_char_table,
  next_hit_table,
  next_needle_table,
  table_lookup,
} from "@/lib/html_text";
import { is_js_whitespace } from "@/lib/linear_trim";

function skip_whitespace(value: string, index: number): number {
  let cursor = index;

  while (cursor < value.length && is_js_whitespace(value.charCodeAt(cursor))) {
    cursor += 1;
  }

  return cursor;
}

function is_digit_code(code: number): boolean {
  return code >= 48 && code <= 57;
}

function is_declaration_stop_code(code: number): boolean {
  return code === 59 || code === 125 || code === 34 || code === 39;
}

function is_quote_code(code: number): boolean {
  return code === 34 || code === 39;
}

function ends_word(value: string, index: number): boolean {
  return index >= value.length || !is_ascii_word_code(value.charCodeAt(index));
}

export function has_style_block_background(html: string): boolean {
  const lower = ascii_lower(html);
  let start = lower.indexOf("<style");

  if (start === -1) return false;

  const next_background = next_needle_table(lower, "background");
  const next_style_close = next_hit_table(
    html.length,
    (index) => lower.startsWith("</style", index) && ends_word(html, index + 7),
  );

  while (start !== -1) {
    if (ends_word(html, start + 6)) {
      const gt = html.indexOf(">", start + 6);

      if (gt === -1) return false;

      const background = table_lookup(next_background, gt + 1);

      if (background === -1) return false;

      const close = table_lookup(next_style_close, gt + 1);

      if (close === -1 || close > background) return true;
    }

    start = lower.indexOf("<style", start + 1);
  }

  return false;
}

function is_margin_auto(
  lower: string,
  index: number,
  next_stop: Int32Array,
  next_auto: Int32Array,
): boolean {
  if (!lower.startsWith("margin", index)) return false;

  const colon = skip_whitespace(lower, index + 6);

  if (lower.charCodeAt(colon) !== 58) return false;

  const auto = table_lookup(next_auto, colon + 1);

  if (auto === -1) return false;

  const stop = table_lookup(next_stop, colon + 1);

  return stop === -1 || stop > auto;
}

function centered_width_end(lower: string, index: number): number {
  if (!lower.startsWith("max-width", index)) return -1;

  const colon = skip_whitespace(lower, index + 9);

  if (lower.charCodeAt(colon) !== 58) return -1;

  const digits = skip_whitespace(lower, colon + 1);
  const first = lower.charCodeAt(digits);

  if (first < 51 || first > 57) return -1;
  if (!is_digit_code(lower.charCodeAt(digits + 1))) return -1;
  if (!is_digit_code(lower.charCodeAt(digits + 2))) return -1;
  if (!lower.startsWith("px", digits + 3)) return -1;

  return digits + 5;
}

export function has_centered_card_layout(html: string): boolean {
  const lower = ascii_lower(html);
  let start = lower.indexOf("max-width");

  if (start === -1) return false;

  const next_stop = next_char_table(lower, is_declaration_stop_code);
  const next_quote = next_char_table(lower, is_quote_code);
  const next_auto = next_needle_table(lower, "auto");
  const next_margin = next_hit_table(lower.length, (index) =>
    is_margin_auto(lower, index, next_stop, next_auto),
  );

  while (start !== -1) {
    const width_end = centered_width_end(lower, start);

    if (width_end !== -1) {
      const semicolon = table_lookup(next_stop, width_end);

      if (semicolon !== -1 && lower.charCodeAt(semicolon) === 59) {
        const margin = table_lookup(next_margin, semicolon + 1);
        const quote = table_lookup(next_quote, semicolon + 1);

        if (margin !== -1 && (quote === -1 || margin < quote)) return true;
      }
    }

    start = lower.indexOf("max-width", start + 1);
  }

  return false;
}

const TABLE_LAYOUT_ATTRIBUTES = ["width", "bgcolor", "background"];

export function has_table_layout_attribute(html: string): boolean {
  const lower = ascii_lower(html);
  let start = lower.indexOf("<table");

  if (start === -1) return false;

  const next_gt = next_char_table(lower, (code) => code === 62);
  const next_attribute = next_hit_table(lower.length, (index) =>
    TABLE_LAYOUT_ATTRIBUTES.some(
      (name) =>
        lower.startsWith(name, index) &&
        lower.charCodeAt(skip_whitespace(lower, index + name.length)) === 61,
    ),
  );

  while (start !== -1) {
    const attribute = table_lookup(next_attribute, start + 6);

    if (attribute === -1) return false;

    const gt = table_lookup(next_gt, start + 6);

    if (gt === -1 || attribute < gt) return true;

    start = lower.indexOf("<table", start + 1);
  }

  return false;
}
