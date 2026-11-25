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
import { split_autolinks } from "./autolink";
import { is_transparent_color_value } from "./html_sanitizer_css";
import { looks_format_flowed, unflow_format_flowed } from "./format_flowed";
import { repair_comment_markup } from "./html_sanitizer_utils";
import { is_js_whitespace, trim_start_index } from "./linear_trim";
import {
  LITERAL_TEXT_CLASS,
  looks_like_patch,
  split_literal_segments,
} from "./literal_text";

const HTML_TAG_NAMES =
  "a|abbr|address|area|article|aside|audio|b|base|bdi|bdo|big|blockquote|body|br|button|caption|center|cite|code|col|colgroup|dd|del|details|dfn|div|dl|dt|em|figcaption|figure|font|footer|form|h[1-6]|head|header|hr|html|i|img|input|ins|kbd|label|li|link|main|map|mark|meta|nav|o:p|ol|p|picture|pre|q|s|samp|section|small|source|span|strike|strong|style|sub|summary|sup|svg|table|tbody|td|tfoot|th|thead|title|tr|tt|u|ul|v:[a-z]+|video|wbr|xml";

const HTML_PATTERNS = [
  new RegExp(`<(?:${HTML_TAG_NAMES})(?=[\\s/>])[^<>]*>`, "i"),
  new RegExp(`</(?:${HTML_TAG_NAMES})\\s*>`, "i"),
  /<!(?:doctype\b|--)/i,
  /&(?:nbsp|amp|lt|gt|quot|apos|copy|reg|trade|hellip|mdash|ndash|lsquo|rsquo|ldquo|rdquo|laquo|raquo|bull|middot|shy|zwnj|zwj|euro|pound);/i,
  /&#(?:\d+|x[0-9a-f]+);/i,
];

export function is_html_content(content: string): boolean {
  if (!content || typeof content !== "string") {
    return false;
  }

  if (looks_like_patch(content)) return false;

  return HTML_PATTERNS.some((pattern) => pattern.test(content));
}

export function as_quotable_html(content: string): string {
  if (!content) return "";

  return is_html_content(content) ? content : plain_text_to_html(content);
}

const QUOTE_CONTAINER_OPEN_SOURCE = "<(?:div|blockquote)";
const QUOTE_ATTRIBUTE_HEAD_SOURCE = `class=["']|type=["']cite["']`;
const QUOTE_CLASS_NAME_SOURCE =
  "aster_quote|gmail_quote|yahoo_quoted|protonmail_quote|moz-cite-prefix";
const QUOTE_CLASS_VALUE_OFFSET = "class='".length;
const IMAGE_OPEN_SOURCE = "<img\\b";
const IMAGE_SOURCE_ATTRIBUTE_SOURCE = "src\\s*=";
const SECURED_BY_OPEN_SOURCE = "<span";
const SECURED_BY_TAIL_SOURCE =
  "Secured by\\s*<a[^>]*>Aster Mail<\\/a><\\/span>";
const ASTER_LINK_OPEN_SOURCE = "<a";
const ASTER_LINK_HREF_SOURCE = `href=["']https?:\\/\\/astermail\\.org["']`;
const ASTER_LINK_TAIL_SOURCE = "Aster Mail<\\/a>";

function memoize_forward(
  find: (position: number) => number,
): (position: number) => number {
  let cached_from = -1;
  let cached_at = -1;

  return (position) => {
    if (
      cached_from >= 0 &&
      position >= cached_from &&
      (cached_at < 0 || position <= cached_at)
    ) {
      return cached_at;
    }

    cached_from = position;
    cached_at = find(position);

    return cached_at;
  };
}

function create_position_finder(
  text: string,
  source: string,
): (position: number) => number {
  const pattern = new RegExp(source, "gi");

  return memoize_forward((position) => {
    pattern.lastIndex = position;
    const match = pattern.exec(text);

    return match ? match.index : -1;
  });
}

