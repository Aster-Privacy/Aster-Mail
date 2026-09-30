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
import { strip_reply_quotes } from "@/lib/strip_reply_quotes";

const FOOTER_LINK_SOURCE = String.raw`<a\b[^>]*\bhref\s*=\s*["']https:\/\/astermail\.org\/?["'][^>]*>\s*Aster Mail\s*<\/a>`;

const LEADING_FOOTER_RE = new RegExp(
  String.raw`^\s*(?:<br\s*\/?>\s*)*([^<>]{0,60}?\s*${FOOTER_LINK_SOURCE})`,
  "i",
);

const ANY_FOOTER_RE = new RegExp(
  String.raw`(?:<br\s*\/?>\s*)+[^<>]{0,60}?\s*${FOOTER_LINK_SOURCE}`,
  "gi",
);

const QUOTE_START_RE =
  /<(?:blockquote\b|div\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:aster_quote|gmail_quote|protonmail_quote|yahoo_quoted|moz-cite-prefix)\b)/i;

const BLOCK_BREAK_RE =
  /<br\s*\/?>|<\/(?:div|p|li|h[1-6]|tr|table|blockquote|pre)>/gi;

function has_visible_text(html: string): boolean {
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim().length > 0
  );
}

function split_at_quote(html: string): [string, string] {
  const match = QUOTE_START_RE.exec(html);

  if (!match) return [html, ""];

  return [html.slice(0, match.index), html.slice(match.index)];
}

export function move_leading_footer_to_end(html: string): string {
  if (!html) return html;

  const match = LEADING_FOOTER_RE.exec(html);

  if (!match) return html;

  const rest = html.slice(match[0].length);
  const [head, quoted] = split_at_quote(rest);

  if (!has_visible_text(head)) return html;

  const body = head.replace(/^(?:\s|<br\s*\/?>)+/i, "");

  return `${body}<br><br>${match[1].trim()}${quoted}`;
}

const PLAIN_FOOTER_RE = /(?:^|\n)[^\n]{0,40}\bAster Mail\s*$/;

function add_space(tag: string): string {
  return `${tag} `;
}

export function extract_preview_html(html: string): string {
  if (!html) return html;

  if (!/<[a-z!/]/i.test(html)) {
    const plain = strip_reply_quotes(html).replace(PLAIN_FOOTER_RE, "").trim();

    return plain || html;
  }

  const [head] = split_at_quote(html);
  const without_footer = head.replace(ANY_FOOTER_RE, "");

  if (!has_visible_text(without_footer)) {
    return html.replace(ANY_FOOTER_RE, "").replace(BLOCK_BREAK_RE, add_space);
  }

  return strip_reply_quotes(without_footer.replace(BLOCK_BREAK_RE, add_space));
}
