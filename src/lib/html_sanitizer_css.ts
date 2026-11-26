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
  ascii_ci_at,
  index_of_ascii_ci,
  replace_up_to_last,
  skip_js_whitespace,
} from "./html_sanitizer_constants";
import { is_js_whitespace, trim_end_index } from "./linear_trim";
import {
  is_remote_url_value,
  normalize_url_value,
  to_absolute_remote_url,
} from "./url_value";

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

const CSS_HEX_ESCAPE = /^[0-9a-fA-F]{1,6}/;
const CSS_ESCAPE_WHITESPACE = /[ \t\n\r\f]/;

function decode_css_hex(hex: string): string {
  const cp = parseInt(hex, 16);

  if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) {
    return "�";
  }

  return String.fromCodePoint(cp);
}

function keep_quote_escaped(char: string, keep_quotes: boolean): string {
  return keep_quotes && (char === '"' || char === "'") ? "\\" + char : char;
}

function decode_css_escapes(css: string, keep_quotes = false): string {
  let result = "";
  let index = 0;

  while (index < css.length) {
    const char = css[index];

    if (char !== "\\") {
      result += char;
      index++;
      continue;
    }

    const hex = CSS_HEX_ESCAPE.exec(css.slice(index + 1, index + 7));

    if (hex) {
      index += 1 + hex[0].length;
      if (css[index] === "\r" && css[index + 1] === "\n") {
        index += 2;
      } else if (CSS_ESCAPE_WHITESPACE.test(css[index] ?? "")) {
        index++;
      }
      const decoded = decode_css_hex(hex[0]);

      if (decoded !== "\\") result += keep_quote_escaped(decoded, keep_quotes);
      continue;
    }

    const next = css[index + 1];

    index += 2;
    if (next === undefined || next === "\\" || /[\n\r\f]/.test(next)) {
      continue;
    }
    result += keep_quote_escaped(next, keep_quotes);
  }

  return result;
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

const PLAIN_HTTP_URL = /^\s*http:\/\//i;

export function build_proxy_url(proxy_url: string, target: string): string {
  const source = PLAIN_HTTP_URL.test(target)
    ? "https://" + target.trim().slice(7)
    : target;

  return `${proxy_url}?url=${encodeURIComponent(source)}`;
}

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
      if (is_remote_url_value(inner)) urls.push(normalize_url_value(inner));

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

    return sources.every((source) =>
      SAFE_CSS_IMAGE_SOURCE.test(normalize_url_value(source)),
    )
      ? whole
      : "none";
  });
}

