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
import {
  type ParsedAttribute,
  parse_tag,
  replace_markup_tags,
  replace_style_blocks,
} from "@/lib/compose_deferred_markup";
import { get_trusted_image_proxy_origins } from "@/lib/image_proxy_origins";
import { parse_srcset_candidates } from "@/lib/url_value";

const PROXY_PATH = "/api/images/v1/proxy";
const PARSE_BASE = "https://compose.invalid/";
const PARSE_BASE_ORIGIN = "https://compose.invalid";
const CSS_URL_UNSAFE = new Set([34, 39, 40, 41, 60, 62, 92]);
const RESTORED_URL_ATTRIBUTES = new Set([
  "src",
  "background",
  "poster",
  "data-proxy-src",
]);

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
    .replace(/&nbsp;/g, "\u00a0")
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

  if (parsed.pathname !== PROXY_PATH) return null;
  if (
    parsed.origin !== PARSE_BASE_ORIGIN &&
    !get_trusted_image_proxy_origins().has(parsed.origin)
  ) {
    return null;
  }

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

function encode_css_url(value: string): string {
  let result = "";

  for (const character of value) {
    const code = character.charCodeAt(0);

    result +=
      is_js_whitespace(code) || CSS_URL_UNSAFE.has(code)
        ? `%${code.toString(16).toUpperCase().padStart(2, "0")}`
        : character;
  }

  return result;
}

function encode_srcset_url(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const is_trailing_comma = code === 44 && index === value.length - 1;

    result +=
      is_js_whitespace(code) || is_trailing_comma
        ? `%${code.toString(16).toUpperCase().padStart(2, "0")}`
        : value.charAt(index);
  }

  return result;
}

function restore_css_urls(css: string): string {
  if (!css.includes(PROXY_PATH)) return css;

  const lower = ascii_lower(css);
  let result = "";
  let cursor = 0;
  let index = lower.indexOf("url(");

  while (index !== -1) {
    let value_start = index + 4;

    while (
      value_start < css.length &&
      is_js_whitespace(css.charCodeAt(value_start))
    ) {
      value_start += 1;
    }

    const quote = css.charAt(value_start);
    const is_quoted = quote === '"' || quote === "'";
    const raw_start = is_quoted ? value_start + 1 : value_start;
    const raw_end = css.indexOf(is_quoted ? quote : ")", raw_start);

    if (raw_end === -1) break;

    const raw = css.slice(raw_start, raw_end);
    const original = get_original_image_source(raw);

    if (original !== null) {
      result += css.slice(cursor, raw_start) + encode_css_url(original);
      cursor = is_quoted ? raw_end : raw_start + raw.trimEnd().length;
    }

    index = lower.indexOf("url(", raw_end + 1);
  }

  return cursor === 0 ? css : result + css.slice(cursor);
}

function decode_style_attribute(value: string): string {
  return value.replace(
    /&(amp|quot|lt|gt|nbsp|#39|apos);/g,
    (_match: string, name: string) => {
      if (name === "amp") return "&";
      if (name === "quot") return '"';
      if (name === "lt") return "<";
      if (name === "gt") return ">";
      if (name === "nbsp") return "\u00a0";

      return "'";
    },
  );
}

function encode_style_attribute(value: string): string {
  return encode_attribute(value).replace(/\u00a0/g, "&nbsp;");
}

function unquote_attribute(raw_value: string): string {
  const first = raw_value.charAt(0);

  return (first === '"' || first === "'") && raw_value.length >= 2
    ? raw_value.slice(1, -1)
    : raw_value;
}

function restore_attribute_value(attribute: ParsedAttribute): string | null {
  if (attribute.raw_value === null) return null;
  if (!attribute.raw_value.includes(PROXY_PATH)) return null;

  const value = unquote_attribute(attribute.raw_value);

  if (RESTORED_URL_ATTRIBUTES.has(attribute.name)) {
    const original = get_original_image_source(decode_attribute(value));

    return original === null ? null : encode_attribute(original);
  }

  if (attribute.name === "srcset") {
    const candidates = parse_srcset_candidates(decode_attribute(value));
    let changed = false;
    const restored = candidates.map((candidate) => {
      const original = get_original_image_source(candidate.url);

      if (original === null) return candidate;
      changed = true;

      return { ...candidate, url: encode_srcset_url(original) };
    });

    if (!changed) return null;

    return encode_attribute(
      restored
        .map((candidate) =>
          candidate.descriptor
            ? `${candidate.url} ${candidate.descriptor}`
            : candidate.url,
        )
        .join(", "),
    );
  }

  if (attribute.name === "style") {
    const css = decode_style_attribute(value);
    const restored = restore_css_urls(css);

    return restored === css ? null : encode_style_attribute(restored);
  }

  return null;
}

function restore_tag_sources(tag: string): string {
  if (!tag.includes(PROXY_PATH)) return tag;

  const parsed = parse_tag(tag);

  if (!parsed) return tag;

  let changed = false;
  const texts = parsed.attributes.map((attribute) => {
    const restored = restore_attribute_value(attribute);

    if (restored === null || attribute.raw_value === null) {
      return attribute.text;
    }

    changed = true;

    return `${attribute.text.slice(0, attribute.text.length - attribute.raw_value.length)}"${restored}"`;
  });

  return changed ? parsed.head + texts.join("") + parsed.tail : tag;
}

export function restore_compose_image_sources(html: string): string {
  if (!html || !html.includes(PROXY_PATH)) return html;

  const styled = replace_style_blocks(html, (parts) => {
    const css = restore_css_urls(parts.css);

    return css === parts.css ? parts.match : parts.open + css + parts.close;
  });

  return replace_markup_tags(styled, restore_tag_sources);
}
