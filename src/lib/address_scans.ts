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
  type CharCodePredicate,
  is_js_whitespace,
  trim_end_index,
  trim_start_index,
} from "@/lib/linear_trim";

const AT = 0x40;
const DOT = 0x2e;
const QUOTE = 0x22;
const COMMA = 0x2c;
const LESS = 0x3c;
const GREATER = 0x3e;
const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const MAILTO_PREFIX = "mailto:";
const PGP_BEGIN = "-----BEGIN PGP MESSAGE-----";
const PGP_END = "-----END PGP MESSAGE-----";

export interface NameAngleAddress {
  name: string;
  address: string;
}

export interface PgpBlockMatch {
  index: number;
  prefix: string;
  block: string;
}

export function is_line_terminator(code: number): boolean {
  return code === LF || code === CR || code === 0x2028 || code === 0x2029;
}

function has_line_terminator(
  value: string,
  start: number,
  end: number,
): boolean {
  for (let index = start; index < end; index += 1) {
    if (is_line_terminator(value.charCodeAt(index))) return true;
  }

  return false;
}

function is_blank(code: number): boolean {
  return code === SPACE || code === TAB;
}

function is_space(code: number): boolean {
  return code === SPACE;
}

function is_id_char(code: number): boolean {
  return code !== LESS && code !== GREATER && !is_js_whitespace(code);
}

function is_not_angle(code: number): boolean {
  return code !== LESS && code !== GREATER;
}

function has_inner_at(value: string, start: number, end: number): boolean {
  for (let index = start + 1; index < end - 1; index += 1) {
    if (value.charCodeAt(index) === AT) return true;
  }

  return false;
}

export function is_plain_address(
  value: string,
  is_excluded: CharCodePredicate,
): boolean {
  const at = value.indexOf("@");

  if (at <= 0 || value.indexOf("@", at + 1) >= 0) return false;

  for (let index = 0; index < value.length; index += 1) {
    if (index !== at && is_excluded(value.charCodeAt(index))) return false;
  }

  for (let index = at + 2; index <= value.length - 2; index += 1) {
    if (value.charCodeAt(index) === DOT) return true;
  }

  return false;
}

export function split_outside_quotes(value: string): string[] {
  let quotes_after = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === QUOTE) quotes_after += 1;
  }

  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code === QUOTE) {
      quotes_after -= 1;
    } else if (code === COMMA && quotes_after % 2 === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(value.slice(start));

  return parts;
}

export function find_address_like(
  text: string,
  is_local: CharCodePredicate,
  is_domain: CharCodePredicate,
  is_tld: CharCodePredicate,
  min_tld: number,
): string | null {
  const length = text.length;
  let index = 0;

  while (index < length) {
    if (!is_local(text.charCodeAt(index))) {
      index += 1;
      continue;
    }

    const run_start = index;
    const at = trim_start_index(text, is_local, index);

    if (at < length && text.charCodeAt(at) === AT) {
      const domain_end = trim_start_index(text, is_domain, at + 1);

      for (let dot = domain_end - 1; dot >= at + 2; dot -= 1) {
        if (text.charCodeAt(dot) !== DOT) continue;

        const tld_end = trim_start_index(text, is_tld, dot + 1);

        if (tld_end - dot - 1 >= min_tld) {
          return text.slice(run_start, tld_end);
        }
      }
    }

    index = at;
  }

  return null;
}

export function find_bracketed_ids(value: string): string[] | null {
  const found: string[] = [];
  let position = 0;

  while (position < value.length) {
    const open = value.indexOf("<", position);

    if (open < 0) break;

    const close = trim_start_index(value, is_id_char, open + 1);

    if (
      close < value.length &&
      value.charCodeAt(close) === GREATER &&
      has_inner_at(value, open + 1, close)
    ) {
      found.push(value.slice(open, close + 1));
      position = close + 1;
    } else {
      position = close;
    }
  }

  return found.length > 0 ? found : null;
}

