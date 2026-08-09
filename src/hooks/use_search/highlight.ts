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




import { TextHighlight } from "./types";
export function compute_highlight_ranges(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const lower = text.toLowerCase();

  for (const term of terms) {
    const term_lower = term.toLowerCase();
    let pos = 0;

    while (pos < lower.length) {
      const idx = lower.indexOf(term_lower, pos);

      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + term_lower.length });
      pos = idx + 1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

export function apply_highlights(
  text: string,
  ranges: { start: number; end: number }[],
): TextHighlight[] {
  if (ranges.length === 0) return [{ text, is_match: false }];

  const merged: { start: number; end: number }[] = [];

  for (const range of ranges) {
    if (merged.length > 0 && range.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(
        merged[merged.length - 1].end,
        range.end,
      );
    } else {
      merged.push({ ...range });
    }
  }

  const parts: TextHighlight[] = [];
  let pos = 0;

  for (const range of merged) {
    if (range.start > pos) {
      parts.push({ text: text.slice(pos, range.start), is_match: false });
    }
    parts.push({ text: text.slice(range.start, range.end), is_match: true });
    pos = range.end;
  }

  if (pos < text.length) {
    parts.push({ text: text.slice(pos), is_match: false });
  }

  return parts;
}

export function extract_query_terms(query: string): string[] {
  return query
    .replace(/\S+:\S*/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