function create_sticky_end(
  text: string,
  source: string,
): (position: number) => number {
  const pattern = new RegExp(source, "iy");
  let cached_position = -1;
  let cached_end = -1;

  return (position) => {
    if (position !== cached_position) {
      pattern.lastIndex = position;
      cached_position = position;
      cached_end = pattern.exec(text) ? pattern.lastIndex : -1;
    }

    return cached_end;
  };
}

function find_tag_with_attribute(
  content: string,
  opener_source: string,
  next_attribute: (position: number) => number,
): number {
  const opener = new RegExp(opener_source, "gi");
  const next_tag_end = create_position_finder(content, ">");
  let found: RegExpExecArray | null;

  while ((found = opener.exec(content)) !== null) {
    const attributes_start = opener.lastIndex;
    const attribute = next_attribute(attributes_start);

    if (attribute < 0) return -1;

    const tag_end = next_tag_end(attributes_start);

    if (tag_end < 0 || attribute < tag_end) return found.index;
    opener.lastIndex = found.index + 1;
  }

  return -1;
}

function find_quote_container_start(content: string): number {
  const next_head = create_position_finder(
    content,
    QUOTE_ATTRIBUTE_HEAD_SOURCE,
  );
  const next_quote = create_position_finder(content, `["']`);
  const next_name = create_position_finder(content, QUOTE_CLASS_NAME_SOURCE);
  const next_attribute = memoize_forward((position) => {
    let head = next_head(position);

    while (head >= 0) {
      if (content[head] === "t" || content[head] === "T") return head;

      const value_start = head + QUOTE_CLASS_VALUE_OFFSET;
      const value_end = next_quote(value_start);
      const name = next_name(value_start);

      if (value_end >= 0 && name >= 0 && name < value_end) return head;
      head = next_head(head + 1);
    }

    return -1;
  });

  return find_tag_with_attribute(
    content,
    QUOTE_CONTAINER_OPEN_SOURCE,
    next_attribute,
  );
}

function remove_footer_links(
  content: string,
  opener_source: string,
  tail_source: string,
  href_source: string | null,
): string {
  const opener = new RegExp(opener_source, "gi");
  const next_tag_end = create_position_finder(content, ">");
  const next_href = href_source
    ? create_position_finder(content, href_source)
    : null;
  const tail_end = create_sticky_end(content, tail_source);
  let output = "";
  let cursor = 0;
  let found: RegExpExecArray | null;

  while ((found = opener.exec(content)) !== null) {
    const attributes_start = opener.lastIndex;
    const tag_end = next_tag_end(attributes_start);

    if (tag_end < 0) break;

    const href = next_href ? next_href(attributes_start) : attributes_start;
    const end = href >= 0 && href <= tag_end ? tail_end(tag_end + 1) : -1;

    if (end < 0) {
      opener.lastIndex = found.index + 1;
      continue;
    }

    output += content.slice(cursor, found.index);
    cursor = end;
    opener.lastIndex = end;
  }

  return output + content.slice(cursor);
}

function unwrap_markdown_links(text: string): string {
  const next_bracket_close = create_position_finder(text, "\\]");
  const next_paren_close = create_position_finder(text, "\\)");
  let output = "";
  let cursor = 0;
  let open = text.indexOf("[");

  while (open >= 0) {
    const label_end = next_bracket_close(open + 1);

    if (label_end < 0) break;

    const target_end =
      label_end > open + 1 && text[label_end + 1] === "("
        ? next_paren_close(label_end + 2)
        : -1;

    if (target_end > label_end + 2) {
      output += text.slice(cursor, open) + text.slice(open + 1, label_end);
      cursor = target_end + 1;
      open = text.indexOf("[", cursor);
    } else {
      open = text.indexOf("[", open + 1);
    }
  }

  return output + text.slice(cursor);
}

export function strip_quoted_sections(content: string): string {
  const idx = find_quote_container_start(content);

  if (idx < 0) return content;
  const own_content = content.slice(0, idx);

  return strip_html_tags(own_content).trim() ? own_content : content;
}