export function bracketed_tail_address(value: string): string | null {
  const close = trim_end_index(value, is_js_whitespace) - 1;

  if (close < 0 || value.charCodeAt(close) !== GREATER) return null;

  const inner_start = trim_end_index(value, is_id_char, close);

  if (inner_start < 1 || value.charCodeAt(inner_start - 1) !== LESS) {
    return null;
  }
  if (!has_inner_at(value, inner_start, close)) return null;

  return value.slice(inner_start, close);
}

export function first_angle_capture(value: string): string | null {
  let position = 0;

  while (position < value.length) {
    const open = value.indexOf("<", position);

    if (open < 0) return null;

    const close = value.indexOf(">", open + 1);

    if (close < 0) return null;
    if (close > open + 1) return value.slice(open + 1, close);

    position = close + 1;
  }

  return null;
}

export function strip_edge_runs(
  value: string,
  is_leading: CharCodePredicate,
  is_trailing: CharCodePredicate,
): string {
  const start = trim_start_index(value, is_leading);

  if (start === value.length) return "";

  const end = Math.max(start, trim_end_index(value, is_trailing));

  return start === 0 && end === value.length ? value : value.slice(start, end);
}

export function drop_blanks_before_newline(
  value: string,
  allow_crlf: boolean,
): string {
  const pieces: string[] = [];
  let kept_from = 0;
  let index = 0;

  while (index < value.length) {
    if (!is_blank(value.charCodeAt(index))) {
      index += 1;
      continue;
    }

    const run_end = trim_start_index(value, is_blank, index);
    const next = value.charCodeAt(run_end);
    const before_newline =
      next === LF ||
      (allow_crlf && next === CR && value.charCodeAt(run_end + 1) === LF);

    if (before_newline) {
      pieces.push(value.slice(kept_from, index));
      kept_from = run_end;
    }

    index = run_end;
  }

  if (pieces.length === 0) return value;

  pieces.push(value.slice(kept_from));

  return pieces.join("");
}

export function replace_html_tags(text: string, replacement: string): string {
  const pieces: string[] = [];
  let kept_from = 0;

  for (;;) {
    const open = text.indexOf("<", kept_from);

    if (open < 0) break;

    const close = text.indexOf(">", open + 1);

    if (close < 0) break;

    pieces.push(text.slice(kept_from, open), replacement);
    kept_from = close + 1;
  }

  if (pieces.length === 0) return text;

  pieces.push(text.slice(kept_from));

  return pieces.join("");
}

export function split_html_tags(text: string): string[] {
  const parts: string[] = [];
  let kept_from = 0;

  for (;;) {
    const open = text.indexOf("<", kept_from);

    if (open < 0) break;

    const close = text.indexOf(">", open + 1);

    if (close < 0) break;

    parts.push(text.slice(kept_from, open), text.slice(open, close + 1));
    kept_from = close + 1;
  }

  parts.push(text.slice(kept_from));

  return parts;
}

export function collapse_spaces_around_at(value: string): string {
  if (value.indexOf("@") < 0) return value;

  const pieces: string[] = [];
  let kept_from = 0;
  let index = 0;

  while (index < value.length) {
    if (value.charCodeAt(index) !== SPACE) {
      index += 1;
      continue;
    }

    const run_end = trim_start_index(value, is_space, index);
    const touches_at =
      (index > 0 && value.charCodeAt(index - 1) === AT) ||
      value.charCodeAt(run_end) === AT;

    if (touches_at) {
      pieces.push(value.slice(kept_from, index));
      kept_from = run_end;
    }

    index = run_end;
  }

  if (pieces.length === 0) return value;

  pieces.push(value.slice(kept_from));

  return pieces.join("");
}

export function name_angle_address(value: string): NameAngleAddress | null {
  const length = value.length;

  if (length < 3 || value.charCodeAt(length - 1) !== GREATER) return null;

  const last_close = value.lastIndexOf(">", length - 2);
  const open = value.indexOf("<", last_close + 1);

  if (open < 0 || open > length - 3) return null;

  const name_end = trim_end_index(value, is_js_whitespace, open);

  if (has_line_terminator(value, 0, name_end)) return null;

  return {
    name: value.slice(0, name_end),
    address: value.slice(open + 1, length - 1),
  };
}

