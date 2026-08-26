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
} from "./html_sanitizer_constants";
import { sanitize_style } from "./html_sanitizer_css";

const LOCAL_IMAGE_SOURCE_PATTERN = /^\s*(?:cid:|data:|blob:|aster:)/i;

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

  if (
    src &&
    !looks_like_content_image(img) &&
    TRACKING_PIXEL_URL_PATTERNS.some((p) => p.test(src))
  )
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
      url_part = url_part.replace(/,+$/, "");
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

const CONDITIONAL_OPEN_REGEX = /<!--\s*\[\s*if\b[^\]]*\]\s*>/gi;
const REVEALED_OPEN_TAIL_REGEX = /^\s*(?:<!)?--\s*!?\s*>/;
const LEFTOVER_ENDIF_REGEX =
  /\s*<!--(?:\s|-)*<!\[endif\](?:\s|-)*>|\s*<!\[endif\]\s*--\s*>/gi;

export function strip_mso_conditionals(html: string): string {
  if (html.indexOf("[if") === -1 && html.indexOf("[endif]") === -1) return html;

  let result = "";
  let cursor = 0;

  CONDITIONAL_OPEN_REGEX.lastIndex = 0;

  for (
    let match = CONDITIONAL_OPEN_REGEX.exec(html);
    match !== null;
    match = CONDITIONAL_OPEN_REGEX.exec(html)
  ) {
    const start = match.index;

    if (start < cursor) continue;

    const after_open = start + match[0].length;
    const revealed = REVEALED_OPEN_TAIL_REGEX.exec(html.slice(after_open));

    result += html.slice(cursor, start);

    if (revealed) {
      cursor = after_open + revealed[0].length;
    } else {
      const comment_end = html.indexOf("-->", after_open);

      if (comment_end === -1) {
        cursor = after_open;
        CONDITIONAL_OPEN_REGEX.lastIndex = cursor;
        continue;
      }

      cursor = comment_end + 3;
    }

    CONDITIONAL_OPEN_REGEX.lastIndex = cursor;
  }

  result += html.slice(cursor);

  return result.replace(LEFTOVER_ENDIF_REGEX, "");
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

export function repair_comment_markup(html: string): string {
  return neutralize_unterminated_comments(strip_mso_conditionals(html));
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

export function sanitize_attribute(
  tag_name: string,
  attr_name: string,
  attr_value: string,
  sandbox_mode: boolean,
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

  if (
    lower_attr === "href" ||
    lower_attr === "src" ||
    lower_attr === "cite" ||
    lower_attr === "background"
  ) {
    if (!is_safe_url(attr_value)) {
      return null;
    }
  }

  if (lower_attr === "srcset") {
    const cleaned = sanitize_srcset(attr_value);

    return cleaned ? cleaned : null;
  }

  if (lower_attr === "style") {
    return sanitize_style(attr_value, sandbox_mode);
  }

  if (lower_attr === "target") {
    return "_blank";
  }

  return strip_attribute_markup(attr_value);
}