export function trailing_background_value(declaration: string): string | null {
  let tail_start = 0;

  for (let index = declaration.length - 1; index >= 0; index -= 1) {
    const code = declaration.charCodeAt(index);

    if (code === 59 || code === 34 || code === 39) {
      tail_start = index + 1;
      break;
    }
  }

  const lower = ascii_lower(declaration);

  for (
    let index = lower.indexOf("background", tail_start);
    index !== -1;
    index = lower.indexOf("background", index + 1)
  ) {
    const name_end = index + "background".length;
    let colon = -1;

    if (lower.startsWith("-color", name_end)) {
      const after = trim_start_index(
        declaration,
        is_js_whitespace,
        name_end + "-color".length,
      );

      if (declaration.charCodeAt(after) === 58) colon = after;
    }

    if (colon === -1) {
      const after = trim_start_index(declaration, is_js_whitespace, name_end);

      if (declaration.charCodeAt(after) === 58) colon = after;
    }

    if (colon === -1) continue;

    return colon + 1 < declaration.length ? declaration.slice(colon + 1) : null;
  }

  return null;
}

function has_designed_background_style(content: string): boolean {
  const declarations = content.match(
    /style\s*=\s*["'][^"']*background(?:-color)?\s*:\s*[^;"']+/gi,
  );

  if (!declarations) return false;

  return declarations.some((declaration) => {
    const value = (trailing_background_value(declaration) ?? "").trim();

    return value.length > 0 && !is_transparent_color_value(value);
  });
}

