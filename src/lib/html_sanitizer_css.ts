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
  DANGEROUS_CSS_PATTERNS,
  MAX_CSS_PX,
  COMPOSE_ALLOWED_CSS_PROPERTIES,
  COMPOSE_ALLOWED_DISPLAY_VALUES,
  COMPOSE_ALLOWED_VERTICAL_ALIGN_VALUES,
} from "./html_sanitizer_constants";

const TRANSPARENT_COLOR_VALUE_RE =
  /^(?:transparent|inherit|initial|unset|revert|none|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)|rgba\(\s*\d+\s+\d+\s+\d+\s*\/\s*0(?:\.0+)?\s*\)|hsla?\(\s*[\d.]+(?:deg)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%\s*,\s*0(?:\.0+)?\s*\))$/i;

export function is_transparent_color_value(value: string): boolean {
  return TRANSPARENT_COLOR_VALUE_RE.test(value.trim());
}

export function strip_css_comments(css: string): string {
  if (css.indexOf("/*") === -1) return css;

  let result = "";
  let index = 0;
  let quote: string | null = null;

  while (index < css.length) {
    const char = css[index];

    if (quote) {
      result += char;

      if (char === "\\" && index + 1 < css.length) {
        result += css[index + 1];
        index += 2;
        continue;
      }

      if (char === quote) quote = null;
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      result += char;
      index++;
      continue;
    }

    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);

      index = end === -1 ? css.length : end + 2;
      result += " ";
      continue;
    }

    result += char;
    index++;
  }

  return result;
}

function decode_css_escapes(css: string): string {
  return css
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, hex) => {
      const cp = parseInt(hex, 16);

      if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) {
        return "�";
      }

      return String.fromCodePoint(cp);
    })
    .replace(/\\(.)/g, "$1");
}

export function decode_css_entities(raw: string): string {
  let decoded = raw;

  for (let i = 0; i < 3; i++) {
    const next = decoded
      .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/&#(\d+);?/g, (_m, dec) =>
        String.fromCharCode(parseInt(dec, 10)),
      )
      .replace(/&([a-z]+);/gi, (match, name) => {
        const map: Record<string, string> = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
          tab: "\t",
          newline: "\n",
        };

        return map[name.toLowerCase()] ?? match;
      });

    if (next === decoded) break;
    decoded = next;
  }

  return decoded;
}

export function cap_css_dimension(value: string): string {
  return value.replace(/:\s*(\d+(?:\.\d+)?)\s*px/gi, (_match, num) => {
    const capped = Math.min(parseFloat(num), MAX_CSS_PX);

    return `: ${capped}px`;
  });
}

export function escape_style_terminator(css: string): string {
  return css.replace(/<\/(style|script)/gi, "<\\/$1");
}

export interface StripCssUrlOptions {
  image_proxy_url?: string;
}

const SAFE_CSS_IMAGE_SOURCE = /^(?:cid:|data:image\/)/i;

