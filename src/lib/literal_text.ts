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
export const LITERAL_TEXT_CLASS = "aster-literal-text";

export const LITERAL_TEXT_SELECTOR = `pre.${LITERAL_TEXT_CLASS}`;

export interface TextSegment {
  text: string;
  literal: boolean;
}

const DIFF_GIT_RE = /^diff --git \S/m;
const OLD_FILE_RE = /^--- \S/m;
const NEW_FILE_RE = /^\+\+\+ \S/m;
const HUNK_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m;
const MARKUP_START_RE = /^\s*</;

const ARMOR_BEGIN_PREFIX = "-----BEGIN PGP ";
const ARMOR_END_PREFIX = "-----END PGP ";
const ARMOR_DELIMITER = "-----";
const ARMOR_KINDS = [
  "MESSAGE",
  "SIGNATURE",
  "PUBLIC KEY BLOCK",
  "PRIVATE KEY BLOCK",
] as const;
const SIGNED_MESSAGE_KIND = "SIGNED MESSAGE";

type ArmorKind = (typeof ARMOR_KINDS)[number];

interface ArmorLine {
  start: number;
  end: number;
  begin_end_kind: ArmorKind | null;
  end_kind: ArmorKind | null;
}

interface ArmorRange {
  start: number;
  end: number;
}

function is_line_terminator(character: string): boolean {
  return (
    character === "\n" ||
    character === "\r" ||
    character === "\u2028" ||
    character === "\u2029"
  );
}

function is_blank_tail(text: string, from: number, to: number): boolean {
  for (let i = from; i < to; i += 1) {
    if (text[i] !== " " && text[i] !== "\t") return false;
  }

  return true;
}

function read_armor_kind(
  text: string,
  from: number,
  to: number,
  kinds: readonly string[],
): { kind: string; after: number } | null {
  for (const kind of kinds) {
    const delimiter_at = from + kind.length;

    if (
      delimiter_at + ARMOR_DELIMITER.length <= to &&
      text.startsWith(kind, from) &&
      text.startsWith(ARMOR_DELIMITER, delimiter_at)
    ) {
      return { kind, after: delimiter_at + ARMOR_DELIMITER.length };
    }
  }

  return null;
}

function classify_armor_line(
  text: string,
  start: number,
  end: number,
): ArmorLine {
  const line: ArmorLine = {
    start,
    end,
    begin_end_kind: null,
    end_kind: null,
  };

  if (text.startsWith(ARMOR_BEGIN_PREFIX, start) && text[end] === "\n") {
    const header = read_armor_kind(
      text,
      start + ARMOR_BEGIN_PREFIX.length,
      end,
      [SIGNED_MESSAGE_KIND, ...ARMOR_KINDS],
    );

    if (header && is_blank_tail(text, header.after, end)) {
      line.begin_end_kind =
        header.kind === SIGNED_MESSAGE_KIND
          ? "SIGNATURE"
          : (header.kind as ArmorKind);
    }
  } else if (text.startsWith(ARMOR_END_PREFIX, start)) {
    const footer = read_armor_kind(
      text,
      start + ARMOR_END_PREFIX.length,
      end,
      ARMOR_KINDS,
    );

    if (footer && is_blank_tail(text, footer.after, end)) {
      line.end_kind = footer.kind as ArmorKind;
    }
  }

  return line;
}

function list_armor_lines(text: string): ArmorLine[] {
  const lines: ArmorLine[] = [];
  let start = 0;

  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || is_line_terminator(text[i])) {
      lines.push(classify_armor_line(text, start, i));
      start = i + 1;
    }
  }

  return lines;
}

export function find_armor_ranges(text: string): ArmorRange[] {
  if (!text.includes(ARMOR_BEGIN_PREFIX)) return [];

  const lines = list_armor_lines(text);
  const end_lines = new Map<ArmorKind, number[]>(
    ARMOR_KINDS.map((kind) => [kind, []]),
  );
  const end_cursor = new Map<ArmorKind, number>(
    ARMOR_KINDS.map((kind) => [kind, 0]),
  );

  lines.forEach((line, index) => {
    if (line.end_kind) end_lines.get(line.end_kind)!.push(index);
  });

  const ranges: ArmorRange[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const kind = lines[i].begin_end_kind;

    if (!kind) continue;

    const candidates = end_lines.get(kind)!;
    let cursor = end_cursor.get(kind)!;

    while (cursor < candidates.length && candidates[cursor] <= i) cursor += 1;
    end_cursor.set(kind, cursor);

    if (cursor >= candidates.length) continue;

    const closing = candidates[cursor];

    ranges.push({ start: lines[i].start, end: lines[closing].end });
    i = closing;
  }

  return ranges;
}

export function looks_like_patch(text: string): boolean {
  if (!text || MARKUP_START_RE.test(text)) return false;
  if (DIFF_GIT_RE.test(text)) return true;

  return OLD_FILE_RE.test(text) && NEW_FILE_RE.test(text) && HUNK_RE.test(text);
}

function normalize_newlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function split_literal_segments(raw: string): TextSegment[] {
  if (!raw) return [];

  const text = normalize_newlines(raw);

  if (looks_like_patch(text)) return [{ text, literal: true }];

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const range of find_armor_ranges(text)) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), literal: false });
    }
    segments.push({ text: text.slice(range.start, range.end), literal: true });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), literal: false });
  }

  return segments;
}
