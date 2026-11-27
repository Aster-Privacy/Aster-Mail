//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import {
  DANGEROUS_URL_SCHEMES,
  ALLOWED_DATA_URL_TYPES,
  TRACKING_PIXEL_PATTERNS,
  TRACKING_PIXEL_URL_PATTERNS,
  TRACKING_PARAMS,
  ALLOWED_ATTRIBUTES,
  ascii_ci_at,
  index_of_ascii_ci,
  skip_js_whitespace,
  word_boundary_after,
} from "./html_sanitizer_constants";
import { sanitize_style } from "./html_sanitizer_css";
import { is_js_whitespace, trim_end_while } from "./linear_trim";

const LOCAL_IMAGE_SOURCE_PATTERN = /^\s*(?:cid:|data:|blob:|aster:)/i;

const HIDDEN_STYLE_PATTERN =
  /(?:^|[;{\s])(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\s*(?:;|!|$))/i;

export function is_tracker_url(url: string): boolean {
  if (!url || LOCAL_IMAGE_SOURCE_PATTERN.test(url)) return false;

  return TRACKING_PIXEL_URL_PATTERNS.some((p) => p.test(url));
}

function is_hidden_image(img: HTMLImageElement, style: string): boolean {
  return img.hasAttribute("hidden") || HIDDEN_STYLE_PATTERN.test(style);
}

export const is_tracking_pixel = (img: HTMLImageElement): boolean => {
  const width = img.getAttribute("width");
  const height = img.getAttribute("height");
  const style = img.getAttribute("style") || "";
  const src = img.getAttribute("src") || "";

  if (LOCAL_IMAGE_SOURCE_PATTERN.test(src)) return false;

  if ((width === "1" || width === "0") && (height === "1" || height === "0"))
    return true;

  if (
    (width === "1" || width === "0" || height === "1" || height === "0") &&
    !img.getAttribute("alt")
  )
    return true;

  if (TRACKING_PIXEL_PATTERNS.every((p) => p.test(style))) return true;

  if (
    TRACKING_PIXEL_PATTERNS.some((p) => p.test(style)) &&
    !img.getAttribute("alt")
  )
    return true;

  if (src && !looks_like_content_image(img) && is_tracker_url(src)) return true;

  if (src && is_hidden_image(img, style) && !looks_like_content_image(img))
    return true;

  return false;
};

const MAX_PIXEL_DIMENSION = 4;

function declared_dimension(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number.parseInt(value.trim(), 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function style_dimension(style: string, property: string): number | null {
  const pattern = new RegExp(
    "(?:^|[;{\\s])" +
      property +
      "\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(px|%|em|rem)?",
    "i",
  );
  const match = pattern.exec(style);

  if (!match) return null;

  const value = Number.parseFloat(match[1]);

  if (!Number.isFinite(value)) return null;

  const unit = (match[2] || "px").toLowerCase();

  if (unit === "%") return value > 5 ? MAX_PIXEL_DIMENSION + 1 : 0;

  if (unit === "em" || unit === "rem") return value * 16;

  return value;
}

function looks_like_content_image(img: HTMLImageElement): boolean {
  if ((img.getAttribute("alt") || "").trim().length > 0) return true;

  const width = declared_dimension(img.getAttribute("width"));
  const height = declared_dimension(img.getAttribute("height"));

  if (width !== null && width > MAX_PIXEL_DIMENSION) return true;
  if (height !== null && height > MAX_PIXEL_DIMENSION) return true;

  const style = img.getAttribute("style") || "";

  if (style) {
    const style_width = style_dimension(style, "width");
    const style_height = style_dimension(style, "height");

    if (style_width !== null && style_width > MAX_PIXEL_DIMENSION) return true;
    if (style_height !== null && style_height > MAX_PIXEL_DIMENSION)
      return true;
  }

  return false;
}

export interface StripTrackingResult {
  url: string;
  removed: string[];
}

export function strip_tracking_params(url: string): StripTrackingResult {
  try {
    const parsed = new URL(url);
    const removed: string[] = [];

    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        removed.push(key);
        parsed.searchParams.delete(key);
      }
    }

    return {
      url: removed.length > 0 ? parsed.toString() : url,
      removed,
    };
  } catch {
    return { url, removed: [] };
  }
}

const SAFE_URL_SCHEMES = new Set([
  "http",
  "https",
  "mailto",
  "tel",
  "callto",
  "sms",
  "cid",
  "xmpp",
  "aster",
]);

export function is_safe_url(url: string): boolean {
  const trimmed = [...url]
    .filter((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f)
    .join("")
    .toLowerCase();

  for (const scheme of DANGEROUS_URL_SCHEMES) {
    if (trimmed.startsWith(scheme)) {
      return false;
    }
  }

  if (trimmed.startsWith("data:")) {
    for (const allowed_type of ALLOWED_DATA_URL_TYPES) {
      if (trimmed.startsWith(allowed_type)) {
        return true;
      }
    }

    return false;
  }

  const scheme_match = /^([a-z][a-z0-9+.\-]*):/i.exec(trimmed);

  if (scheme_match) {
    return SAFE_URL_SCHEMES.has(scheme_match[1].toLowerCase());
  }

  return true;
}

const SRCSET_WHITESPACE_CODES = new Set([32, 9, 10, 13, 12]);

function is_srcset_whitespace(character: string): boolean {
  return SRCSET_WHITESPACE_CODES.has(character.charCodeAt(0));
}

function is_comma_code(code: number): boolean {
  return code === 0x2c;
}

export function sanitize_srcset(value: string): string {
  const safe: string[] = [];
  let position = 0;

  while (position < value.length) {
    while (
      position < value.length &&
      (is_srcset_whitespace(value[position]) || value[position] === ",")
    ) {
      position += 1;
    }

    if (position >= value.length) break;

    const url_start = position;

    while (position < value.length && !is_srcset_whitespace(value[position])) {
      position += 1;
    }

    let url_part = value.slice(url_start, position);
    let descriptor = "";

    if (url_part.endsWith(",")) {
      url_part = trim_end_while(url_part, is_comma_code);
    } else {
      const descriptor_start = position;

      while (position < value.length && value[position] !== ",") {
        position += 1;
      }

      descriptor = value.slice(descriptor_start, position).trim();

      if (position < value.length) position += 1;
    }

    if (!url_part) continue;
    if (!is_safe_url(url_part)) continue;

    safe.push(descriptor ? `${url_part} ${descriptor}` : url_part);
  }

  return safe.join(", ");
}

export interface MarkupSpan {
  start: number;
  end: number;
}

export function find_conditional_open(
  html: string,
  from: number,
): MarkupSpan | null {
  let search = from;

  for (;;) {
    const start = html.indexOf("<!--", search);

    if (start === -1) return null;

    let position = skip_js_whitespace(html, start + 4);

    if (html.charCodeAt(position) !== 0x5b) {
      search = start + 1;
      continue;
    }

    position = skip_js_whitespace(html, position + 1);

    if (
      !ascii_ci_at(html, position, "if") ||
      !word_boundary_after(html, position + 2)
    ) {
      search = start + 1;
      continue;
    }

    const close = html.indexOf("]", position + 2);

    if (close === -1) return null;

    const after = skip_js_whitespace(html, close + 1);

    if (html.charCodeAt(after) === 0x3e) return { start, end: after + 1 };

    search = close + 1;
  }
}

export function revealed_open_tail_end(html: string, from: number): number {
  let position = skip_js_whitespace(html, from);

  if (html.startsWith("<!--", position)) {
    position += 4;
  } else if (html.startsWith("--", position)) {
    position += 2;
  } else {
    return -1;
  }

  position = skip_js_whitespace(html, position);

  if (html.charCodeAt(position) === 0x21) {
    position = skip_js_whitespace(html, position + 1);
  }

  return html.charCodeAt(position) === 0x3e ? position + 1 : -1;
}

function is_space_or_dash(code: number): boolean {
  return code === 0x2d || is_js_whitespace(code);
}

function skip_space_or_dash(html: string, index: number): number {
  let position = index;

  while (
    position < html.length &&
    is_space_or_dash(html.charCodeAt(position))
  ) {
    position += 1;
  }

  return position;
}

const ENDIF_MARKER = "<![endif]";

function leftover_endif_end(html: string, index: number): number {
  if (html.startsWith("<!--", index)) {
    const marker = skip_space_or_dash(html, index + 4);

    if (!ascii_ci_at(html, marker, ENDIF_MARKER)) return -1;

    const close = skip_space_or_dash(html, marker + ENDIF_MARKER.length);

    return html.charCodeAt(close) === 0x3e ? close + 1 : -1;
  }

  if (!ascii_ci_at(html, index, ENDIF_MARKER)) return -1;

  const dashes = skip_js_whitespace(html, index + ENDIF_MARKER.length);

  if (!html.startsWith("--", dashes)) return -1;

  const close = skip_js_whitespace(html, dashes + 2);

  return html.charCodeAt(close) === 0x3e ? close + 1 : -1;
}

export function strip_leftover_endif(html: string): string {
  let result = "";
  let copied = 0;
  let index = 0;

  while (index < html.length) {
    const marker = skip_js_whitespace(html, index);
    const end = leftover_endif_end(html, marker);

    if (end !== -1) {
      result += html.slice(copied, index);
      copied = end;
      index = end;
      continue;
    }

    index = marker + 1;
  }

  return copied === 0 ? html : result + html.slice(copied);
}

export function strip_mso_conditionals(html: string): string {
  if (html.indexOf("[if") === -1 && html.indexOf("[endif]") === -1) return html;

  let result = "";
  let cursor = 0;
  let search = 0;
  let comment_end = -2;

  for (
    let match = find_conditional_open(html, search);
    match !== null;
    match = find_conditional_open(html, search)
  ) {
    const start = match.start;

    search = match.end;

    if (start < cursor) continue;

    const after_open = match.end;
    const revealed_end = revealed_open_tail_end(html, after_open);

    result += html.slice(cursor, start);

    if (revealed_end !== -1) {
      cursor = revealed_end;
    } else {
      if (comment_end !== -1 && comment_end < after_open) {
        comment_end = html.indexOf("-->", after_open);
      }

      if (comment_end === -1) {
        cursor = after_open;
        search = cursor;
        continue;
      }

      cursor = comment_end + 3;
    }

    search = cursor;
  }

  result += html.slice(cursor);

  return strip_leftover_endif(result);
}

const COMMENT_END_REGEX = /--!?>/;
const ABRUPT_COMMENT_END_REGEX = /^-?>/;

export function neutralize_unterminated_comments(html: string): string {
  if (html.indexOf("<!--") === -1) return html;

  let result = "";
  let cursor = 0;

  for (;;) {
    const open = html.indexOf("<!--", cursor);

    if (open === -1) break;

    const rest = html.slice(open + 4);
    const abrupt = ABRUPT_COMMENT_END_REGEX.exec(rest);
    const end = abrupt ?? COMMENT_END_REGEX.exec(rest);

    if (!end) {
      result += html.slice(cursor, open);
      cursor = open + 4;
      break;
    }

    if (abrupt) {
      result += html.slice(cursor, open);
      cursor = open + 4 + abrupt[0].length;
      continue;
    }

    const close = open + 4 + end.index + end[0].length;

    result += html.slice(cursor, close);
    cursor = close;
  }

  return result + html.slice(cursor);
}

export function find_tag_open(
  html: string,
  name_lower: string,
  from: number,
): number {
  const needle = `<${name_lower}`;

  for (
    let start = index_of_ascii_ci(html, needle, from);
    start !== -1;
    start = index_of_ascii_ci(html, needle, start + 1)
  ) {
    if (word_boundary_after(html, start + needle.length)) return start;
  }

  return -1;
}

export function find_close_tag(
  html: string,
  name_lower: string,
  from: number,
): MarkupSpan | null {
  const needle = `</${name_lower}`;

  for (
    let start = index_of_ascii_ci(html, needle, from);
    start !== -1;
    start = index_of_ascii_ci(html, needle, start + 1)
  ) {
    const close = skip_js_whitespace(html, start + needle.length);

    if (html.charCodeAt(close) === 0x3e) return { start, end: close + 1 };
  }

  return null;
}

export function find_close_tag_end(
  html: string,
  name_lower: string,
  from: number,
): number {
  return find_close_tag(html, name_lower, from)?.end ?? -1;
}

const AMP_BOILERPLATE_NAMES = [
  "4email-boilerplate",
  "4ads-boilerplate",
  "-boilerplate",
];

function amp_boilerplate_end(html: string, index: number): number {
  if (!ascii_ci_at(html, index, "amp")) return -1;

  for (const name of AMP_BOILERPLATE_NAMES) {
    if (ascii_ci_at(html, index + 3, name)) {
      const end = index + 3 + name.length;

      if (word_boundary_after(html, end)) return end;
    }
  }

  return -1;
}

function has_amp_boilerplate_marker(
  html: string,
  from: number,
  end: number,
): boolean {
  for (let index = from; index < end; index += 1) {
    if (
      is_js_whitespace(html.charCodeAt(index)) &&
      amp_boilerplate_end(html, index + 1) !== -1
    ) {
      return true;
    }
  }

  return false;
}

export function strip_amp_boilerplate_styles(html: string): string {
  let result = "";
  let copied = 0;
  let from = 0;

  for (;;) {
    const start = find_tag_open(html, "style", from);

    if (start === -1) break;

    const tag_end = html.indexOf(">", start + 6);

    if (tag_end === -1) break;

    if (!has_amp_boilerplate_marker(html, start + 6, tag_end)) {
      from = tag_end + 1;
      continue;
    }

    const close_end = find_close_tag_end(html, "style", tag_end + 1);

    if (close_end === -1) break;

    result += html.slice(copied, start);
    copied = close_end;
    from = close_end;
  }

  return copied === 0 && from === 0 ? html : result + html.slice(copied);
}

const AMP_IMG_OPEN_RE = /<amp-img\b/gi;

const AMP_IMG_CLOSE_RE = /<\/amp-img\s*>/gi;

export function neutralize_amp_markup(html: string): string {
  if (!/amp/i.test(html)) return html;

  let previous: string;
  let result = html;

  do {
    previous = result;
    result = strip_amp_boilerplate_styles(result);
  } while (result !== previous);

  return result.replace(AMP_IMG_OPEN_RE, "<img").replace(AMP_IMG_CLOSE_RE, "");
}

export function repair_comment_markup(html: string): string {
  return neutralize_unterminated_comments(
    strip_mso_conditionals(neutralize_amp_markup(html)),
  );
}

function strip_attribute_markup(value: string): string {
  if (value.indexOf("<") === -1) return value;

  let previous: string;
  let result = value;

  do {
    previous = result;
    result = result.replace(/<[^>]*>?/g, "");
  } while (result !== previous);

  return result;
}

const IN_DOCUMENT_ANCHOR_PREFIX = "aster_anchor_";

function to_in_document_anchor(name: string): string {
  return name.startsWith(IN_DOCUMENT_ANCHOR_PREFIX)
    ? name
    : `${IN_DOCUMENT_ANCHOR_PREFIX}${name}`;
}

function in_document_anchor_attribute(
  attr_name: string,
  attr_value: string,
): string | null {
  const value = strip_attribute_markup(attr_value).trim();

  if (attr_name === "id" || attr_name === "name") {
    return value ? to_in_document_anchor(value) : null;
  }

  return value.length > 1 ? `#${to_in_document_anchor(value.slice(1))}` : value;
}

const IN_DOCUMENT_CLASSES = new Set([
  "aster_quote",
  "aster_quote_attr",
  "aster_quote_body",
]);

function keep_in_document_classes(value: string): string | null {
  const kept = value
    .split(/\s+/)
    .filter((name) => IN_DOCUMENT_CLASSES.has(name));

  return kept.length > 0 ? kept.join(" ") : null;
}

export function sanitize_attribute(
  tag_name: string,
  attr_name: string,
  attr_value: string,
  sandbox_mode: boolean,
  contained_layout = false,
): string | null {
  const lower_attr = attr_name.toLowerCase();
  const lower_tag = tag_name.toLowerCase();

  if (lower_attr.startsWith("on")) {
    return null;
  }

  const global_allowed = ALLOWED_ATTRIBUTES["*"];
  const tag_allowed = ALLOWED_ATTRIBUTES[lower_tag];

  const is_allowed =
    global_allowed?.has(lower_attr) || tag_allowed?.has(lower_attr);

  if (!is_allowed) {
    return null;
  }

  if (!sandbox_mode && (lower_attr === "id" || lower_attr === "name")) {
    return in_document_anchor_attribute(lower_attr, attr_value);
  }

  if (!sandbox_mode && lower_attr === "class") {
    return keep_in_document_classes(attr_value);
  }

  if (
    lower_attr === "href" ||
    lower_attr === "src" ||
    lower_attr === "cite" ||
    lower_attr === "background"
  ) {
    if (!is_safe_url(attr_value)) {
      return null;
    }

    if (
      !sandbox_mode &&
      lower_attr === "href" &&
      attr_value.trim().startsWith("#")
    ) {
      return in_document_anchor_attribute(lower_attr, attr_value);
    }
  }

  if (lower_attr === "srcset") {
    const cleaned = sanitize_srcset(attr_value);

    return cleaned ? cleaned : null;
  }

  if (lower_attr === "style") {
    return sanitize_style(attr_value, sandbox_mode, contained_layout);
  }

  if (lower_attr === "target") {
    return "_blank";
  }

  return strip_attribute_markup(attr_value);
}
