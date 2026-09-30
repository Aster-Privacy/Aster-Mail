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

const MARK_FIRST = 0x0300;
const MARK_LAST = 0x036f;
const FOLD_START = 0x00c0;
const FOLD_END = 0x2000;
const REMOVE = 0xffff;

const FOLDED_BLOCKS: ReadonlyArray<readonly [number, number]> = [
  [0x00c0, 0x024f],
  [0x0370, 0x03ff],
  [0x0400, 0x04ff],
  [0x1e00, 0x1eff],
  [0x1f00, 0x1fff],
];

const MAX_PATTERN_TERM = 256;
const MAX_PATTERN_TEXT = 16_384;
const PATTERN_CACHE_SIZE = 64;

function build_fold_table(): Uint16Array {
  const table = new Uint16Array(FOLD_END);

  for (let code = MARK_FIRST; code <= MARK_LAST; code++) table[code] = REMOVE;

  for (const [first, last] of FOLDED_BLOCKS) {
    for (let code = first; code <= last; code++) {
      const decomposed = String.fromCharCode(code).normalize("NFD");

      if (decomposed.length < 2) continue;

      let marks_only = true;

      for (let i = 1; i < decomposed.length; i++) {
        const mark = decomposed.charCodeAt(i);

        if (mark < MARK_FIRST || mark > MARK_LAST) {
          marks_only = false;
          break;
        }
      }

      if (marks_only) table[code] = decomposed.charCodeAt(0);
    }
  }

  return table;
}

const fold_table = build_fold_table();

function code_escape(code: number): string {
  return "\\u" + code.toString(16).padStart(4, "0");
}

function build_variant_classes(): Map<number, string> {
  const variants = new Map<number, string>();

  for (let code = FOLD_START; code < FOLD_END; code++) {
    const base = fold_table[code];

    if (base === 0 || base === REMOVE) continue;
    variants.set(base, (variants.get(base) ?? "") + code_escape(code));
  }

  return variants;
}

const variant_classes = build_variant_classes();
const MARKS_CLASS = `[${code_escape(MARK_FIRST)}-${code_escape(MARK_LAST)}]`;
const MARKS_SOURCE = `${MARKS_CLASS}*`;
const HAS_MARK = new RegExp(MARKS_CLASS);

export function fold_search_text(value: string): string {
  const lower = value.toLowerCase();
  let folded = "";
  let copied = 0;

  for (let i = 0; i < lower.length; i++) {
    const code = lower.charCodeAt(i);

    if (code < FOLD_START || code >= FOLD_END) continue;

    const base = fold_table[code];

    if (base === 0) continue;
    folded += lower.slice(copied, i);
    if (base !== REMOVE) folded += String.fromCharCode(base);
    copied = i + 1;
  }

  return copied === 0 ? lower : folded + lower.slice(copied);
}

const patterns = new Map<string, RegExp>();

function folded_pattern(term: string): RegExp {
  const cached = patterns.get(term);

  if (cached) return cached;

  let source = "";

  for (let i = 0; i < term.length; i++) {
    const code = term.charCodeAt(i);

    if (i > 0) source += MARKS_SOURCE;
    source += `[${code_escape(code)}${variant_classes.get(code) ?? ""}]`;
  }

  const pattern = new RegExp(source);

  if (patterns.size >= PATTERN_CACHE_SIZE) {
    const oldest = patterns.keys().next().value;

    if (oldest !== undefined) patterns.delete(oldest);
  }
  patterns.set(term, pattern);

  return pattern;
}

export function clear_folded_patterns(): void {
  patterns.clear();
}

export function includes_folded(text: string, folded_term: string): boolean {
  if (text.includes(folded_term)) return true;
  if (HAS_MARK.test(folded_term)) return false;
  if (folded_term.length > MAX_PATTERN_TERM || text.length > MAX_PATTERN_TEXT) {
    return fold_search_text(text).includes(folded_term);
  }

  return folded_pattern(folded_term).test(text);
}
