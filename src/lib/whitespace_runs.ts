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
import { is_js_whitespace } from "@/lib/linear_trim";

const NEWLINE = 0x0a;
const SPACE = 0x20;
const TAB = 0x09;

export function join_newline_runs(value: string, separator: string): string {
  const length = value.length;
  let result = "";
  let copied_until = 0;
  let index = 0;

  while (index < length) {
    if (!is_js_whitespace(value.charCodeAt(index))) {
      index += 1;
      continue;
    }

    const run_start = index;
    let has_newline = false;

    while (index < length && is_js_whitespace(value.charCodeAt(index))) {
      if (value.charCodeAt(index) === NEWLINE) has_newline = true;
      index += 1;
    }

    if (has_newline) {
      result += value.slice(copied_until, run_start) + separator;
      copied_until = index;
    }
  }

  if (copied_until === 0) return value;

  return result + value.slice(copied_until);
}

export function drop_blanks_before_newlines(value: string): string {
  const length = value.length;
  let result = "";
  let copied_until = 0;
  let index = 0;

  while (index < length) {
    const code = value.charCodeAt(index);

    if (code !== SPACE && code !== TAB) {
      index += 1;
      continue;
    }

    const run_start = index;

    while (index < length) {
      const run_code = value.charCodeAt(index);

      if (run_code !== SPACE && run_code !== TAB) break;
      index += 1;
    }

    if (index < length && value.charCodeAt(index) === NEWLINE) {
      result += value.slice(copied_until, run_start);
      copied_until = index;
    }
  }

  if (copied_until === 0) return value;

  return result + value.slice(copied_until);
}
