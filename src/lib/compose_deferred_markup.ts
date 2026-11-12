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
const DEFERRED_PREFIX = "data-aster-deferred-";
const DEFERRED_NAMES = new Set(["src", "srcset", "background", "poster"]);
const TAG_PATTERN = /<[a-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const TAG_HEAD_PATTERN = /^<[^\s/>]+/;
const ATTRIBUTE_PATTERN =
  /\s+([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;
const ATTRIBUTE_NAME_PATTERN = /^(\s+)[^\s"'>/=]+/;
const STYLE_BLOCK_PATTERN =
  /(<style\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/style>)/gi;
const PLAIN_CSS_URL_PATTERN = /(url\(")([^"\\\s]+)("\))/g;
const ENCODED_CSS_URL_PATTERN =
  /(url\(&quot;)((?:(?!&quot;)[^"\\\s])+)(&quot;\))/g;
const PAYLOAD_CLASS = "[A-Za-z0-9%._-]+";

export const COMPOSE_DEFERRED_SRC_ATTRIBUTE = `${DEFERRED_PREFIX}src`;
export const COMPOSE_DEFERRED_BACKGROUND_ATTRIBUTE = `${DEFERRED_PREFIX}background`;
export const COMPOSE_IMAGE_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export type ComposeDeferPredicate = (name: string, value: string) => boolean;

export interface ComposeCssPlaceholder {
  marker: string;
  value: string;
}

interface ParsedAttribute {
  name: string;
  text: string;
  raw_value: string | null;
}

interface ParsedTag {
  head: string;
  attributes: ParsedAttribute[];
  tail: string;
}

function create_marker_token(): string {
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function escape_pattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MARKER_PREFIX = `#aster-compose-${create_marker_token()}:`;
const SHOWN_MARKER_PATTERN = new RegExp(
  `(?:data|blob):[^"'()\\s#&<>]*${MARKER_PREFIX}(${PAYLOAD_CLASS})`,
  "g",
);
const PLACEHOLDER_MARKER_PATTERN = new RegExp(
  `${escape_pattern(COMPOSE_IMAGE_PLACEHOLDER)}${MARKER_PREFIX}(${PAYLOAD_CLASS})`,
  "g",
);

export const COMPOSE_CSS_MARKER_FRAGMENT = MARKER_PREFIX.slice(0, -1);

function decode_entities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function encode_payload(value: string): string | null {
  try {
    return encodeURIComponent(value).replace(
      /[!'()*~]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  } catch {
    return null;
  }
}

function decode_payload(payload: string): string | null {
  try {
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function parse_tag(tag: string): ParsedTag | null {
  const head = TAG_HEAD_PATTERN.exec(tag);

  if (!head) return null;

  const attributes: ParsedAttribute[] = [];
  let position = head[0].length;

  ATTRIBUTE_PATTERN.lastIndex = position;

  for (
    let match = ATTRIBUTE_PATTERN.exec(tag);
    match;
    match = ATTRIBUTE_PATTERN.exec(tag)
  ) {
    attributes.push({
      name: match[1].toLowerCase(),
      text: match[0],
      raw_value: match[2] ?? null,
    });
    position = ATTRIBUTE_PATTERN.lastIndex;
  }

  return { head: head[0], attributes, tail: tag.slice(position) };
}

function unquote(raw_value: string): string {
  const first = raw_value.charAt(0);

  return first === '"' || first === "'" ? raw_value.slice(1, -1) : raw_value;
}

function rename_attribute(text: string, name: string): string {
  return text.replace(
    ATTRIBUTE_NAME_PATTERN,
    (_match: string, space: string) => `${space}${name}`,
  );
}

function defer_css(
  css: string,
  pattern: RegExp,
  encoded: boolean,
  is_deferrable: ComposeDeferPredicate,
): string {
  if (!css.includes("url(")) return css;

  return css.replace(
    pattern,
    (match: string, open: string, raw: string, close: string) => {
      if (!is_deferrable("css", encoded ? decode_entities(raw) : raw)) {
        return match;
      }

      const payload = encode_payload(raw);

      if (payload === null) return match;

      return `${open}${COMPOSE_IMAGE_PLACEHOLDER}${MARKER_PREFIX}${payload}${close}`;
    },
  );
}

function defer_style_attribute(
  text: string,
  is_deferrable: ComposeDeferPredicate,
): string {
  return defer_css(
    defer_css(text, ENCODED_CSS_URL_PATTERN, true, is_deferrable),
    PLAIN_CSS_URL_PATTERN,
    true,
    is_deferrable,
  );
}

function defer_tag(tag: string, is_deferrable: ComposeDeferPredicate): string {
  const parsed = parse_tag(tag);

  if (!parsed) return tag;

  const is_image = parsed.head.toLowerCase() === "<img";
  const deferred_names = new Set<string>();
  let changed = false;

  const rewritten = parsed.attributes.map((attribute) => {
    if (attribute.raw_value === null) return attribute;

    if (attribute.name === "style") {
      const text = defer_style_attribute(attribute.text, is_deferrable);

      if (text === attribute.text) return attribute;
      changed = true;

      return { ...attribute, text };
    }

    if (!DEFERRED_NAMES.has(attribute.name)) return attribute;
    if (
      !is_deferrable(
        attribute.name,
        decode_entities(unquote(attribute.raw_value)),
      )
    ) {
      return attribute;
    }

    changed = true;
    deferred_names.add(`${DEFERRED_PREFIX}${attribute.name}`);

    const renamed = rename_attribute(
      attribute.text,
      `${DEFERRED_PREFIX}${attribute.name}`,
    );

    return {
      ...attribute,
      name: "",
      text:
        is_image && attribute.name === "src"
          ? `${renamed} src="${COMPOSE_IMAGE_PLACEHOLDER}"`
          : renamed,
    };
  });

  if (!changed) return tag;

  return (
    parsed.head +
    rewritten
      .filter((attribute) => !deferred_names.has(attribute.name))
      .map((attribute) => attribute.text)
      .join("") +
    parsed.tail
  );
}

function restore_tag(tag: string): string {
  if (!tag.toLowerCase().includes(DEFERRED_PREFIX)) return tag;

  const parsed = parse_tag(tag);

  if (!parsed) return tag;

  const restored_names = new Set(
    parsed.attributes
      .filter((attribute) => attribute.name.startsWith(DEFERRED_PREFIX))
      .map((attribute) => attribute.name.slice(DEFERRED_PREFIX.length)),
  );

  if (restored_names.size === 0) return tag;

  const seen = new Set<string>();
  const kept = parsed.attributes.flatMap((attribute) => {
    if (attribute.name.startsWith(DEFERRED_PREFIX)) {
      const name = attribute.name.slice(DEFERRED_PREFIX.length);

      if (seen.has(name)) return [];
      seen.add(name);

      return [rename_attribute(attribute.text, name)];
    }
    if (restored_names.has(attribute.name)) return [];

    return [attribute.text];
  });

  return parsed.head + kept.join("") + parsed.tail;
}

export function defer_compose_markup(
  html: string,
  is_deferrable: ComposeDeferPredicate,
): string {
  if (!html) return html;

  return html
    .replace(
      STYLE_BLOCK_PATTERN,
      (_match: string, open: string, css: string, close: string) =>
        open +
        defer_css(css, PLAIN_CSS_URL_PATTERN, false, is_deferrable) +
        close,
    )
    .replace(TAG_PATTERN, (tag: string) => defer_tag(tag, is_deferrable));
}

export function restore_deferred_compose_images(html: string): string {
  if (!html) return html;

  const has_attributes = html.toLowerCase().includes(DEFERRED_PREFIX);
  const has_markers = html.includes(COMPOSE_CSS_MARKER_FRAGMENT);

  if (!has_attributes && !has_markers) return html;

  const restored = has_attributes
    ? html.replace(TAG_PATTERN, restore_tag)
    : html;

  if (!has_markers) return restored;

  return restored.replace(
    SHOWN_MARKER_PATTERN,
    (match: string, payload: string) => decode_payload(payload) ?? match,
  );
}

export function compose_css_placeholders(
  css: string,
  encoded: boolean,
): ComposeCssPlaceholder[] {
  if (!css.includes(COMPOSE_CSS_MARKER_FRAGMENT)) return [];

  const found: ComposeCssPlaceholder[] = [];

  for (const match of css.matchAll(PLACEHOLDER_MARKER_PATTERN)) {
    const decoded = decode_payload(match[1]);

    if (decoded === null) continue;

    found.push({
      marker: match[0],
      value: encoded ? decode_entities(decoded) : decoded,
    });
  }

  return found;
}

export function show_compose_css_image(
  css: string,
  marker: string,
  url: string,
): string {
  if (!css.includes(marker)) return css;

  const shown = url + marker.slice(COMPOSE_IMAGE_PLACEHOLDER.length);

  return css.split(marker).join(shown);
}

export function hide_compose_css_images(css: string): string {
  if (!css.includes(COMPOSE_CSS_MARKER_FRAGMENT)) return css;

  return css.replace(
    SHOWN_MARKER_PATTERN,
    (_match: string, payload: string) =>
      `${COMPOSE_IMAGE_PLACEHOLDER}${MARKER_PREFIX}${payload}`,
  );
}
