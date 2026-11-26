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

const AT_SIGN = 0x40;
const DOT = 0x2e;
const LESS_THAN = "<";
const GREATER_THAN = ">";

export function is_email_shape(value: string): boolean {
  const length = value.length;
  let at_index = -1;

  for (let index = 0; index < length; index += 1) {
    const code = value.charCodeAt(index);

    if (is_js_whitespace(code)) return false;
    if (code === AT_SIGN) {
      if (at_index !== -1) return false;
      at_index = index;
    }
  }

  if (at_index < 1) return false;

  const domain_start = at_index + 1;

  for (let index = domain_start + 1; index < length - 1; index += 1) {
    if (value.charCodeAt(index) === DOT) return true;
  }

  return false;
}

export function find_angle_content(value: string): string | null {
  let open = value.indexOf(LESS_THAN);

  while (open !== -1) {
    const close = value.indexOf(GREATER_THAN, open + 1);

    if (close === -1) return null;
    if (close > open + 1) return value.slice(open + 1, close);
    open = value.indexOf(LESS_THAN, close + 1);
  }

  return null;
}

export function has_angle_content(value: string): boolean {
  return find_angle_content(value) !== null;
}
