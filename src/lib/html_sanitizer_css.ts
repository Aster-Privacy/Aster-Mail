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

const CSS_URL_FUNCTION_HEAD = /(?:url|src)\s*\(/iy;

const CSS_WHITESPACE = /\s/;

const CSS_STRING_QUOTE = /["']/;

const REMOTE_CSS_URL = /^https?:\/\//i;

function skip_css_string(css: string, start: number): number {
  const quote = css[start];
  let i = start + 1;

  while (i < css.length && css[i] !== quote && css[i] !== "\n") {
    i += css[i] === "\\" ? 2 : 1;
  }

  if (i >= css.length) return css.length;

  return css[i] === quote ? i + 1 : i;
}

function skip_bad_css_url(css: string, start: number): number {
  let i = start;

  while (i < css.length && css[i] !== ")") {
    i += css[i] === "\\" ? 2 : 1;
  }

  return Math.min(css.length, i + 1);
}

interface CssUrlCall {
  end: number;
  inner: string;
  valid: boolean;
}

function read_css_url_call(css: string, head_end: number): CssUrlCall {
  let i = head_end;

  while (i < css.length && CSS_WHITESPACE.test(css[i])) i++;

  if (i < css.length && CSS_STRING_QUOTE.test(css[i])) {
    const string_end = skip_css_string(css, i);
    const closed = string_end > i + 1 && css[string_end - 1] === css[i];
    const inner = closed
      ? css.slice(i + 1, string_end - 1)
      : css.slice(i + 1, string_end);
    let j = string_end;

    while (j < css.length && CSS_WHITESPACE.test(css[j])) j++;

    if (j >= css.length) return { end: css.length, inner, valid: closed };

    if (css[j] === ")") return { end: j + 1, inner, valid: closed };

    return { end: skip_bad_css_url(css, j), inner: "", valid: false };
  }

  let j = i;

  while (j < css.length && css[j] !== ")") {
    if (CSS_STRING_QUOTE.test(css[j]) || css[j] === "(") {
      return { end: skip_bad_css_url(css, j), inner: "", valid: false };
    }
    j += css[j] === "\\" ? 2 : 1;
  }

  return {
    end: Math.min(css.length, j + 1),
    inner: css.slice(i, Math.min(j, css.length)).trim(),
    valid: true,
  };
}

interface CssUrlVisitor {
  url: (whole: string, inner: string) => string;
  string?: (raw: string, inner: string) => void;
}

function walk_css_urls(css: string, visitor: CssUrlVisitor): string {
  let result = "";
  let index = 0;
  let i = 0;

  while (i < css.length) {
    const character = css[i];

    if (character === "\\") {
      i += 2;
      continue;
    }

    if (CSS_STRING_QUOTE.test(character)) {
      const end = skip_css_string(css, i);

      if (visitor.string) {
        const closed = end > i + 1 && css[end - 1] === character;

        visitor.string(
          css.slice(i, end),
          closed ? css.slice(i + 1, end - 1) : css.slice(i + 1, end),
        );
      }
      i = end;
      continue;
    }

    CSS_URL_FUNCTION_HEAD.lastIndex = i;
    const head = CSS_URL_FUNCTION_HEAD.exec(css);

    if (!head) {
      i += 1;
      continue;
    }

    const call = read_css_url_call(css, i + head[0].length);
    const whole = css.slice(i, call.end);

    result +=
      css.slice(index, i) +
      (call.valid ? visitor.url(whole, call.inner.trim()) : "none");
    index = call.end;
    i = call.end;
  }

  return result + css.slice(index);
}

export function list_remote_css_urls(css: string): string[] {
  const urls: string[] = [];

  walk_css_urls(strip_css_comments(decode_css_escapes(css)), {
    url: (whole, inner) => {
      if (REMOTE_CSS_URL.test(inner)) urls.push(inner);

      return whole;
    },
  });

  return urls;
}

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
      if (css[i] === "\\") {
        i += 2;
        continue;
      }
      if (CSS_STRING_QUOTE.test(css[i])) {
        i = skip_css_string(css, i);
        continue;
      }
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

interface CssImageSources {
  urls: string[];
  bare: string[];
}

function css_image_sources(inner: string): CssImageSources {
  const sources: CssImageSources = { urls: [], bare: [] };

  walk_css_urls(inner, {
    url: (whole, source) => {
      sources.urls.push(source);

      return whole;
    },
    string: (_raw, source) => {
      sources.bare.push(source.trim());
    },
  });

  return sources;
}

function css_image_set_sources(inner: string): string[] {
  const sources = css_image_sources(inner);

  return [...sources.urls, ...sources.bare];
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

  const sources = css_image_sources(inner);

  for (const value of sources.bare) {
    if (value.length > 0 && !SAFE_CSS_IMAGE_SOURCE.test(value)) return "none";
  }

  return sources.urls.length + sources.bare.length === 0 ? "none" : whole;
}

const SAFE_CSS_DATA_TYPES = [
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

export function strip_css_urls(
  css: string,
  options: StripCssUrlOptions = {},
): string {
  const decoded = strip_css_comments(decode_css_escapes(css));
  const url_stripped = walk_css_urls(decoded, {
    url: (whole, inner) => {
      const trimmed = inner.toLowerCase();

      if (
        trimmed.startsWith("cid:") ||
        trimmed.startsWith("blob:") ||
        trimmed.startsWith("#")
      ) {
        return whole;
      }

      if (trimmed.startsWith("data:")) {
        return SAFE_CSS_DATA_TYPES.some((t) => trimmed.startsWith(t))
          ? whole
          : "none";
      }

      if (options.image_proxy_url && REMOTE_CSS_URL.test(trimmed)) {
        const proxied = `${options.image_proxy_url}?url=${encodeURIComponent(inner)}`;

        return `url("${proxied}")`;
      }

      return "none";
    },
  });

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

const FONT_FACE_HEAD = /^@font-face\s*\{/i;

const CSS_IDENT_CHARACTER = /[a-z0-9_-]/i;

function find_font_face_ranges(css: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let depth = 0;
  let open_start = -1;
  let open_depth = 0;
  let previous_significant = "";
  let i = 0;

  while (i < css.length) {
    const character = css[i];

    if (character === "\\") {
      i += 2;
      previous_significant = "x";
      continue;
    }

    if (character === '"' || character === "'") {
      i += 1;
      while (i < css.length && css[i] !== character && css[i] !== "\n") {
        i += css[i] === "\\" ? 2 : 1;
      }
      i += 1;
      previous_significant = character;
      continue;
    }

    if (
      (character === "u" || character === "U") &&
      (i === 0 || !CSS_IDENT_CHARACTER.test(css[i - 1])) &&
      css.slice(i, i + 4).toLowerCase() === "url("
    ) {
      let j = i + 4;

      while (j < css.length && CSS_WHITESPACE.test(css[j])) j++;

      if (css[j] !== '"' && css[j] !== "'") {
        while (j < css.length && css[j] !== ")") {
          j += css[j] === "\\" ? 2 : 1;
        }
        i = j + 1;
        previous_significant = ")";
        continue;
      }

      i = j;
      previous_significant = "(";
      continue;
    }

    if (
      character === "@" &&
      open_start === -1 &&
      (previous_significant === "" ||
        previous_significant === "{" ||
        previous_significant === "}" ||
        previous_significant === ";")
    ) {
      const head = FONT_FACE_HEAD.exec(css.slice(i, i + 64));

      if (head) {
        open_start = i;
        open_depth = depth;
        depth += 1;
        i += head[0].length;
        previous_significant = "{";
        continue;
      }
    }

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);

      if (open_start !== -1 && depth === open_depth) {
        ranges.push([open_start, i + 1]);
        open_start = -1;
      }
    }

    if (!CSS_WHITESPACE.test(character)) previous_significant = character;
    i += 1;
  }

  if (open_start !== -1) ranges.push([open_start, css.length]);

  return ranges;
}

const IMAGE_PROXY_PATH = /\/api\/images\/v1\/proxy$/;

function font_proxy_for(image_proxy_url: string): string | undefined {
  if (!IMAGE_PROXY_PATH.test(image_proxy_url)) return undefined;

  return image_proxy_url.replace(IMAGE_PROXY_PATH, "/api/content/v1/proxy");
}

function proxy_font_face_urls(css: string, image_proxy_url: string): string {
  const font_proxy = font_proxy_for(image_proxy_url);
  const decoded = strip_css_comments(decode_css_escapes(css));

  return walk_css_urls(decoded, {
    url: (whole, inner) => {
      const lowered = inner.toLowerCase();

      if (lowered.startsWith("data:") || lowered.startsWith("#")) return whole;

      if (font_proxy && REMOTE_CSS_URL.test(lowered)) {
        return `url("${font_proxy}?url=${encodeURIComponent(inner)}&content_type=font")`;
      }

      return "none";
    },
  });
}

export function proxy_css_urls(css: string, image_proxy_url: string): string {
  let result = "";
  let cursor = 0;

  for (const [start, end] of find_font_face_ranges(css)) {
    result += strip_css_urls(css.slice(cursor, start), { image_proxy_url });
    result += proxy_font_face_urls(css.slice(start, end), image_proxy_url);
    cursor = end;
  }

  return result + strip_css_urls(css.slice(cursor), { image_proxy_url });
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
  const decoded = strip_css_comments(
    decode_css_escapes(decode_css_entities(style_text)),
  );

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
