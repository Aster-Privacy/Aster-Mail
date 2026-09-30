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
const QUOTE_ATTRIBUTION_RE =
  /(^|\n|>)[ \t]*On[ \t][^\n<]{1,300}?wrote:[ \t]*(?=\n|<|$)/;

export function strip_reply_quotes(body: string): string {
  const match = QUOTE_ATTRIBUTION_RE.exec(body);
  let processed = body;

  if (match) {
    const start = match.index + match[1].length;
    const before = body.substring(0, start).trim();

    if (before.length > 0) {
      processed = before;
    } else {
      processed = body.substring(match.index + match[0].length);
    }
  }

  return (
    processed
      .replace(/^>.*$/gm, "")
      .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
      .trim() || body
  );
}
