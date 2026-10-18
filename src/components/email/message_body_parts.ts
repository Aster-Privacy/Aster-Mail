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

const FOOTER_LABEL_LIMIT = 60;

const FOOTER_TAG_RE =
  /^<a\b[^>]*\bhref\s*=\s*["']https:\/\/astermail\.org\/?["']/i;

const FOOTER_TEXT_RE = /\s*Aster Mail\s*<\/a>/iy;

const WHITESPACE_RE = /\s*/y;

const LINE_BREAK_RE = /<br\s*\/?>/iy;

const LINE_BREAK_SEARCH_RE = /<br\s*\/?>/gi;

const SPACE_CHAR_RE = /\s/;

const BLOCKQUOTE_RE = /blockquote\b/iy;

const DIV_RE = /div\b/iy;

const CLASS_ATTR_RE = /\bclass\s*=\s*["']/gi;

const QUOTE_CLASS_RE =
  /\b(?:aster_quote|gmail_quote|protonmail_quote|yahoo_quoted|moz-cite-prefix)\b/i;

const BLOCK_BREAK_RE =
  /<br\s*\/?>|<\/(?:div|p|li|h[1-6]|tr|table|blockquote|pre)>/gi;

function is_visible_part(part: string): boolean {
  return part.replace(/&nbsp;/gi, " ").trim().length > 0;
}

function has_visible_text(html: string): boolean {
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf("<", index);

    if (open < 0) return is_visible_part(html.slice(index));
    if (is_visible_part(html.slice(index, open))) return true;

    const close = html.indexOf(">", open);

    if (close < 0) return is_visible_part(html.slice(open));

    index = close + 1;
  }

  return false;
}

function sticky_match_end(re: RegExp, html: string, at: number): number {
  re.lastIndex = at;

  const match = re.exec(html);

  return match ? at + match[0].length : -1;
}

interface QuoteCursor {
  double_quote: number;
  single_quote: number;
}

function next_quote(html: string, from: number, cursor: QuoteCursor): number {
  if (cursor.double_quote < from) {
    const found = html.indexOf('"', from);

    cursor.double_quote = found < 0 ? html.length : found;
  }

  if (cursor.single_quote < from) {
    const found = html.indexOf("'", from);

    cursor.single_quote = found < 0 ? html.length : found;
  }

  return Math.min(cursor.double_quote, cursor.single_quote);
}

function has_quote_class(
  html: string,
  open: number,
  tag_end: number,
  cursor: QuoteCursor,
): boolean {
  const tag = html.slice(open, tag_end);
  let match: RegExpExecArray | null;

  CLASS_ATTR_RE.lastIndex = 0;

  while ((match = CLASS_ATTR_RE.exec(tag)) !== null) {
    const value_start = open + match.index + match[0].length;
    const value_end = next_quote(html, value_start, cursor);

    if (QUOTE_CLASS_RE.test(html.slice(value_start, value_end))) return true;
  }

  return false;
}

function find_quote_start(html: string): number {
  let div_checked_until = -1;
  const cursor: QuoteCursor = { double_quote: -1, single_quote: -1 };
  let open = html.indexOf("<");

  while (open >= 0) {
    if (sticky_match_end(BLOCKQUOTE_RE, html, open + 1) >= 0) return open;

    if (
      open >= div_checked_until &&
      sticky_match_end(DIV_RE, html, open + 1) >= 0
    ) {
      const close = html.indexOf(">", open);
      const tag_end = close < 0 ? html.length : close;

      if (has_quote_class(html, open, tag_end, cursor)) return open;

      div_checked_until = tag_end;
    }

    open = html.indexOf("<", open + 1);
  }

  return -1;
}

function split_at_quote(html: string): [string, string] {
  const index = find_quote_start(html);

  if (index < 0) return [html, ""];

  return [html.slice(0, index), html.slice(index)];
}

function skip_line_breaks(html: string, at: number): number {
  let index = sticky_match_end(WHITESPACE_RE, html, at);

  while (true) {
    const after_break = sticky_match_end(LINE_BREAK_RE, html, index);

    if (after_break < 0) return index;

    index = sticky_match_end(WHITESPACE_RE, html, after_break);
  }
}

function footer_link_end(html: string, at: number): number {
  if (html[at] !== "<") return -1;

  const close = html.indexOf(">", at);

  if (close < 0) return -1;
  if (!FOOTER_TAG_RE.test(html.slice(at, close))) return -1;

  return sticky_match_end(FOOTER_TEXT_RE, html, close + 1);
}

function find_footer(
  html: string,
  label_start: number,
): { link_start: number; end: number } {
  let link_start = label_start;

  while (
    link_start < html.length &&
    html[link_start] !== "<" &&
    html[link_start] !== ">"
  ) {
    link_start += 1;
  }

  let label_end = link_start;

  while (label_end > label_start && SPACE_CHAR_RE.test(html[label_end - 1])) {
    label_end -= 1;
  }

  if (label_end - label_start > FOOTER_LABEL_LIMIT) {
    return { link_start, end: -1 };
  }

  return { link_start, end: footer_link_end(html, link_start) };
}

function strip_leading_breaks(html: string): string {
  let index = 0;

  while (index < html.length) {
    if (SPACE_CHAR_RE.test(html[index])) {
      index += 1;
      continue;
    }

    const after_break = sticky_match_end(LINE_BREAK_RE, html, index);

    if (after_break < 0) break;

    index = after_break;
  }

  return html.slice(index);
}

function remove_footers(html: string): string {
  let output = "";
  let copied_until = 0;
  let match: RegExpExecArray | null;

  LINE_BREAK_SEARCH_RE.lastIndex = 0;

  while ((match = LINE_BREAK_SEARCH_RE.exec(html)) !== null) {
    const footer = find_footer(html, skip_line_breaks(html, match.index));

    if (footer.end >= 0) {
      output += html.slice(copied_until, match.index);
      copied_until = footer.end;
      LINE_BREAK_SEARCH_RE.lastIndex = footer.end;
    } else {
      LINE_BREAK_SEARCH_RE.lastIndex = Math.max(
        footer.link_start,
        match.index + 1,
      );
    }
  }

  return output + html.slice(copied_until);
}

export function move_leading_footer_to_end(html: string): string {
  if (!html) return html;

  const label_start = skip_line_breaks(html, 0);
  const footer = find_footer(html, label_start);

  if (footer.end < 0) return html;

  const rest = html.slice(footer.end);
  const [head, quoted] = split_at_quote(rest);

  if (!has_visible_text(head)) return html;

  const body = strip_leading_breaks(head);
  const link = html.slice(label_start, footer.end).trim();

  return `${body}<br><br>${link}${quoted}`;
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
  const without_footer = remove_footers(head);

  if (!has_visible_text(without_footer)) {
    return remove_footers(html).replace(BLOCK_BREAK_RE, add_space);
  }

  return strip_reply_quotes(without_footer.replace(BLOCK_BREAK_RE, add_space));
}
