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
  find_paired_elements,
  is_html_content,
  replace_matched_ranges,
} from "./html_text";

const QUOTE_ATTRIBUTION_RE =
  /(^|\n|>)[ \t]*On[ \t][^\n<]{1,300}?wrote:[ \t]*(?=\n|<|$)/;

const QUOTED_LINE_RE = /^[ \t]*>/;

export function strip_blockquote_elements(html: string): string {
  return replace_matched_ranges(
    html,
    find_paired_elements(html, ["blockquote"], {
      word_boundary: false,
      open_tag: true,
    }),
    () => "",
  );
}

function strip_plain_text_quotes(body: string): string {
  let in_quote = false;
  const kept = body.split(/\r?\n/).filter((line) => {
    if (QUOTE_ATTRIBUTION_RE.test(line)) {
      in_quote = true;

      return false;
    }

    if (in_quote && QUOTED_LINE_RE.test(line)) return false;
    if (line.trim()) in_quote = false;

    return true;
  });

  return kept.join("\n").trim() || body;
}

export function strip_reply_quotes(body: string): string {
  if (!is_html_content(body)) return strip_plain_text_quotes(body);

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

  return strip_blockquote_elements(processed.replace(/^>.*$/gm, "")).trim() || body;
}