function drop_unsafe_call(whole: string, inner: string): string {
  if (/(?:^|[^a-z-])none(?:$|[^a-z-])/i.test(whole)) return "none";

  const sources = css_image_sources(inner);

  for (const value of sources.bare) {
    if (
      value.length > 0 &&
      !SAFE_CSS_IMAGE_SOURCE.test(normalize_url_value(value))
    ) {
      return "none";
    }
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
      const trimmed = normalize_url_value(inner).toLowerCase();

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

      if (options.image_proxy_url && is_remote_url_value(trimmed)) {
        const proxied = build_proxy_url(
          options.image_proxy_url,
          to_absolute_remote_url(inner),
        );

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

export interface RestrictedCss {
  css: string;
  blocked: boolean;
}

export function restrict_css_urls(
  css: string,
  is_allowed: (url: string) => boolean,
): RestrictedCss {
  let blocked = false;
  const allow = (url: string): boolean => {
    if (is_allowed(url)) return true;
    blocked = true;

    return false;
  };
  const restrict_call = (whole: string, inner: string): string => {
    const sources = css_image_sources(inner);
    const all_allowed = [...sources.urls, ...sources.bare]
      .filter((source) => source.length > 0)
      .every(allow);

    return all_allowed ? whole : "none";
  };
  const decoded = strip_css_comments(decode_css_escapes(css));
  const without_imports = decoded.replace(/@import[^;]*;?/gi, () => {
    blocked = true;

    return "";
  });
  const walked = walk_css_urls(without_imports, {
    url: (whole, inner) => (allow(inner) ? whole : "none"),
  });
  const restricted = replace_balanced_calls(
    replace_balanced_calls(walked, IMAGE_SET_HEAD, restrict_call),
    CROSS_FADE_HEAD,
    restrict_call,
  );

  return { css: restricted, blocked: blocked || restricted !== decoded };
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
      const lowered = normalize_url_value(inner).toLowerCase();

      if (lowered.startsWith("data:") || lowered.startsWith("#")) return whole;

      if (font_proxy && is_remote_url_value(lowered)) {
        return `url("${build_proxy_url(font_proxy, to_absolute_remote_url(inner))}&content_type=font")`;
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

const CSS_BLOCK_OPENERS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

function split_css_declarations(css: string): string[] {
  const declarations: string[] = [];
  const closers: string[] = [];
  let quote: string | null = null;
  let start = 0;

  for (let i = 0; i < css.length; i++) {
    const char = css[i];

    if (quote) {
      if (char === "\\") i++;
      else if (char === quote || char === "\n") quote = null;
      continue;
    }

    if (char === "\\") i++;
    else if (char === '"' || char === "'") quote = char;
    else if (CSS_BLOCK_OPENERS[char]) closers.push(CSS_BLOCK_OPENERS[char]);
    else if (char === closers[closers.length - 1]) closers.pop();
    else if (char === ";" && closers.length === 0) {
      declarations.push(css.slice(start, i));
      start = i + 1;
    }
  }
  declarations.push(css.slice(start));

  return declarations;
}

const IN_FLOW_POSITIONS = new Set(["static", "relative"]);

const CONTAINED_POSITIONS = new Set(["static", "relative", "absolute"]);

const OUT_OF_PAGE_POSITIONS = new Set(["absolute", "fixed"]);

const OUT_OF_FLOW_PROPERTY =
  /^(?:-[a-z]+-)?(?:z-index|transform|translate|rotate|scale|offset(?:-[a-z]+)?)$/;

const OFFSET_PROPERTY =
  /^(?:-[a-z]+-)?(?:top|right|bottom|left|inset(?:-[a-z]+)*|margin(?:-[a-z]+)*)$/;

const BOX_OFFSET_PROPERTY = /^(?:top|right|bottom|left|inset(?:-[a-z]+)*)$/;

const NEGATIVE_LENGTH = /(^|[\s,])-[\d.][^\s,!]*/g;

const NEGATIVE_DIMENSION = /(?:^|[\s,(])-(\d*\.?\d+)([a-z%]*)/gi;

const OFF_PAGE_DISTANCE_PX = 500;

const UNIT_TO_PX: Record<string, number> = {
  "": 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  em: 16,
  rem: 16,
  ex: 8,
  ch: 8,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  "%": 6,
  vw: 6,
  vh: 6,
  vmin: 6,
  vmax: 6,
};

const IMPORTANT_KEYWORD = "important";

export function important_suffix_start(value: string): number {
  const keyword_end = trim_end_index(value, is_js_whitespace);
  const keyword_start = keyword_end - IMPORTANT_KEYWORD.length;

  if (!ascii_ci_at(value, keyword_start, IMPORTANT_KEYWORD)) return -1;

  const bang = trim_end_index(value, is_js_whitespace, keyword_start) - 1;

  if (bang < 0 || value.charCodeAt(bang) !== 0x21) return -1;

  return trim_end_index(value, is_js_whitespace, bang);
}

export function has_important_suffix(value: string): boolean {
  return important_suffix_start(value) !== -1;
}

export function strip_important_suffix(value: string): string {
  const start = important_suffix_start(value);

  return start === -1 ? value : value.slice(0, start);
}

function empty_content_token_end(value: string, index: number): number {
  if (ascii_ci_at(value, index, "none")) return index + 4;

  const quote = value.charCodeAt(index);

  if (quote !== 0x22 && quote !== 0x27) return index;

  const close = skip_js_whitespace(value, index + 1);

  return value.charCodeAt(close) === quote ? close + 1 : index;
}

export function is_empty_content_value(value: string): boolean {
  const token_start = skip_js_whitespace(value, 0);
  let position = skip_js_whitespace(
    value,
    empty_content_token_end(value, token_start),
  );

  if (position === value.length) return true;

  if (value.charCodeAt(position) !== 0x21) return false;

  position = skip_js_whitespace(value, position + 1);

  if (!ascii_ci_at(value, position, IMPORTANT_KEYWORD)) return false;

  return (
    skip_js_whitespace(value, position + IMPORTANT_KEYWORD.length) ===
    value.length
  );
}

const CSS_EXPRESSION_CALL = /expression\s*\([^)]*\)/gi;

export function strip_css_expressions(css: string): string {
  return replace_up_to_last(css, ")", CSS_EXPRESSION_CALL, "");
}

function remote_url_prefix_end(css: string, start: number): number {
  let position = skip_js_whitespace(css, start + 4);
  const quote = css.charCodeAt(position);

  if (quote === 0x22 || quote === 0x27) position += 1;

  if (ascii_ci_at(css, position, "https:")) {
    position += 6;
  } else if (ascii_ci_at(css, position, "http:")) {
    position += 5;
  }

  return css.startsWith("//", position) ? position + 2 : -1;
}

export function strip_remote_url_calls(css: string): string {
  let result = "";
  let copied = 0;
  let from = 0;
  let close = -1;
  let close_space_start = -1;

  for (;;) {
    const start = index_of_ascii_ci(css, "url(", from);

    if (start === -1) break;

    const body_start = remote_url_prefix_end(css, start);

    if (body_start === -1) {
      from = start + 1;
      continue;
    }

    if (close < body_start) {
      close = css.indexOf(")", body_start);

      if (close === -1) break;

      close_space_start = trim_end_index(css, is_js_whitespace, close);
    }

    const quote = skip_js_whitespace(css, start + 4);
    const quote_code = css.charCodeAt(quote);
    const quoted = quote_code === 0x22 || quote_code === 0x27;

    if (
      quoted &&
      (close_space_start - 1 < body_start ||
        css.charCodeAt(close_space_start - 1) !== quote_code)
    ) {
      from = start + 1;
      continue;
    }

    result += `${css.slice(copied, start)}url()`;
    copied = close + 1;
    from = close + 1;
  }

  return copied === 0 ? css : result + css.slice(copied);
}

const IMAGE_SET_CALL = /(?:-webkit-)?image-set\s*\([^)]*\)/gi;
const CROSS_FADE_CALL = /cross-fade\s*\([^)]*\)/gi;
const IMPORT_RULE = /@import[^;]*;/gi;

export function strip_remote_css_fetches(html: string): string {
  const without_urls = strip_remote_url_calls(html);
  const without_image_sets = replace_up_to_last(
    without_urls,
    ")",
    IMAGE_SET_CALL,
    "none",
  );
  const without_cross_fades = replace_up_to_last(
    without_image_sets,
    ")",
    CROSS_FADE_CALL,
    "none",
  );

  return replace_up_to_last(without_cross_fades, ";", IMPORT_RULE, "");
}

const MOZ_DOCUMENT_PREFIX = "-moz-document";

function next_semicolon_or_brace(css: string, from: number): number {
  for (let index = from; index < css.length; index += 1) {
    const code = css.charCodeAt(index);

    if (code === 0x3b || code === 0x7b) return index;
  }

  return -1;
}

export function strip_moz_document_rules(css: string): string {
  let result = "";
  let copied = 0;
  let from = 0;

  for (;;) {
    const start = index_of_ascii_ci(css, MOZ_DOCUMENT_PREFIX, from);

    if (start === -1) break;

    const stop = next_semicolon_or_brace(
      css,
      start + MOZ_DOCUMENT_PREFIX.length,
    );

    if (stop === -1) break;

    if (css.charCodeAt(stop) === 0x3b) {
      from = stop + 1;
      continue;
    }

    const close = css.indexOf("}", stop + 1);

    if (close === -1) break;

    result += css.slice(copied, start);
    copied = close + 1;
    from = close + 1;
  }

  return copied === 0 ? css : result + css.slice(copied);
}

const CSS_URL_CALL = /url\s*\(/i;

interface CssDeclaration {
  property: string;
  value: string;
}

function parse_declaration(declaration: string): CssDeclaration | null {
  const colon_index = declaration.indexOf(":");

  if (colon_index === -1) return null;

  return {
    property: declaration.slice(0, colon_index).trim().toLowerCase(),
    value: declaration.slice(colon_index + 1),
  };
}

function position_keyword(value: string): string {
  return strip_important_suffix(value).trim().toLowerCase();
}

function reaches_off_page(value: string): boolean {
  for (const match of value.matchAll(NEGATIVE_DIMENSION)) {
    const scale = UNIT_TO_PX[match[2].toLowerCase()];

    if (
      scale !== undefined &&
      parseFloat(match[1]) * scale >= OFF_PAGE_DISTANCE_PX
    ) {
      return true;
    }
  }

  return false;
}

function is_moved_off_page(css: string): boolean {
  let positioned_out = false;
  let negative_offset = false;

  for (const declaration of split_css_declarations(css)) {
    const parsed = parse_declaration(declaration);

    if (!parsed) continue;

    if (parsed.property === "position") {
      positioned_out = OUT_OF_PAGE_POSITIONS.has(
        position_keyword(parsed.value),
      );
    } else if (
      BOX_OFFSET_PROPERTY.test(parsed.property) &&
      reaches_off_page(parsed.value)
    ) {
      negative_offset = true;
    }
  }

  return positioned_out && negative_offset;
}

function keep_declaration_in_flow(
  declaration: string,
  contained_layout: boolean,
): string | null {
  const parsed = parse_declaration(declaration);

  if (!parsed) return declaration;

  const { property, value } = parsed;

  if (property === "content") {
    return is_empty_content_value(value) ? declaration : "content: none";
  }

  if (property === "cursor") {
    return CSS_URL_CALL.test(value) ? "cursor: default" : declaration;
  }

  if (property === "position") {
    const allowed = contained_layout ? CONTAINED_POSITIONS : IN_FLOW_POSITIONS;

    return allowed.has(position_keyword(value))
      ? declaration
      : "position: relative";
  }

  if (contained_layout) return declaration;

  if (OUT_OF_FLOW_PROPERTY.test(property)) return null;

  if (OFFSET_PROPERTY.test(property)) {
    if (value.includes("(")) return null;

    const clamped = value.replace(
      NEGATIVE_LENGTH,
      (_match, lead: string) => `${lead}0`,
    );

    return `${declaration.slice(0, declaration.indexOf(":"))}:${clamped}`;
  }

  return declaration;
}

function keep_declarations_in_flow(
  css: string,
  contained_layout: boolean,
): string {
  return split_css_declarations(css)
    .map((declaration) =>
      keep_declaration_in_flow(declaration, contained_layout),
    )
    .filter((declaration): declaration is string => declaration !== null)
    .join(";");
}

function strip_declaration_urls(css: string): string {
  return split_css_declarations(css)
    .map((declaration) => strip_css_urls(declaration))
    .filter((declaration) => split_css_declarations(declaration).length === 1)
    .join(";");
}

export function sanitize_style(
  style: string,
  sandbox_mode: boolean,
  contained_layout = false,
): string {
  const decoded = strip_css_comments(
    decode_css_escapes(decode_css_entities(style), !sandbox_mode),
  );

  for (const pattern of DANGEROUS_CSS_PATTERNS) {
    if (pattern.test(decoded)) {
      return "";
    }
  }

  let result = decoded;

  result = strip_css_expressions(result);
  result = result.replace(/javascript\s*:[^;]*/gi, "");
  result = result.replace(/vbscript\s*:[^;]*/gi, "");

  if (!sandbox_mode && is_moved_off_page(result)) {
    return "display: none";
  }

  result = result.replace(
    /position\s*:\s*(fixed|sticky)/gi,
    "position: relative",
  );

  if (!sandbox_mode) {
    result = strip_declaration_urls(result);
    result = keep_declarations_in_flow(result, contained_layout);
    result = cap_css_dimension(result);
    result = keep_declarations_in_flow(result, contained_layout);
  }

  return result;
}

const DARK_SCHEME_FEATURE = /prefers-color-scheme\s*:\s*dark\b/i;
const NEGATED_DARK_SCHEME =
  /^\s*not\b|\bnot\s*(?:\(\s*)+prefers-color-scheme\s*:\s*dark\b/i;

function split_media_queries(prelude: string): string[] {
  const queries: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < prelude.length; i++) {
    const char = prelude[i];

    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      queries.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  queries.push(prelude.slice(start));

  return queries.map((query) => query.trim()).filter(Boolean);
}

function requires_dark_scheme(query: string): boolean {
  return DARK_SCHEME_FEATURE.test(query) && !NEGATED_DARK_SCHEME.test(query);
}

export function strip_dark_media_queries(media: string): string | null {
  const queries = split_media_queries(media);

  if (!queries.some(requires_dark_scheme)) return media;

  const kept = queries.filter((query) => !requires_dark_scheme(query));

  return kept.length > 0 ? kept.join(", ") : null;
}

const MEDIA_ATTRIBUTE_CHARACTERS = /^[\w\s(),:.\-/<>=]*$/;

export function scope_css_to_media_attribute(
  css: string,
  media: string | null | undefined,
): string {
  const value = (media || "").trim();

  if (!value) return css;
  if (!MEDIA_ATTRIBUTE_CHARACTERS.test(value)) return "";

  const queries = split_media_queries(value);
  const kept = queries.filter((query) => !requires_dark_scheme(query));

  if (kept.length === 0) return "";

  return `@media ${kept.join(", ")} {\n${css}\n}`;
}

export function strip_dark_mode_media(css: string): string {
  const head = /@media\b/gi;
  const parts: string[] = [];
  let copied = 0;
  let match;

  while ((match = head.exec(css)) !== null) {
    const prelude_start = head.lastIndex;
    let open = prelude_start;

    while (
      open < css.length &&
      css[open] !== "{" &&
      css[open] !== "}" &&
      css[open] !== ";"
    ) {
      open++;
    }

    if (open >= css.length) break;

    if (css[open] !== "{") {
      head.lastIndex = open;
      continue;
    }

    const queries = split_media_queries(css.slice(prelude_start, open));

    if (!queries.some(requires_dark_scheme)) {
      head.lastIndex = open + 1;
      continue;
    }

    const kept = queries.filter((query) => !requires_dark_scheme(query));

    parts.push(css.slice(copied, match.index));

    if (kept.length > 0) {
      parts.push(`@media ${kept.join(", ")} {`);
      copied = open + 1;
      head.lastIndex = open + 1;
      continue;
    }

    let depth = 1;
    let i = open + 1;

    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }

    copied = i;
    head.lastIndex = i;
  }

  parts.push(css.slice(copied));

  return parts.join("");
}

const BLOCKED_CSS_RULE_PASS_LIMIT = 8;

function strip_blocked_css_rules(css: string): string {
  return strip_moz_document_rules(
    strip_css_expressions(
      css
        .replace(/@import[^;]*;?/gi, "")
        .replace(/@charset[^;]*;?/gi, ""),
    )
      .replace(/javascript\s*:[^;]*/gi, "")
      .replace(/vbscript\s*:[^;]*/gi, "")
      .replace(/-moz-binding\s*:[^;]*/gi, "")
      .replace(/behavior\s*:[^;]*/gi, "")
      .replace(/@namespace[^;]*;?/gi, "")
      .replace(/@document[^;]*;?/gi, ""),
  );
}

export function sanitize_css_block(css: string, _sandbox_mode = false): string {
  let decoded = strip_css_comments(
    decode_css_escapes(decode_css_entities(css)),
  );

  decoded = strip_blocked_css_rules(decoded);
  decoded = keep_embedded_image_sets(decoded);
  decoded = replace_balanced_calls(decoded, CROSS_FADE_HEAD, () => "none");

  let is_settled = false;

  for (let pass = 0; pass < BLOCKED_CSS_RULE_PASS_LIMIT; pass++) {
    const next = strip_blocked_css_rules(strip_dark_mode_media(decoded));

    if (next === decoded) {
      is_settled = true;
      break;
    }
    decoded = next;
  }

  if (!is_settled) {
    return "";
  }

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