export function has_rich_html(content: string): boolean {
  if (!content || typeof content !== "string") return false;

  const stripped = strip_quoted_sections(
    remove_footer_links(
      remove_footer_links(
        content,
        SECURED_BY_OPEN_SOURCE,
        SECURED_BY_TAIL_SOURCE,
        null,
      ),
      ASTER_LINK_OPEN_SOURCE,
      ASTER_LINK_TAIL_SOURCE,
      ASTER_LINK_HREF_SOURCE,
    ),
  );

  if (/<(table|td|th|tr)\b/i.test(stripped)) return true;
  if (/<style[\s>]/i.test(stripped)) return true;
  if (has_designed_background_style(stripped)) return true;
  if (/style\s*=\s*["'][^"']*\bwidth\s*:/i.test(stripped)) return true;
  if (
    find_tag_with_attribute(
      stripped,
      IMAGE_OPEN_SOURCE,
      create_position_finder(stripped, IMAGE_SOURCE_ATTRIBUTE_SOURCE),
    ) >= 0
  ) {
    return true;
  }
  if (/<(center|font)\b/i.test(stripped)) return true;

  return false;
}

function escape_text(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function linkify_text(text: string): string {
  return split_autolinks(text)
    .map((segment) => {
      if (!segment.href) return escape_text(segment.text);
      const href = escape_text(segment.href).replace(/'/g, "&#39;");

      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escape_text(segment.text)}</a>`;
    })
    .join("");
}

function prose_to_html(text: string): string {
  const reflowed = looks_format_flowed(text)
    ? unflow_format_flowed(text)
    : text;
  const paragraphs = reflowed.split(/\n\n+/);

  return paragraphs
    .map((para) => {
      const escaped = linkify_text(para).replace(/\n/g, "<br>");

      return `<p dir="auto">${escaped}</p>`;
    })
    .join("\n");
}

function literal_to_html(text: string): string {
  return `<pre dir="auto" class="${LITERAL_TEXT_CLASS}" style="white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 1em">${linkify_text(text)}</pre>`;
}

function trim_newlines(text: string): string {
  let start = 0;
  let end = text.length;

  while (start < end && text[start] === "\n") start += 1;
  while (end > start && text[end - 1] === "\n") end -= 1;

  return text.slice(start, end);
}

export function plain_text_to_html(text: string): string {
  if (!text) return "";

  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const segments = split_literal_segments(normalized);

  if (segments.length === 1 && !segments[0].literal) {
    return prose_to_html(normalized);
  }

  return segments
    .map((segment) => {
      if (segment.literal) return literal_to_html(segment.text);

      const prose = trim_newlines(segment.text);

      return prose.trim() ? prose_to_html(prose) : "";
    })
    .filter(Boolean)
    .join("\n");
}

export interface ReadablePlainTextOptions {
  keep_link_urls?: boolean;
}

function append_link_urls(doc: Document) {
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>("a[href]"),
  );
  const labelled = new Set<string>();

  anchors.forEach((el) => {
    const href = (el.getAttribute("href") ?? "").trim();

    if (href && (el.textContent ?? "").trim()) labelled.add(href);
  });

  let previous_href = "";

  anchors.forEach((el) => {
    const href = (el.getAttribute("href") ?? "").trim();

    if (!/^https?:\/\//i.test(href)) return;

    const label = (el.textContent ?? "").replace(/\s+/g, "");

    if (!label && labelled.has(href)) return;
    if (href === previous_href) return;

    previous_href = href;

    if (label.includes(href)) return;

    el.append(doc.createTextNode(` ${href} `));
  });
}

export function html_to_readable_plain_text(
  html: string,
  options: ReadablePlainTextOptions = {},
): string {
  if (!html || typeof html !== "string") return "";
  if (typeof DOMParser === "undefined") return strip_html_tags(html);

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(
      repair_comment_markup(html),
      "text/html",
    );
  } catch {
    return strip_html_tags(html);
  }

  doc
    .querySelectorAll(
      "script, style, head, noscript, template, iframe, object, embed",
    )
    .forEach((el) => el.remove());

  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const s = el.getAttribute("style") ?? "";

    if (
      /display\s*:\s*none/i.test(s) ||
      /visibility\s*:\s*hidden/i.test(s) ||
      /max-height\s*:\s*0(?![.0-9])/i.test(s) ||
      /font-size\s*:\s*0(?![.0-9])/i.test(s) ||
      /opacity\s*:\s*0(?![.0-9])/i.test(s)
    ) {
      el.remove();
    }
  });

  if (options.keep_link_urls) append_link_urls(doc);

  doc
    .querySelectorAll("br")
    .forEach((el) => el.replaceWith(doc.createTextNode("\n")));

  doc
    .querySelectorAll(
      "p, div, section, article, header, footer, h1, h2, h3, h4, h5, h6, li, blockquote",
    )
    .forEach((el) => {
      el.prepend(doc.createTextNode("\n"));
      el.append(doc.createTextNode("\n"));
    });

  doc
    .querySelectorAll("td, th")
    .forEach((el) => el.append(doc.createTextNode(" ")));
  doc
    .querySelectorAll("tr")
    .forEach((el) => el.append(doc.createTextNode("\n")));

  doc
    .querySelectorAll(
      "img[width='1'], img[height='1'], img[width='0'], img[height='0']",
    )
    .forEach((el) => el.remove());

  const text = doc.body?.textContent ?? "";

  return text
    .replace(/ /g, " ")
    .replace(/[​‌‍﻿]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const BOUNDED_STRIP_STEPS = [16384, 65536, 262144];

const BOUNDED_STRIP_MARGIN = 64;

function last_tag_boundary(html: string, limit: number): number {
  let boundary = -1;
  let quote = "";
  let in_tag = false;

  for (let index = 0; index < limit; index += 1) {
    const char = html[index];

    if (!in_tag) {
      if (char === "<") {
        in_tag = true;
        quote = "";
      }

      continue;
    }

    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      in_tag = false;
      boundary = index + 1;
    }
  }

  return boundary;
}

export function strip_html_tags_bounded(
  html: string,
  min_chars: number,
): string {
  if (!html || typeof html !== "string") return "";
  if (html.length <= BOUNDED_STRIP_STEPS[0]) return strip_html_tags(html);

  for (const step of BOUNDED_STRIP_STEPS) {
    if (step * 2 >= html.length) break;

    const boundary = last_tag_boundary(html, step);

    if (boundary <= 0) continue;

    const text = strip_html_tags(html.slice(0, boundary));

    if (text.length >= min_chars + BOUNDED_STRIP_MARGIN) return text;
  }

  return strip_html_tags(html);
}

const CDATA_OPEN = "<![CDATA[";

const CDATA_CLOSE = "]]>";

export function strip_cdata_sections(html: string): string {
  let start = html.indexOf(CDATA_OPEN);

  if (start === -1) return html;

  let result = "";
  let cursor = 0;

  while (start !== -1) {
    const end = html.indexOf(CDATA_CLOSE, start + CDATA_OPEN.length);

    if (end === -1) break;

    result += html.slice(cursor, start);
    cursor = end + CDATA_CLOSE.length;
    start = html.indexOf(CDATA_OPEN, cursor);
  }

  return result + html.slice(cursor);
}

export function ascii_lower(value: string): string {
  return value.replace(/[A-Z]+/g, (run) => run.toLowerCase());
}

export function is_ascii_word_code(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

export function next_char_table(
  value: string,
  predicate: (code: number) => boolean,
): Int32Array {
  const table = new Int32Array(value.length + 1);
  let next = -1;

  table[value.length] = -1;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (predicate(value.charCodeAt(index))) next = index;
    table[index] = next;
  }

  return table;
}

export function next_hit_table(
  length: number,
  is_hit: (index: number) => boolean,
): Int32Array {
  const table = new Int32Array(length + 1);
  let next = -1;

  table[length] = -1;

  for (let index = length - 1; index >= 0; index -= 1) {
    if (is_hit(index)) next = index;
    table[index] = next;
  }

  return table;
}

export function next_needle_table(haystack: string, needle: string): Int32Array {
  const table = new Int32Array(haystack.length + 1).fill(-1);
  let filled = 0;

  for (
    let found = haystack.indexOf(needle);
    found !== -1;
    found = haystack.indexOf(needle, found + 1)
  ) {
    table.fill(found, filled, found + 1);
    filled = found + 1;
  }

  return table;
}

export function table_lookup(table: Int32Array, index: number): number {
  return index < table.length ? table[index] : -1;
}

export interface PairedElementMatch {
  start: number;
  content_start: number;
  content_end: number;
  end: number;
  name_index: number;
}

export interface PairedElementOptions {
  word_boundary: boolean;
  open_tag: boolean;
}

export function find_paired_elements(
  html: string,
  names: readonly string[],
  options: PairedElementOptions,
): PairedElementMatch[] {
  const matches: PairedElementMatch[] = [];
  const lower = ascii_lower(html);
  let index = lower.indexOf("<");

  if (index === -1) return matches;

  const next_gt = options.open_tag
    ? next_char_table(html, (code) => code === 62)
    : null;
  const closers = names.map((name) => next_needle_table(lower, `</${name}>`));

  while (index !== -1) {
    let found: PairedElementMatch | null = null;

    for (let name_index = 0; name_index < names.length; name_index += 1) {
      const name = names[name_index];

      if (!lower.startsWith(name, index + 1)) continue;

      const name_end = index + 1 + name.length;

      if (
        options.word_boundary &&
        name_end < html.length &&
        is_ascii_word_code(html.charCodeAt(name_end))
      ) {
        continue;
      }

      let content_start = name_end;

      if (next_gt) {
        const gt = table_lookup(next_gt, name_end);

        if (gt === -1) continue;

        content_start = gt + 1;
      }

      const close = table_lookup(closers[name_index], content_start);

      if (close === -1) continue;

      found = {
        start: index,
        content_start,
        content_end: close,
        end: close + name.length + 3,
        name_index,
      };
      break;
    }

    if (found) {
      matches.push(found);
      index = lower.indexOf("<", found.end);
    } else {
      index = lower.indexOf("<", index + 1);
    }
  }

  return matches;
}

export function replace_matched_ranges<T extends { start: number; end: number }>(
  value: string,
  matches: readonly T[],
  replacer: (match: T) => string,
): string {
  if (matches.length === 0) return value;

  let result = "";
  let cursor = 0;

  for (const match of matches) {
    result += value.slice(cursor, match.start) + replacer(match);
    cursor = match.end;
  }

  return result + value.slice(cursor);
}

export function strip_html_tags(html: string): string {
  if (!html || typeof html !== "string") return "";

  if (typeof DOMParser === "undefined") return "";

  let doc: Document;

  try {
    doc = new DOMParser().parseFromString(
      repair_comment_markup(strip_cdata_sections(html)),
      "text/html",
    );
  } catch {
    return "";
  }

  doc
    .querySelectorAll(
      "script, style, head, title, noscript, template, iframe, object, embed, xml",
    )
    .forEach((el) => el.remove());

  doc.querySelectorAll("br").forEach((el) => {
    el.replaceWith(doc.createTextNode(" "));
  });

  doc
    .querySelectorAll("p, div, li, td, tr, h1, h2, h3, h4, h5, h6")
    .forEach((el) => {
      el.append(doc.createTextNode(" "));
    });

  const text = doc.body?.textContent || "";

  return unwrap_markdown_links(text).replace(/\s+/g, " ").trim();
}

export function quotable_source(message: {
  body?: string;
  html_content?: string;
}): string {
  return message.html_content || message.body || "";
}

const CSS_AT_RULE_NAMES = new Set([
  "charset",
  "container",
  "counter-style",
  "document",
  "font-face",
  "font-feature-values",
  "import",
  "keyframes",
  "layer",
  "media",
  "namespace",
  "page",
  "property",
  "supports",
  "viewport",
]);

const CSS_STATEMENT_AT_RULE_NAMES = new Set([
  "charset",
  "import",
  "layer",
  "namespace",
]);

const CSS_AT_RULE_NAME_PATTERN = /@(?:-[a-z]+-)?([a-z][a-z-]*)/iy;

const CSS_SELECTOR_TOKEN_PATTERN =
  /^([a-z][a-z0-9]*|\*)?((?:[.#][\w-]+|\[[^\]]*\]|::?[a-z-]+(?:\([^)]*\))?)*)$/i;

const CSS_TYPE_SELECTORS = new Set([
  "*",
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "b",
  "big",
  "blockquote",
  "body",
  "br",
  "button",
  "caption",
  "center",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "font",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "label",
  "li",
  "main",
  "mark",
  "nav",
  "ol",
  "p",
  "picture",
  "pre",
  "s",
  "section",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "svg",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "video",
]);

function is_css_selector_token(token: string): boolean {
  const match = CSS_SELECTOR_TOKEN_PATTERN.exec(token);

  if (!match) return false;

  const type_selector = match[1]?.toLowerCase();
  const qualifiers = match[2] ?? "";

  if (!type_selector) return qualifiers.length > 0;

  return CSS_TYPE_SELECTORS.has(type_selector);
}

const CSS_DECLARATION_PATTERN = /^(-{0,2}[a-z][a-z0-9_-]*)\s*:[^;{}]*$/i;

const CSS_SINGLE_WORD_PROPERTIES = new Set([
  "background",
  "border",
  "bottom",
  "clear",
  "clip",
  "color",
  "content",
  "cursor",
  "direction",
  "display",
  "filter",
  "flex",
  "float",
  "font",
  "gap",
  "grid",
  "height",
  "left",
  "margin",
  "opacity",
  "outline",
  "overflow",
  "padding",
  "position",
  "right",
  "src",
  "top",
  "transform",
  "transition",
  "visibility",
  "width",
  "zoom",
]);

const CSS_LEADING_NOISE_PATTERN = /\s+|<!--|--!?>|\/\*[\s\S]*?\*\//y;

const CSS_SELECTOR_LIMIT = 512;

const CSS_BLOCK_LIMIT = 8192;

const CSS_SCAN_LIMIT = 131072;

function is_css_selector(selector: string): boolean {
  const trimmed = selector.trim();

  if (!trimmed) return false;

  return trimmed.split(",").every((part) => {
    const tokens = part
      .trim()
      .split(/\s*[>+~]\s*|\s+/)
      .filter(Boolean);

    return (
      tokens.length > 0 &&
      tokens.every(is_css_selector_token)
    );
  });
}

function is_css_declaration_block(block: string): boolean {
  const declarations = block
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean);

  return (
    declarations.length > 0 &&
    declarations.every((declaration) => {
      const match = CSS_DECLARATION_PATTERN.exec(declaration);

      if (!match) return false;

      const property = match[1].toLowerCase();

      return property.includes("-") || CSS_SINGLE_WORD_PROPERTIES.has(property);
    })
  );
}

function skip_css_at_rule(text: string, start: number): number {
  CSS_AT_RULE_NAME_PATTERN.lastIndex = start;
  const name = CSS_AT_RULE_NAME_PATTERN.exec(text);

  if (!name) return -1;

  const rule_name = name[1].toLowerCase();

  if (!CSS_AT_RULE_NAMES.has(rule_name)) return -1;

  const semicolon = text.indexOf(";", start);
  const open = text.indexOf("{", start);

  if (semicolon !== -1 && (open === -1 || semicolon < open)) {
    if (!CSS_STATEMENT_AT_RULE_NAMES.has(rule_name)) return -1;

    return semicolon - start <= CSS_SELECTOR_LIMIT ? semicolon + 1 : -1;
  }

  if (open === -1 || open - start > CSS_SELECTOR_LIMIT) return -1;

  const limit = Math.min(text.length, start + CSS_SCAN_LIMIT);
  let depth = 0;

  for (let index = open; index < limit; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;

      if (depth === 0) return index + 1;
    }
  }

  return -1;
}

function skip_css_rule(
  text: string,
  start: number,
  allow_empty_block: boolean,
): number {
  const open = text.indexOf("{", start);

  if (open === -1 || open - start > CSS_SELECTOR_LIMIT) return -1;

  const close = text.indexOf("}", open + 1);

  if (close === -1 || close - open > CSS_BLOCK_LIMIT) return -1;

  const block = text.slice(open + 1, close);

  if (block.includes("{")) return -1;
  if (!is_css_selector(text.slice(start, open))) return -1;

  if (!block.trim()) return allow_empty_block ? close + 1 : -1;

  return is_css_declaration_block(block) ? close + 1 : -1;
}

export function strip_leading_css_rules(text: string): string {
  if (!text || typeof text !== "string") return "";

  let cursor = 0;
  let kept_from = 0;

  while (cursor < text.length && cursor < CSS_SCAN_LIMIT) {
    CSS_LEADING_NOISE_PATTERN.lastIndex = cursor;

    if (CSS_LEADING_NOISE_PATTERN.exec(text)) {
      cursor = CSS_LEADING_NOISE_PATTERN.lastIndex;

      if (kept_from > 0) kept_from = cursor;

      continue;
    }

    const end =
      text[cursor] === "@"
        ? skip_css_at_rule(text, cursor)
        : skip_css_rule(text, cursor, kept_from > 0);

    if (end === -1) break;

    cursor = end;
    kept_from = end;
  }

  return kept_from === 0 ? text : text.slice(kept_from).trimStart();
}

export function has_leading_css_rules(text: string): boolean {
  return !!text && strip_leading_css_rules(text) !== text;
}

export function preview_body_source(
  body_text: string | undefined,
  body_html: string | undefined,
): string {
  const text = body_text ?? "";
  const html = body_html ?? "";

  if (text && html && has_leading_css_rules(text)) return html;

  return text || html;
}

export function html_to_preview_text(source: string, min_chars: number): string {
  return strip_leading_css_rules(strip_html_tags_bounded(source, min_chars));
}
