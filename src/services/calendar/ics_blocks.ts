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
export function find_ics_blocks(
  text: string,
  name: string,
  limit: number,
): string[] {
  const blocks: string[] = [];
  const begin_pattern = new RegExp(`BEGIN:${name}`, "gi");
  const end_pattern = new RegExp(`END:${name}`, "gi");

  while (blocks.length < limit) {
    const begin = begin_pattern.exec(text);

    if (!begin) {
      break;
    }

    end_pattern.lastIndex = begin.index + begin[0].length;
    const end = end_pattern.exec(text);

    if (!end) {
      break;
    }

    const stop = end.index + end[0].length;

    blocks.push(text.slice(begin.index, stop));
    begin_pattern.lastIndex = stop;
  }

  return blocks;
}

export function find_ics_block(text: string, name: string): string | null {
  return find_ics_blocks(text, name, 1)[0] ?? null;
}

export function remove_html_elements(html: string, tag: string): string {
  const open_pattern = new RegExp(`<${tag}`, "gi");
  const close_pattern = new RegExp(`</${tag}>`, "gi");
  const parts: string[] = [];
  let cursor = 0;

  for (;;) {
    open_pattern.lastIndex = cursor;
    const open = open_pattern.exec(html);

    if (!open) {
      break;
    }

    close_pattern.lastIndex = open.index + open[0].length;
    const close = close_pattern.exec(html);

    if (!close) {
      break;
    }

    parts.push(html.slice(cursor, open.index), " ");
    cursor = close.index + close[0].length;
  }

  parts.push(html.slice(cursor));

  return parts.join("");
}
