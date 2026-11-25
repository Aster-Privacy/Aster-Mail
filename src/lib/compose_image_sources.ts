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
import type { SanitizeOptions } from "@/lib/html_sanitizer";

import { get_image_proxy_url } from "@/lib/image_proxy";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import {
  is_remote_url_value,
  normalize_url_value,
  to_absolute_remote_url,
} from "@/lib/url_value";
import {
  ascii_lower,
  is_ascii_word_code,
  next_char_table,
  next_hit_table,
  table_lookup,
} from "@/lib/html_text";
import { is_js_whitespace } from "@/lib/linear_trim";

const PROXY_PATH_SUFFIX = "/api/images/v1/proxy";
const PARSE_BASE = "https://compose.invalid/";

export type ImageSourceReplacer = (
  match: string,
  prefix: string,
  raw_src: string,
  suffix: string,
) => string;

export function replace_image_sources(
  html: string,
  replacer: ImageSourceReplacer,
): string {
  const lower = ascii_lower(html);
  let start = lower.indexOf("<img");

  if (start === -1) return html;

  const next_gt = next_char_table(html, (code) => code === 62);
  const next_quote = next_char_table(html, (code) => code === 34);
  const next_src = next_hit_table(
    html.length,
    (index) =>
      is_js_whitespace(html.charCodeAt(index)) &&
      lower.startsWith('src="', index + 1),
  );
  let result = "";
  let cursor = 0;

  while (start !== -1) {
    const name_end = start + 4;
    let end = -1;

    if (
      name_end >= html.length ||
      !is_ascii_word_code(html.charCodeAt(name_end))
    ) {
      const src = table_lookup(next_src, name_end);
      const gt = table_lookup(next_gt, name_end);

      if (src !== -1 && (gt === -1 || src < gt)) {
        const value_start = src + 6;
        const close = table_lookup(next_quote, value_start);

        if (close !== -1) {
          result +=
            html.slice(cursor, start) +
            replacer(
              html.slice(start, close + 1),
              html.slice(start, value_start),
              html.slice(value_start, close),
              '"',
            );
          end = close + 1;
          cursor = end;
        }
      }
    }

    start = lower.indexOf("<img", end === -1 ? start + 1 : end);
  }

  return cursor === 0 ? html : result + html.slice(cursor);
}

export function get_compose_sanitize_options(): SanitizeOptions {
  const lockdown_mode = is_any_lockdown_active();

  return {
    external_content_mode: lockdown_mode ? "never" : "always",
    lockdown_mode,
    image_proxy_url: get_image_proxy_url(),
  };
}

function decode_attribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function encode_attribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

export function get_original_image_source(src: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(normalize_url_value(src), PARSE_BASE);
  } catch {
    return null;
  }

  if (!parsed.pathname.endsWith(PROXY_PATH_SUFFIX)) return null;

  const original = normalize_url_value(parsed.searchParams.get("url") ?? "");

  if (!/^https?:\/\//i.test(original)) return null;

  return original;
}

export function proxy_compose_image_sources(html: string): string {
  if (!html || !/<img\b/i.test(html)) return html;

  const proxy_url = get_image_proxy_url();

  return replace_image_sources(
    html,
    (match: string, prefix: string, raw_src: string, suffix: string) => {
      const src = normalize_url_value(decode_attribute(raw_src));

      if (!is_remote_url_value(src)) return match;
      if (get_original_image_source(src) !== null) return match;

      const proxied = `${proxy_url}?url=${encodeURIComponent(to_absolute_remote_url(src))}`;

      return `${prefix}${encode_attribute(proxied)}${suffix}`;
    },
  );
}

export function restore_compose_image_sources(html: string): string {
  if (!html || !html.includes(PROXY_PATH_SUFFIX)) return html;

  return replace_image_sources(
    html,
    (match: string, prefix: string, raw_src: string, suffix: string) => {
      const original = get_original_image_source(decode_attribute(raw_src));

      if (original === null) return match;

      return `${prefix}${encode_attribute(original)}${suffix}`;
    },
  );
}
