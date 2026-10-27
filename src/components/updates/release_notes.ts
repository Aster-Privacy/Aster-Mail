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
export interface ReleaseNoteSection {
  title: string | null;
  items: string[];
}

export type ReleaseNoteToken =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "code"; text: string };

const HIDDEN_SECTION = /^(verify|checksums?|signatures?|install)/i;
const MAX_ITEMS = 24;

function clean_inline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parse_release_notes(
  body: string | null | undefined,
): ReleaseNoteSection[] {
  if (!body) return [];
  const text = body
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "");
  const sections: ReleaseNoteSection[] = [];
  let current: ReleaseNoteSection = { title: null, items: [] };
  let hidden = false;
  let buffer: string[] = [];
  let count = 0;

  const flush_item = () => {
    const item = clean_inline(buffer.join(" "));

    buffer = [];
    if (!item || hidden || count >= MAX_ITEMS) return;
    current.items.push(item);
    count += 1;
  };

  const flush_section = () => {
    flush_item();
    if (current.items.length > 0) sections.push(current);
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const heading = /^#{1,6}\s+(.+)$/.exec(line);

    if (heading) {
      flush_section();
      const title = clean_inline(heading[1]);

      hidden = HIDDEN_SECTION.test(title);
      current = { title: title || null, items: [] };
      continue;
    }
    if (!line || line.startsWith(">") || /^([-*_])(\s*\1){2,}$/.test(line)) {
      flush_item();
      continue;
    }
    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);

    if (bullet) {
      flush_item();
      buffer = [bullet[1]];
      continue;
    }
    buffer.push(line);
  }
  flush_section();

  return sections;
}

export function tokenize_release_note(text: string): ReleaseNoteToken[] {
  const tokens: ReleaseNoteToken[] = [];
  const pattern = /\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      tokens.push({ kind: "text", text: text.slice(last, match.index) });
    }
    if (match[3] !== undefined) {
      tokens.push({ kind: "code", text: match[3] });
    } else {
      tokens.push({ kind: "strong", text: match[1] ?? match[2] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    tokens.push({ kind: "text", text: text.slice(last) });
  }

  return tokens.map((token) =>
    token.kind === "text"
      ? { kind: "text", text: token.text.replace(/\*([^*]+)\*/g, "$1") }
      : token,
  );
}