export function padded_name_angle_address(
  value: string,
): NameAngleAddress | null {
  const close = trim_end_index(value, is_js_whitespace) - 1;

  if (close < 0 || value.charCodeAt(close) !== GREATER) return null;

  const inner_start = trim_end_index(value, is_not_angle, close);

  if (inner_start === close) return null;
  if (inner_start < 1 || value.charCodeAt(inner_start - 1) !== LESS) {
    return null;
  }

  const open = inner_start - 1;
  const name_start = trim_start_index(value, is_js_whitespace);
  const name_end = Math.max(
    name_start,
    trim_end_index(value, is_js_whitespace, open),
  );

  if (has_line_terminator(value, name_start, name_end)) return null;

  return {
    name: value.slice(name_start, name_end),
    address: value.slice(inner_start, close),
  };
}

export function split_mailto_url(url: string): [string, string] | null {
  if (!url.startsWith(MAILTO_PREFIX)) return null;

  const query = url.indexOf("?", MAILTO_PREFIX.length);

  if (query < 0) return [url.slice(MAILTO_PREFIX.length), ""];
  if (has_line_terminator(url, query + 1, url.length)) return null;

  return [url.slice(MAILTO_PREFIX.length, query), url.slice(query + 1)];
}

export function find_pgp_block(text: string): PgpBlockMatch | null {
  let begin = text.indexOf(PGP_BEGIN);

  while (begin >= 0) {
    let start = -1;

    if (begin > 0 && text.charCodeAt(begin - 1) === GREATER) {
      start = begin - 1;
    } else {
      const indent = trim_end_index(text, is_blank, begin);

      if (indent === 0 || is_line_terminator(text.charCodeAt(indent - 1))) {
        start = indent;
      }
    }

    if (start >= 0) {
      const end = text.indexOf(PGP_END, begin + PGP_BEGIN.length);

      if (end < 0) return null;

      return {
        index: start,
        prefix: text.slice(start, begin),
        block: text.slice(begin, end + PGP_END.length),
      };
    }

    begin = text.indexOf(PGP_BEGIN, begin + 1);
  }

  return null;
}

const NAME_ADDRESS_STOPS = new Set<number>([
  0x3c, 0x3e, 0x28, 0x29, 0x5b, 0x5d, 0x22, 0x27, 0x2c, 0x3b, 0x3a,
]);

function is_name_address_char(code: number): boolean {
  return !is_js_whitespace(code) && !NAME_ADDRESS_STOPS.has(code);
}

export function find_name_address_candidates(text: string): string[] {
  const found: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (!is_name_address_char(text.charCodeAt(index))) {
      index += 1;
      continue;
    }

    const run_start = index;
    const run_end = trim_start_index(text, is_name_address_char, index);
    let pivot = -1;

    for (let at = run_end - 2; at >= run_start + 1; at -= 1) {
      if (text.charCodeAt(at) === AT && text.charCodeAt(at + 1) !== AT) {
        pivot = at;
        break;
      }
    }

    if (pivot >= 0) {
      const next_at = text.indexOf("@", pivot + 1);
      const end = next_at < 0 || next_at > run_end ? run_end : next_at;

      found.push(text.slice(run_start, end));
    }

    index = run_end;
  }

  return found;
}

function is_less(code: number): boolean {
  return code === LESS;
}

function is_greater(code: number): boolean {
  return code === GREATER;
}

export function strip_angle_edges(value: string): string {
  return strip_edge_runs(value, is_less, is_greater);
}

export function whitespace_or_chars(characters: string): CharCodePredicate {
  const codes = new Set<number>();

  for (let index = 0; index < characters.length; index += 1) {
    codes.add(characters.charCodeAt(index));
  }

  return (code) => is_js_whitespace(code) || codes.has(code);
}
