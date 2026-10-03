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
const DATA_IMAGE_SOURCE =
  /src\s*=\s*(["'])data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]*)\1/gi;

export function inline_image_bytes(html: string): number {
  if (!html || !html.includes("data:image/")) return 0;

  let total = 0;

  for (const match of html.matchAll(DATA_IMAGE_SOURCE)) {
    const base64 = match[2].replace(/\s+/g, "");
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

    total += Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  return total;
}

const DATA_IMAGE_PREFIX = "data:image/";
const SRC_ATTRIBUTE_BEFORE_QUOTE = /src\s*=\s*$/i;
const SRC_ATTRIBUTE_LOOKBEHIND = 64;
const MAX_REMEMBERED_IMAGES = 32;

export function create_inline_image_bytes_counter(): (html: string) => number {
  let remembered = new Map<string, number>();

  return (html: string): number => {
    const seen = new Map<string, number>();
    let total = 0;
    let from = 0;

    while (html && from < html.length) {
      const start = html.indexOf(DATA_IMAGE_PREFIX, from);

      if (start === -1) break;
      from = start + DATA_IMAGE_PREFIX.length;

      const quote = html[start - 1];

      if (quote !== '"' && quote !== "'") continue;

      const end = html.indexOf(quote, start);

      if (end === -1) break;
      from = end + 1;

      const before_quote = html.slice(
        Math.max(0, start - 1 - SRC_ATTRIBUTE_LOOKBEHIND),
        start - 1,
      );

      if (!SRC_ATTRIBUTE_BEFORE_QUOTE.test(before_quote)) continue;

      const source = html.slice(start, end);
      let bytes = seen.get(source) ?? remembered.get(source);

      if (bytes === undefined) {
        bytes = inline_image_bytes(`src=${quote}${source}${quote}`);
      }
      if (seen.size < MAX_REMEMBERED_IMAGES) seen.set(source, bytes);
      total += bytes;
    }

    remembered = seen;

    return total;
  };
}