const IMAGE_SET_HEAD = /(?:-webkit-)?image-set\s*\(/gi;

const CROSS_FADE_HEAD = /cross-fade\s*\(/gi;

function replace_balanced_calls(
  css: string,
  head: RegExp,
  transform: (whole: string, inner: string) => string,
): string {
  const pattern = new RegExp(head.source, head.flags);
  let result = "";
  let index = 0;
  let match;

  while ((match = pattern.exec(css)) !== null) {
    const start = match.index;
    let depth = 1;
    let i = start + match[0].length;

    while (i < css.length && depth > 0) {
      if (css[i] === "(") depth++;
      else if (css[i] === ")") depth--;
      i++;
    }

    if (depth > 0) {
      return result + css.slice(index, start) + "none";
    }

    const whole = css.slice(start, i);
    const inner = css.slice(start + match[0].length, i - 1);

    result += css.slice(index, start) + transform(whole, inner);
    index = i;
    pattern.lastIndex = i;
  }

  return result + css.slice(index);
}

function css_image_set_sources(inner: string): string[] {
  const sources: string[] = [];
  const url_pattern = /url\s*\(\s*(["']?)([^"')]*)\1\s*\)/gi;
  let match;

  while ((match = url_pattern.exec(inner)) !== null) {
    sources.push(match[2].trim());
  }

  const bare_pattern = /(["'])([^"']*)\1/g;
  const remainder = inner.replace(url_pattern, " ");

  while ((match = bare_pattern.exec(remainder)) !== null) {
    sources.push(match[2].trim());
  }

  return sources;
}

export function keep_embedded_image_sets(css: string): string {
  return replace_balanced_calls(css, IMAGE_SET_HEAD, (whole, inner) => {
    const sources = css_image_set_sources(inner);

    if (sources.length === 0) return "none";

    return sources.every((source) => SAFE_CSS_IMAGE_SOURCE.test(source))
      ? whole
      : "none";
  });
}

function drop_unsafe_call(whole: string, inner: string): string {
  if (/(?:^|[^a-z-])none(?:$|[^a-z-])/i.test(whole)) return "none";

  const sources = css_image_set_sources(inner);
  const bare_pattern = /(["'])([^"']*)\1/g;
  const remainder = inner.replace(/url\s*\([^)]*\)/gi, " ");
  let bare;

  while ((bare = bare_pattern.exec(remainder)) !== null) {
    const value = bare[2].trim();

    if (value.length > 0 && !SAFE_CSS_IMAGE_SOURCE.test(value)) return "none";
  }

  return sources.length === 0 ? "none" : whole;
}

export function strip_css_urls(
  css: string,
  options: StripCssUrlOptions = {},
): string {
  const decoded = strip_css_comments(decode_css_escapes(css));
  const url_stripped = decoded.replace(
    /url\s*\(([^)]*)\)/gi,
    (_match, url_content) => {
      let inner = (url_content || "").trim();

      if (
        inner.length >= 2 &&
        (inner[0] === '"' || inner[0] === "'") &&
        inner[inner.length - 1] === inner[0]
      ) {
        inner = inner.slice(1, -1).trim();
      }
      const trimmed = inner.toLowerCase();

      if (
        trimmed.startsWith("cid:") ||
        trimmed.startsWith("blob:") ||
        trimmed.startsWith("#")
      ) {
        return _match;
      }

      if (trimmed.startsWith("data:")) {
        const safe_css_data_types = [
          "data:image/png",
          "data:image/jpeg",
          "data:image/jpg",
          "data:image/gif",
          "data:image/webp",
          "data:image/avif",
          "data:image/bmp",
          "data:image/tiff",
          "data:image/heic",
          "data:image/heif",
          "data:image/x-icon",
          "data:image/vnd.microsoft.icon",
        ];

        if (safe_css_data_types.some((t) => trimmed.startsWith(t))) {
          return _match;
        }

        return "none";
      }

      if (
        options.image_proxy_url &&
        (trimmed.startsWith("http://") || trimmed.startsWith("https://"))
      ) {
        const proxied = `${options.image_proxy_url}?url=${encodeURIComponent(inner)}`;

        return `url("${proxied}")`;
      }

      return "none";
    },
  );

  const with_image_sets = replace_balanced_calls(
    url_stripped,
    IMAGE_SET_HEAD,
    drop_unsafe_call,
  );

  return replace_balanced_calls(
    with_image_sets,
    CROSS_FADE_HEAD,
    drop_unsafe_call,
  );
}

export function block_remote_fonts(css: string): string {
  let result = css;
  const pattern = /@font-face\s*\{/gi;
  let match;

  while ((match = pattern.exec(result)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;

    while (i < result.length && depth > 0) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      i++;
    }
    result = result.slice(0, match.index) + result.slice(i);
    pattern.lastIndex = match.index;
  }

  return result;
}

export function sanitize_style(style: string, sandbox_mode: boolean): string {
  const decoded = strip_css_comments(
    decode_css_escapes(decode_css_entities(style)),
  );

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(decoded)) {
      return "";
    }
  }

  let result = decoded;

  result = result.replace(/expression\s*\([^)]*\)/gi, "");
  result = result.replace(/javascript\s*:[^;]*/gi, "");
  result = result.replace(/vbscript\s*:[^;]*/gi, "");

  result = result.replace(
    /position\s*:\s*(fixed|sticky)/gi,
    "position: relative",
  );

  if (!sandbox_mode) {
    result = strip_css_urls(result);
    result = result.replace(
      /position\s*:\s*(absolute|fixed|sticky)/gi,
      "position: relative",
    );
    result = result.replace(
      /cursor\s*:[^;]*url\s*\([^)]*\)[^;]*/gi,
      "cursor: default",
    );
    result = result.replace(
      /content\s*:\s*(?!["']?\s*["']?\s*;|["']?\s*["']?\s*$|none\s*;|none\s*$|""\s*;|""\s*$|''\s*;|''\s*$)[^;]*/gi,
      "content: none",
    );
    result = cap_css_dimension(result);
  }

  return result;
}

export function strip_dark_mode_media(css: string): string {
  let result = css;
  const pattern =
    /@media\s*\([^)]*prefers-color-scheme\s*:\s*dark[^)]*\)\s*\{/gi;
  let match;

  while ((match = pattern.exec(result)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;

    while (i < result.length && depth > 0) {
      if (result[i] === "{") depth++;
      else if (result[i] === "}") depth--;
      i++;
    }

    result = result.slice(0, match.index) + result.slice(i);
    pattern.lastIndex = match.index;
  }

  return result;
}

export function sanitize_css_block(css: string, _sandbox_mode = false): string {
  let decoded = strip_css_comments(
    decode_css_escapes(decode_css_entities(css)),
  );

  decoded = decoded.replace(/@import[^;]*;?/gi, "");
  decoded = decoded.replace(/@charset[^;]*;?/gi, "");
  decoded = decoded.replace(/expression\s*\([^)]*\)/gi, "");
  decoded = decoded.replace(/javascript\s*:[^;]*/gi, "");
  decoded = decoded.replace(/vbscript\s*:[^;]*/gi, "");
  decoded = decoded.replace(/-moz-binding\s*:[^;]*/gi, "");
  decoded = decoded.replace(/behavior\s*:[^;]*/gi, "");
  decoded = decoded.replace(/@namespace[^;]*;?/gi, "");
  decoded = decoded.replace(/@document[^;]*;?/gi, "");
  decoded = decoded.replace(/-moz-document[^;{]*\{[^}]*\}/gi, "");
  decoded = keep_embedded_image_sets(decoded);
  decoded = replace_balanced_calls(decoded, CROSS_FADE_HEAD, () => "none");
  decoded = strip_dark_mode_media(decoded);

  decoded = decoded.replace(
    /position\s*:\s*(fixed|sticky)/gi,
    "position: relative",
  );

  decoded = decoded.replace(/<\/(style|script)/gi, "<\\/$1");

  return decoded;
}

export function sanitize_compose_style(style_text: string): string {
  const decoded = decode_css_entities(style_text);

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(decoded)) {
      return "";
    }
  }

  const declarations = decoded.split(";").filter(Boolean);
  const safe_declarations: string[] = [];

  for (const decl of declarations) {
    const colon_index = decl.indexOf(":");

    if (colon_index === -1) continue;

    const prop = decl.slice(0, colon_index).trim().toLowerCase();
    const value = decl.slice(colon_index + 1).trim();

    if (!COMPOSE_ALLOWED_CSS_PROPERTIES.has(prop)) continue;

    if (
      prop === "display" &&
      !COMPOSE_ALLOWED_DISPLAY_VALUES.has(value.toLowerCase())
    ) {
      continue;
    }

    if (
      prop === "vertical-align" &&
      !COMPOSE_ALLOWED_VERTICAL_ALIGN_VALUES.has(value.toLowerCase())
    ) {
      continue;
    }

    if (/url\s*\(/i.test(value)) continue;
    if (/expression\s*\(/i.test(value)) continue;
    if (/javascript\s*:/i.test(value)) continue;

    safe_declarations.push(`${prop}: ${value}`);
  }

  return safe_declarations.join("; ");
}
