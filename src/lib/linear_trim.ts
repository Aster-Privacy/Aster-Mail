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
const JS_WHITESPACE_CODES = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002,
  0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028,
  0x2029, 0x202f, 0x205f, 0x3000, 0xfeff,
]);

export type CharCodePredicate = (code: number) => boolean;

export function is_js_whitespace(code: number): boolean {
  return JS_WHITESPACE_CODES.has(code);
}

export function char_set_predicate(characters: string): CharCodePredicate {
  const codes = new Set<number>();

  for (let index = 0; index < characters.length; index += 1) {
    codes.add(characters.charCodeAt(index));
  }

  return (code) => codes.has(code);
}

export function trim_start_index(
  value: string,
  predicate: CharCodePredicate,
  start = 0,
): number {
  let index = start;

  while (index < value.length && predicate(value.charCodeAt(index))) {
    index += 1;
  }

  return index;
}

export function trim_end_index(
  value: string,
  predicate: CharCodePredicate,
  end = value.length,
): number {
  let index = end;

  while (index > 0 && predicate(value.charCodeAt(index - 1))) {
    index -= 1;
  }

  return index;
}

export function trim_start_while(
  value: string,
  predicate: CharCodePredicate,
): string {
  const start = trim_start_index(value, predicate);

  return start === 0 ? value : value.slice(start);
}

export function trim_end_while(
  value: string,
  predicate: CharCodePredicate,
): string {
  const end = trim_end_index(value, predicate);

  return end === value.length ? value : value.slice(0, end);
}

export function trim_edges_while(
  value: string,
  predicate: CharCodePredicate,
): string {
  const start = trim_start_index(value, predicate);

  if (start === value.length) return "";

  const end = trim_end_index(value, predicate);

  return start === 0 && end === value.length ? value : value.slice(start, end);
}

export function trim_js_whitespace_end(value: string): string {
  return trim_end_while(value, is_js_whitespace);
}
