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

export const is_tracking_pixel = (img: HTMLImageElement): boolean => {
  const width = img.getAttribute("width");
  const height = img.getAttribute("height");
  const style = img.getAttribute("style") || "";
  const src = img.getAttribute("src") || "";

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

  if (src && TRACKING_PIXEL_URL_PATTERNS.some((p) => p.test(src))) return true;

  if (
    src &&
    !width &&
    !height &&
    !style &&
    !img.getAttribute("alt") &&
    !img.getAttribute("class")
  )
    return true;

  return false;
};

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
  const trimmed = [...url].filter((c) => c.charCodeAt(0) > 0x20 && c.charCodeAt(0) !== 0x7f).join("").toLowerCase();

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

export function sanitize_srcset(value: string): string {
  const parts = value.split(",");
  const safe: string[] = [];

  for (const raw of parts) {
    const candidate = raw.trim();
    if (!candidate) continue;

    const space_idx = candidate.search(/\s/);
    const url_part =
      space_idx === -1 ? candidate : candidate.slice(0, space_idx);
    const descriptor =
      space_idx === -1 ? "" : candidate.slice(space_idx).trim();

    if (!url_part) continue;
    if (url_part.toLowerCase().startsWith("data:")) continue;
    if (!is_safe_url(url_part)) continue;

    safe.push(descriptor ? `${url_part} ${descriptor}` : url_part);
  }

  return safe.join(", ");
}

const CONDITIONAL_OPEN_REGEX = /<!--\s*\[\s*if\b[^\]]*\]\s*>/gi;
const REVEALED_OPEN_TAIL_REGEX = /^\s*(?:<!)?--\s*>/;
const LEFTOVER_ENDIF_REGEX = /\s*<!--(?:\s|-)*<!\[endif\](?:\s|-)*>|\s*<!\[endif\]\s*--\s*>/gi;

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
        result += match[0];
        cursor = after_open;
        continue;
      }

      cursor = comment_end + 3;
    }

    CONDITIONAL_OPEN_REGEX.lastIndex = cursor;
  }

  result += html.slice(cursor);

  return result.replace(LEFTOVER_ENDIF_REGEX, "");
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
