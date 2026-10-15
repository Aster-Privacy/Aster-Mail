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

const ARMOR_RE =
  /^-----BEGIN PGP (?:SIGNED MESSAGE-----[ \t]*\n[\s\S]*?^-----END PGP SIGNATURE|(MESSAGE|SIGNATURE|PUBLIC KEY BLOCK|PRIVATE KEY BLOCK)-----[ \t]*\n[\s\S]*?^-----END PGP \1)-----[ \t]*$/gm;

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

  for (const match of text.matchAll(ARMOR_RE)) {
    const start = match.index ?? 0;

    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), literal: false });
    }
    segments.push({ text: match[0], literal: true });
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), literal: false });
  }

  return segments;
}
