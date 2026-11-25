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
import DOMPurify from "dompurify";

import {
  prepare_blocked_image,
  type BlockedImageLabels,
} from "./blocked_image_placeholder";
import { split_autolinks } from "./autolink";
import { mark_brand_backgrounds } from "./email_brand_backgrounds";
import {
  mark_inline_background_images,
  mark_stylesheet_background_images,
} from "./html_sanitizer_background_marks";
import {
  ALLOWED_TAGS,
  DANGEROUS_TAGS,
  ALLOWED_DATA_URL_TYPES,
  ascii_ci_at,
  index_of_ascii_ci,
  replace_up_to_last,
  skip_js_whitespace,
  word_boundary_after,
} from "./html_sanitizer_constants";
import {
  build_proxy_url,
  sanitize_css_block,
  block_remote_fonts,
  strip_css_urls,
  proxy_css_urls,
  list_remote_css_urls,
  escape_style_terminator,
  strip_dark_media_queries,
  scope_css_to_media_attribute,
} from "./html_sanitizer_css";

export { is_transparent_color_value } from "./html_sanitizer_css";
import {
  is_tracking_pixel,
  strip_tracking_params,
  repair_comment_markup,
  sanitize_attribute,
  find_close_tag,
  find_close_tag_end,
  find_tag_open,
} from "./html_sanitizer_utils";
import {
  is_js_whitespace,
  trim_end_index,
  trim_end_while,
} from "./linear_trim";
import {
  get_page_origin,
  is_remote_url_value,
  normalize_url_value,
  parse_srcset_candidates,
  to_absolute_remote_url,
  type SrcsetCandidate,
} from "./url_value";
export { repair_comment_markup } from "./html_sanitizer_utils";
export {
  is_html_content,
  strip_quoted_sections,
  has_rich_html,
  plain_text_to_html,
  html_to_readable_plain_text,
  strip_html_tags,
  strip_html_tags_bounded,
} from "./html_text";
export type { ReadablePlainTextOptions } from "./html_text";

export {
  sanitize_compose_paste,
  sanitize_outgoing_html,
} from "./html_sanitizer_compose";

const URL_BEARING_ATTRIBUTES = new Set([
  "src",
  "href",
  "background",
  "cite",
  "poster",
]);

const IMAGE_PROXY_PATH = "/api/images/v1/proxy";

const STATIC_IMAGE_PATH =
  /^\/[a-z0-9_\-/]+\.(?:png|jpe?g|gif|svg|webp|ico|avif)$/i;

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

const PARSE_BASE_URL = "https://local.invalid";

type LocalImageUrl =
  | { kind: "external" }
  | { kind: "static" }
  | { kind: "proxied"; inner: string }
  | { kind: "local" };

function classify_local_image_url(value: string): LocalImageUrl {
  const trimmed = normalize_url_value(value);

  if (!trimmed) return { kind: "external" };

  const is_remote = is_remote_url_value(trimmed);

  if (!is_remote && URL_SCHEME.test(trimmed)) return { kind: "external" };

  const page_origin = get_page_origin();
  let parsed: URL;

  try {
    parsed = new URL(trimmed, page_origin ?? PARSE_BASE_URL);
  } catch {
    return is_remote ? { kind: "external" } : { kind: "local" };
  }

  if (is_remote && (!page_origin || parsed.origin !== page_origin)) {
    return { kind: "external" };
  }

  const pathname = trim_end_while(parsed.pathname, is_slash_code).toLowerCase();

  if (pathname === IMAGE_PROXY_PATH) {
    const inner = parsed.searchParams.get("url");

    return inner && is_remote_url_value(inner)
      ? { kind: "proxied", inner }
      : { kind: "local" };
  }

  if (
    !parsed.search &&
    !pathname.startsWith("/api/") &&
    STATIC_IMAGE_PATH.test(parsed.pathname)
  ) {
    return { kind: "static" };
  }

  return { kind: "local" };
}

function has_alternate_image_source(img: Element): boolean {
  if (img.getAttribute("srcset")?.trim()) return true;

  const parent = img.parentElement;

  if (!parent || parent.tagName.toLowerCase() !== "picture") return false;

  return Array.from(parent.children).some(
    (sibling) =>
      sibling.tagName.toLowerCase() === "source" &&
      !!sibling.getAttribute("srcset")?.trim(),
  );
}

const MAX_RESERVED_PIXEL_HEIGHT = 40;

function serialize_srcset_value(candidates: SrcsetCandidate[]): string {
  return candidates
    .map((candidate) =>
      candidate.descriptor
        ? `${candidate.url} ${candidate.descriptor}`
        : candidate.url,
    )
    .join(", ");
}

export interface BlockedItem {
  url: string;
  type: "image" | "font" | "css" | "tracking_pixel";
}

export interface CleanedLink {
  original_url: string;
  cleaned_url: string;
  params_removed: string[];
}

export interface ExternalContentReport {
  has_remote_images: boolean;
  has_remote_fonts: boolean;
  has_remote_css: boolean;
  has_tracking_pixels: boolean;
  blocked_count: number;
  blocked_items: BlockedItem[];
  cleaned_links: CleanedLink[];
}

export interface SanitizeResult {
  html: string;
  external_content: ExternalContentReport;
  body_background?: string;
}

export type ImageLoadMode = "always" | "ask" | "never";

export interface ContentBlockingSettings {
  block_remote_images?: boolean;
  block_remote_fonts?: boolean;
  block_remote_css?: boolean;
  block_tracking_pixels?: boolean;
}

export interface SanitizeOptions {
  external_content_mode?: ImageLoadMode;
  image_proxy_url?: string;
  sandbox_mode?: boolean;
  contained_layout?: boolean;
  content_blocking?: ContentBlockingSettings;
  lockdown_mode?: boolean;
  blocked_image_labels?: BlockedImageLabels;
}

export function strip_raw_text_blocks(text: string, name: string): string {
  const last_close = text.lastIndexOf(">");
  let result = "";
  let copied = 0;
  let from = 0;

  for (;;) {
    const start = find_tag_open(text, name, from);

    if (start === -1) break;

    const close = find_tag_open(text, `/${name}`, start + name.length + 1);

    if (close === -1 || last_close < close + name.length + 2) break;

    const end = text.indexOf(">", close + name.length + 2) + 1;

    result += `${text.slice(copied, start)} `;
    copied = end;
    from = end;
  }

  return copied === 0 ? text : result + text.slice(copied);
}

export function strip_raw_text_tail(text: string, name: string): string {
  const start = find_tag_open(text, name, 0);

  if (start === -1 || text.lastIndexOf(">") < start + name.length + 1) {
    return text;
  }

  return `${text.slice(0, start)} `;
}

export function degraded_text_html(html: string): string {
  const text =
    typeof html === "string"
      ? replace_up_to_last(
          strip_raw_text_tail(
            strip_raw_text_blocks(
              strip_raw_text_tail(strip_raw_text_blocks(html, "style"), "style"),
              "script",
            ),
            "script",
          ),
          ">",
          /<[^>]*>/g,
          " ",
        )
          .replace(/\s+/g, " ")
          .trim()
      : "";

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function sanitize_html(
  html: string,
  options: SanitizeOptions = {},
): SanitizeResult {
  try {
    return sanitize_html_impl(html, options);
  } catch {
    const fallback_report: ExternalContentReport = {
      has_remote_images: false,
      has_remote_fonts: false,
      has_remote_css: false,
      has_tracking_pixels: false,
      blocked_count: 0,
      blocked_items: [],
      cleaned_links: [],
    };

    return {
      html: degraded_text_html(html),
      external_content: fallback_report,
    };
  }
}

const PREVIEW_FORBIDDEN_ELEMENTS =
  "style, script, noscript, template, link, meta, base, iframe, object, embed";

const PREVIEW_FORBIDDEN_REGEX =
  /<\/?(?:style|script|noscript|template|link|meta|base|iframe|object|embed)\b[^>]*>/gi;

export function strip_preview_forbidden_tags(html: string): string {
  return replace_up_to_last(html, ">", PREVIEW_FORBIDDEN_REGEX, "");
}

export function strip_preview_style_blocks(html: string): string {
  let result = "";
  let copied = 0;
  let from = 0;

  for (;;) {
    const start = index_of_ascii_ci(html, "<style", from);

    if (start === -1) break;

    const end = find_close_tag_end(html, "style", start + 6);

    if (end === -1) break;

    result += html.slice(copied, start);
    copied = end;
    from = end;
  }

  return copied === 0 ? html : result + html.slice(copied);
}

function is_slash_code(code: number): boolean {
  return code === 0x2f;
}

const BODY_STYLE_ATTRIBUTE_REGEX = /<body[^>]*style\s*=\s*["']([^"']*)["']/iy;
const BODY_BGCOLOR_ATTRIBUTE_REGEX =
  /<body[^>]*bgcolor\s*=\s*["']?([^"'\s>]+)["']?/iy;

function match_body_tag(html: string, pattern: RegExp): RegExpExecArray | null {
  let from = 0;

  for (;;) {
    const start = index_of_ascii_ci(html, "<body", from);

    if (start === -1) return null;

    pattern.lastIndex = start;

    const match = pattern.exec(html);

    if (match) return match;

    const tag_end = html.indexOf(">", start + 5);

    if (tag_end === -1) return null;

    from = tag_end + 1;
  }
}

export function match_body_style_attribute(
  html: string,
): RegExpExecArray | null {
  return match_body_tag(html, BODY_STYLE_ATTRIBUTE_REGEX);
}

export function match_body_bgcolor_attribute(
  html: string,
): RegExpExecArray | null {
  return match_body_tag(html, BODY_BGCOLOR_ATTRIBUTE_REGEX);
}

const FIRST_ELEMENT_NAMES = ["table", "div", "center"];
const MAX_LEADING_COMMENTS = 32;
const UNREACHABLE_COMMENT_COUNT = Number.MAX_SAFE_INTEGER;

function first_element_name_end(html: string, index: number): number {
  if (html.charCodeAt(index) !== 0x3c) return -1;

  for (const name of FIRST_ELEMENT_NAMES) {
    const end = index + 1 + name.length;

    if (ascii_ci_at(html, index + 1, name) && word_boundary_after(html, end)) {
      return end;
    }
  }

  return -1;
}

interface LeadingCommentTable {
  ends: number[];
  resume: number[];
  need: number[];
  suffix_need: number[];
}

function first_comment_end_index(
  table: LeadingCommentTable,
  from: number,
): number {
  let low = 0;
  let high = table.ends.length;

  while (low < high) {
    const middle = (low + high) >>> 1;

    if (table.ends[middle] < from) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function comments_needed(
  html: string,
  table: LeadingCommentTable,
  position: number,
): number {
  if (first_element_name_end(html, position) !== -1) return 0;

  if (!html.startsWith("<!--", position)) return UNREACHABLE_COMMENT_COUNT;

  const next = first_comment_end_index(table, position + 4);

  if (next >= table.ends.length) return UNREACHABLE_COMMENT_COUNT;

  const rest = table.suffix_need[next];

  return rest === UNREACHABLE_COMMENT_COUNT
    ? UNREACHABLE_COMMENT_COUNT
    : rest + 1;
}

function build_leading_comment_table(html: string): LeadingCommentTable {
  const ends: number[] = [];

  for (
    let end = html.indexOf("-->");
    end !== -1;
    end = html.indexOf("-->", end + 3)
  ) {
    ends.push(end);
  }

  const table: LeadingCommentTable = {
    ends,
    resume: ends.map((end) => skip_js_whitespace(html, end + 3)),
    need: new Array<number>(ends.length).fill(UNREACHABLE_COMMENT_COUNT),
    suffix_need: new Array<number>(ends.length + 1).fill(
      UNREACHABLE_COMMENT_COUNT,
    ),
  };

  for (let index = ends.length - 1; index >= 0; index -= 1) {
    table.need[index] = comments_needed(html, table, table.resume[index]);
    table.suffix_need[index] = Math.min(
      table.need[index],
      table.suffix_need[index + 1],
    );
  }

  return table;
}

export function match_body_first_element(html: string): string | null {
  let table: LeadingCommentTable | null = null;
  let from = 0;

  for (;;) {
    const start = index_of_ascii_ci(html, "<body", from);

    if (start === -1) return null;

    const tag_end = html.indexOf(">", start + 5);

    if (tag_end === -1) return null;

    let position = skip_js_whitespace(html, tag_end + 1);

    if (
      first_element_name_end(html, position) === -1 &&
      html.startsWith("<!--", position)
    ) {
      if (table === null) table = build_leading_comment_table(html);
    }

    if (
      table !== null &&
      comments_needed(html, table, position) <= MAX_LEADING_COMMENTS
    ) {
      let budget = MAX_LEADING_COMMENTS;

      while (first_element_name_end(html, position) === -1) {
        let next = first_comment_end_index(table, position + 4);

        while (table.need[next] > budget - 1) next += 1;

        position = table.resume[next];
        budget -= 1;
      }
    }

    const name_end = first_element_name_end(html, position);

    if (name_end !== -1) {
      const close = html.indexOf(">", name_end);

      return html.slice(start, close === -1 ? html.length : close);
    }

    from = tag_end + 1;
  }
}

export function match_head_block(html: string): string | null {
  for (
    let start = index_of_ascii_ci(html, "<head", 0);
    start !== -1;
    start = index_of_ascii_ci(html, "<head", start + 1)
  ) {
    const next = html.charCodeAt(start + 5);

    if (next === 0x3e || is_js_whitespace(next)) {
      const end = find_close_tag_end(html, "head", start + 6);

      return end === -1 ? null : html.slice(start, end);
    }
  }

  return null;
}

export interface StyleBlock {
  attributes: string;
  css: string;
}

export function extract_style_blocks(html: string): StyleBlock[] {
  const blocks: StyleBlock[] = [];
  let from = 0;

  for (;;) {
    const start = index_of_ascii_ci(html, "<style", from);

    if (start === -1) break;

    const tag_end = html.indexOf(">", start + 6);

    if (tag_end === -1) break;

    const close = find_close_tag(html, "style", tag_end + 1);

    if (close === null) break;

    blocks.push({
      attributes: html.slice(start + 6, tag_end),
      css: html.slice(tag_end + 1, close.start),
    });
    from = close.end;
  }

  return blocks;
}

export function append_style_separator(style: string): string {
  const end = trim_end_index(style, is_js_whitespace);
  const cut = end > 0 && style.charCodeAt(end - 1) === 0x3b ? end - 1 : end;

  return `${style.slice(0, cut)}; `;
}
const STYLE_MEDIA_ATTRIBUTE =
  /(?:^|\s)media\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

function strip_until_stable(
  input: string,
  strip: (value: string) => string,
): string {
  let previous: string;
  let current = input;

  do {
    previous = current;
    current = strip(current);
  } while (current !== previous);

  return current;
}

function preview_fallback_sanitize(input: string): string {
  let out = strip_until_stable(input, strip_preview_forbidden_tags);

  out = out.replace(/\son[a-z][\w-]*\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi, "");

  out = out.replace(
    /\s(?:href|src|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi,
    (match, value: string) => {
      const v = value
        .replace(/^["']|["']$/g, "")
        .replace(/[\u0000-\u0020]+/g, "")
        .toLowerCase();

      if (
        v.startsWith("javascript:") ||
        v.startsWith("vbscript:") ||
        (v.startsWith("data:") && !v.startsWith("data:image/"))
      ) {
        return "";
      }

      return match;
    },
  );

  return out;
}

export function sanitize_preview_html(html: string): string {
  if (!html || typeof html !== "string") return "";

  const working = strip_until_stable(html, strip_preview_style_blocks);

  if (typeof DOMParser === "undefined") {
    return preview_fallback_sanitize(working);
  }

  try {
    const doc = new DOMParser().parseFromString(working, "text/html");

    doc
      .querySelectorAll(PREVIEW_FORBIDDEN_ELEMENTS)
      .forEach((el) => el.remove());

    doc
      .querySelectorAll("svg, math, form, frame, frameset, portal")
      .forEach((el) => el.remove());

    doc.querySelectorAll("*").forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();

        if (/^on/i.test(name) || name === "style" || name === "srcdoc") {
          el.removeAttribute(attr.name);

          continue;
        }

        if (name === "href" || name === "src" || name === "xlink:href") {
          const value = attr.value
            .replace(/[\u0000-\u0020]+/g, "")
            .toLowerCase();

          if (
            value.startsWith("javascript:") ||
            value.startsWith("vbscript:") ||
            (value.startsWith("data:") && !value.startsWith("data:image/"))
          ) {
            el.removeAttribute(attr.name);
          }
        }
      }
    });

    return doc.body ? doc.body.innerHTML : "";
  } catch {
    return preview_fallback_sanitize(working);
  }
}

export interface SanitizeBlocking {
  block_images: boolean;
  block_fonts: boolean;
  block_css: boolean;
  block_pixels: boolean;
}

export function resolve_sanitize_blocking(
  options: Pick<
    SanitizeOptions,
    "external_content_mode" | "content_blocking" | "lockdown_mode"
  >,
): SanitizeBlocking {
  const {
    external_content_mode = "always",
    content_blocking,
    lockdown_mode = false,
  } = options;
  const blocked_by_mode = external_content_mode !== "always";

  if (lockdown_mode) {
    return {
      block_images: true,
      block_fonts: true,
      block_css: true,
      block_pixels: true,
    };
  }

  return {
    block_images: content_blocking?.block_remote_images ?? blocked_by_mode,
    block_fonts: content_blocking?.block_remote_fonts ?? blocked_by_mode,
    block_css: content_blocking?.block_remote_css ?? blocked_by_mode,
    block_pixels: content_blocking?.block_tracking_pixels ?? blocked_by_mode,
  };
}

function sanitize_html_impl(
  html: string,
  options: SanitizeOptions = {},
): SanitizeResult {
  const empty_report: ExternalContentReport = {
    has_remote_images: false,
    has_remote_fonts: false,
    has_remote_css: false,
    has_tracking_pixels: false,
    blocked_count: 0,
    blocked_items: [],
    cleaned_links: [],
  };

  if (!html || typeof html !== "string") {
    return { html: "", external_content: empty_report };
  }

  const {
    external_content_mode = "always",
    image_proxy_url,
    sandbox_mode = false,
    contained_layout = false,
    content_blocking,
    lockdown_mode = false,
    blocked_image_labels,
  } = options;

  const effective_proxy = lockdown_mode ? undefined : image_proxy_url;

  const { block_images, block_fonts, block_css, block_pixels } =
    resolve_sanitize_blocking({
      external_content_mode,
      content_blocking,
      lockdown_mode,
    });

  const css_images_blocked = lockdown_mode || block_images;

  const allowed_css_image_proxy =
    css_images_blocked || !effective_proxy ? undefined : effective_proxy;

  const external_content: ExternalContentReport = {
    has_remote_images: false,
    has_remote_fonts: false,
    has_remote_css: false,
    has_tracking_pixels: false,
    blocked_count: 0,
    blocked_items: [],
    cleaned_links: [],
  };

  const filter_css_images = (css: string): string => {
    if (css_images_blocked) {
      const remote_css_urls = list_remote_css_urls(css);

      if (remote_css_urls.length > 0) {
        external_content.has_remote_images = true;
        external_content.blocked_count += remote_css_urls.length;
        for (const url of remote_css_urls) {
          external_content.blocked_items.push({ url, type: "image" });
        }
      }

      return strip_css_urls(css);
    }

    if (allowed_css_image_proxy) {
      return proxy_css_urls(css, allowed_css_image_proxy);
    }

    return block_css ? strip_css_urls(css) : css;
  };

  let body_background: string | undefined;
  const body_style_match = match_body_style_attribute(html);

  if (body_style_match) {
    const bg_match = body_style_match[1].match(
      /background(?:-color)?\s*:\s*([^;]+)/i,
    );

    if (bg_match) {
      const bg_val = bg_match[1].trim();

      if (/^[#a-zA-Z0-9(),.\s%]+$/.test(bg_val)) {
        body_background = bg_val;
      }
    }
  }

  if (!body_background) {
    const bgcolor_match = match_body_bgcolor_attribute(html);

    if (bgcolor_match) {
      const bg_val = bgcolor_match[1].trim();

      if (/^[#a-zA-Z0-9]+$/.test(bg_val)) {
        body_background = bg_val;
      }
    }
  }

  if (!body_background) {
    const tag_str = match_body_first_element(html);

    if (tag_str !== null) {
      const bg_attr = tag_str.match(/bgcolor\s*=\s*["']?([^"'\s>]+)["']?/i);

      if (bg_attr) {
        const bg_val = bg_attr[1].trim();

        if (/^[#a-zA-Z0-9]+$/.test(bg_val)) {
          body_background = bg_val;
        }
      }

      if (!body_background) {
        const style_attr = tag_str.match(/style\s*=\s*["']([^"']*)["']/i);

        if (style_attr) {
          const bg_style = style_attr[1].match(
            /background(?:-color)?\s*:\s*([^;]+)/i,
          );

          if (bg_style) {
            const bg_val = bg_style[1].trim();

            if (/^[#a-zA-Z0-9(),.\s%]+$/.test(bg_val)) {
              body_background = bg_val;
            }
          }
        }
      }
    }
  }

  const preprocessed = repair_comment_markup(html);

  const head_styles: string[] = [];
  const head_html = sandbox_mode ? match_head_block(preprocessed) : null;

  if (head_html !== null) {
    for (const style_block of extract_style_blocks(head_html)) {
      const media_match = style_block.attributes.match(STYLE_MEDIA_ATTRIBUTE);
      let sanitized_css = sanitize_css_block(
        scope_css_to_media_attribute(
          style_block.css,
          media_match
            ? (media_match[1] ?? media_match[2] ?? media_match[3])
            : null,
        ),
        sandbox_mode,
      );

      if (block_fonts) {
        const font_matches = sanitized_css.match(/@font-face\s*\{/gi) || [];

        if (font_matches.length > 0) {
          external_content.has_remote_fonts = true;
          external_content.blocked_count += font_matches.length;
          for (let i = 0; i < font_matches.length; i++) {
            external_content.blocked_items.push({
              url: "@font-face",
              type: "font",
            });
          }
        }
        sanitized_css = block_remote_fonts(sanitized_css);
      }

      sanitized_css = filter_css_images(sanitized_css);

      if (sanitized_css.trim()) {
        head_styles.push(sanitized_css);
      }
    }
  }

  const purified = DOMPurify.sanitize(preprocessed, {
    ALLOWED_TAGS: Array.from(ALLOWED_TAGS),
    ALLOWED_ATTR: [
      "class",
      "id",
      "title",
      "dir",
      "lang",
      "style",
      "href",
      "target",
      "rel",
      "name",
      "src",
      "alt",
      "width",
      "height",
      "loading",
      "colspan",
      "rowspan",
      "align",
      "valign",
      "bgcolor",
      "cellpadding",
      "cellspacing",
      "border",
      "hspace",
      "vspace",
      "sizes",
      "color",
      "face",
      "size",
      "srcset",
      "type",
      "media",
      "start",
      "reversed",
      "value",
      "cite",
      "datetime",
      "span",
      "background",
      "data-aster-signature",
      "data-aster-signature-id",
    ],
    FORBID_TAGS: Array.from(DANGEROUS_TAGS),
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    KEEP_CONTENT: true,
    FORCE_BODY: true,
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|aster):|data:image\/(?:jpeg|jpg|png|gif|webp|avif|bmp|tiff|heic|heif|x-icon|vnd\.microsoft\.icon)[;,]|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(purified, "text/html");
  const output_doc = document.implementation.createHTMLDocument("");

  const autolink_text_node = (text_node: Node): Node => {
    const text = text_node.textContent || "";
    const segments = split_autolinks(text);

    if (!segments.some((segment) => segment.href)) {
      return text_node.cloneNode(true);
    }

    const fragment = output_doc.createDocumentFragment();

    for (const segment of segments) {
      if (!segment.href) {
        fragment.appendChild(output_doc.createTextNode(segment.text));
        continue;
      }
      const a = output_doc.createElement("a");

      a.href = segment.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = segment.text;
      fragment.appendChild(a);
    }

    return fragment;
  };

  const visible_text_of = (root: Node): string => {
    const parts: string[] = [];
    const stack: Node[] = [root];

    while (stack.length > 0) {
      const current = stack.pop() as Node;

      if (current.nodeType === Node.TEXT_NODE) {
        parts.push(current.nodeValue || "");
        continue;
      }

      if (current.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const current_tag = (current as Element).tagName.toLowerCase();

      if (current_tag === "style" || current_tag === "script") {
        continue;
      }

      const children = current.childNodes;

      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }

    return parts.join("");
  };

  const MAX_SANITIZE_DEPTH = 1000;
  const sanitize_node = (node: Node, depth = 0): Node | null => {
    if (depth > MAX_SANITIZE_DEPTH) {
      const tag_name =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as Element).tagName.toLowerCase()
          : "";

      if (tag_name === "style" || tag_name === "script") {
        return null;
      }

      const text = visible_text_of(node);

      return text ? output_doc.createTextNode(text) : null;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      const parent_tag =
        parent && parent.nodeType === Node.ELEMENT_NODE
          ? (parent as Element).tagName.toLowerCase()
          : "";

      if (
        parent_tag === "a" ||
        parent_tag === "style" ||
        parent_tag === "script"
      ) {
        return node.cloneNode(true);
      }

      return autolink_text_node(node);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as Element;
    const tag_name = element.tagName.toLowerCase();

    if (DANGEROUS_TAGS.has(tag_name)) {
      return null;
    }

    if (tag_name === "style") {
      if (!sandbox_mode) {
        return null;
      }
      const raw_css = scope_css_to_media_attribute(
        element.textContent || "",
        element.getAttribute("media"),
      );
      let sanitized_css = sanitize_css_block(raw_css, sandbox_mode);

      if (block_fonts) {
        const font_matches = sanitized_css.match(/@font-face\s*\{/gi) || [];

        if (font_matches.length > 0) {
          external_content.has_remote_fonts = true;
          external_content.blocked_count += font_matches.length;
          for (let i = 0; i < font_matches.length; i++) {
            external_content.blocked_items.push({
              url: "@font-face",
              type: "font",
            });
          }
        }
        sanitized_css = block_remote_fonts(sanitized_css);
      }

      sanitized_css = filter_css_images(sanitized_css);

      if (!sanitized_css.trim()) {
        return null;
      }
      const new_style = output_doc.createElement("style");

      new_style.textContent = escape_style_terminator(sanitized_css);

      return new_style;
    }

    if (!ALLOWED_TAGS.has(tag_name)) {
      const fragment = output_doc.createDocumentFragment();

      for (const child of Array.from(element.childNodes)) {
        const sanitized = sanitize_node(child, depth + 1);

        if (sanitized) {
          fragment.appendChild(sanitized);
        }
      }

      return fragment;
    }

    if (tag_name === "source" && element.hasAttribute("media")) {
      const media = strip_dark_media_queries(
        element.getAttribute("media") || "",
      );

      if (media === null) {
        return null;
      }

      element.setAttribute("media", media);
    }

    const new_element = output_doc.createElement(tag_name);

    for (const attr of Array.from(element.attributes)) {
      let sanitized_value = sanitize_attribute(
        tag_name,
        attr.name,
        attr.value,
        sandbox_mode,
        contained_layout,
      );

      if (sanitized_value !== null) {
        const attr_lower = attr.name.toLowerCase();

        if (URL_BEARING_ATTRIBUTES.has(attr_lower)) {
          sanitized_value = normalize_url_value(sanitized_value);
        }

        if (attr_lower === "style") {
          sanitized_value = filter_css_images(sanitized_value);
        } else if (attr_lower === "srcset") {
          const kept: SrcsetCandidate[] = [];

          for (const raw_candidate of parse_srcset_candidates(
            sanitized_value,
          )) {
            const original_candidate: SrcsetCandidate = {
              url: normalize_url_value(raw_candidate.url),
              descriptor: raw_candidate.descriptor,
            };

            if (!original_candidate.url) continue;

            const local_candidate = classify_local_image_url(
              original_candidate.url,
            );

            if (local_candidate.kind === "local") {
              continue;
            }

            if (local_candidate.kind === "static") {
              kept.push(original_candidate);
              continue;
            }

            const candidate =
              local_candidate.kind === "proxied"
                ? {
                    url: local_candidate.inner,
                    descriptor: original_candidate.descriptor,
                  }
                : original_candidate;

            if (!is_remote_url_value(candidate.url)) {
              kept.push(candidate);
              continue;
            }

            external_content.has_remote_images = true;

            if (block_images) {
              external_content.blocked_count++;
              external_content.blocked_items.push({
                url: candidate.url,
                type: "image",
              });
              continue;
            }

            kept.push(
              effective_proxy
                ? {
                    url: build_proxy_url(
                      effective_proxy,
                      to_absolute_remote_url(candidate.url),
                    ),
                    descriptor: candidate.descriptor,
                  }
                : original_candidate,
            );
          }

          if (kept.length === 0) {
            continue;
          }

          sanitized_value = serialize_srcset_value(kept);
        } else if (
          attr_lower === "background" ||
          (tag_name === "source" && attr_lower === "src")
        ) {
          const local_background = classify_local_image_url(sanitized_value);
          const original_background = sanitized_value;

          if (local_background.kind === "local") {
            continue;
          }

          if (local_background.kind === "proxied") {
            sanitized_value = local_background.inner;
          }

          if (
            local_background.kind !== "static" &&
            is_remote_url_value(sanitized_value)
          ) {
            external_content.has_remote_images = true;
            if (block_images) {
              external_content.blocked_count++;
              external_content.blocked_items.push({
                url: sanitized_value,
                type: "image",
              });
              continue;
            }
            if (effective_proxy) {
              sanitized_value = build_proxy_url(
                effective_proxy,
                to_absolute_remote_url(sanitized_value),
              );
            } else {
              sanitized_value = original_background;
            }
          }
        }
        new_element.setAttribute(attr.name, sanitized_value);
      }
    }

    if (tag_name === "a") {
      new_element.setAttribute("rel", "noopener noreferrer");
      const href = new_element.getAttribute("href");
      const lower_href = (href || "").toLowerCase().trim();
      const is_http_href =
        lower_href.startsWith("http://") || lower_href.startsWith("https://");

      if (is_http_href || !new_element.hasAttribute("target")) {
        new_element.setAttribute("target", "_blank");
      }

      if (
        href &&
        (lower_href.startsWith("http://") || lower_href.startsWith("https://"))
      ) {
        const strip_result = strip_tracking_params(href);

        new_element.setAttribute("href", strip_result.url);

        if (strip_result.removed.length > 0) {
          external_content.cleaned_links.push({
            original_url: href,
            cleaned_url: strip_result.url,
            params_removed: strip_result.removed,
          });
        }
      }
    }

    if (lockdown_mode && tag_name === "source") {
      return null;
    }

    if (tag_name === "img") {
      let src = new_element.getAttribute("src") || "";

      if (!normalize_url_value(src) && !has_alternate_image_source(element)) {
        return null;
      }
      const local_image = classify_local_image_url(src);

      if (local_image.kind === "local") {
        const alt = new_element.getAttribute("alt");

        return alt ? output_doc.createTextNode(alt) : null;
      }

      const original_local_src =
        local_image.kind === "proxied" ? src : undefined;

      if (local_image.kind === "proxied") {
        src = local_image.inner;
        new_element.setAttribute("src", src);
      }

      src = normalize_url_value(src);

      const lower_src = src.toLowerCase();
      const is_remote = is_remote_url_value(src);
      const is_data_url = lower_src.startsWith("data:");
      const is_pixel = is_tracking_pixel(new_element as HTMLImageElement);
      const is_first_party = local_image.kind === "static";

      if (is_remote && !is_first_party) {
        const absolute_src = to_absolute_remote_url(src);

        src = /^http:\/\//i.test(absolute_src)
          ? "https://" + absolute_src.slice(7)
          : absolute_src;
        new_element.setAttribute("src", src);
      }

      if (is_data_url) {
        const is_safe_data_url = Array.from(ALLOWED_DATA_URL_TYPES).some(
          (type) => lower_src.startsWith(type),
        );

        if (!is_safe_data_url) {
          const placeholder = output_doc.createElement("span");

          placeholder.className = "blocked-image";
          placeholder.textContent = "[Blocked data URL]";

          return placeholder;
        }
      }

      if (is_remote && !is_first_party) {
        external_content.has_remote_images = true;
        if (is_pixel) {
          external_content.has_tracking_pixels = true;
        }

        const should_block_this_image = is_pixel
          ? block_pixels || block_images
          : block_images;

        if (should_block_this_image) {
          external_content.blocked_count++;
          external_content.blocked_items.push({
            url: src,
            type: is_pixel ? "tracking_pixel" : "image",
          });

          new_element.setAttribute("data-original-src", src);
          new_element.setAttribute("data-blocked", "true");
          new_element.setAttribute(
            "data-tracking-pixel",
            is_pixel ? "true" : "false",
          );
          if (effective_proxy) {
            new_element.setAttribute(
              "data-proxy-src",
              build_proxy_url(effective_proxy, src),
            );
          }
          prepare_blocked_image(
            new_element as HTMLImageElement,
            is_pixel,
            blocked_image_labels,
          );
        } else if (effective_proxy) {
          new_element.setAttribute(
            "src",
            build_proxy_url(effective_proxy, src),
          );
        } else if (original_local_src) {
          new_element.setAttribute("src", original_local_src);
        }
      }
    }

    if (tag_name === "img") {
      const width_attr = new_element.getAttribute("width");
      const height_attr = new_element.getAttribute("height");
      let existing_style = new_element.getAttribute("style") || "";

      if (width_attr && !/width\s*:/i.test(existing_style)) {
        let width_css = "";

        if (/^\d+$/.test(width_attr)) {
          width_css = `width:${width_attr}px`;
        } else if (/^\d+%$/.test(width_attr)) {
          width_css = `width:${width_attr}`;
        }

        if (width_css) {
          existing_style = existing_style
            ? append_style_separator(existing_style) + width_css
            : width_css;
          new_element.setAttribute("style", existing_style);
        }
      }

      if (height_attr && !/height\s*:/i.test(existing_style)) {
        let height_css = "";
        const both_pixel_sized =
          width_attr !== null &&
          /^\d+$/.test(width_attr) &&
          /^\d+$/.test(height_attr) &&
          Number(width_attr) > 0 &&
          Number(height_attr) > 0;

        if (both_pixel_sized) {
          height_css = `height:auto; aspect-ratio:${width_attr} / ${height_attr}`;
        } else if (/^\d+$/.test(height_attr)) {
          height_css =
            Number(height_attr) > MAX_RESERVED_PIXEL_HEIGHT
              ? `height:auto; max-height:${height_attr}px`
              : `height:${height_attr}px`;
        } else if (/^\d+%$/.test(height_attr)) {
          height_css = `height:${height_attr}`;
        }

        if (height_css) {
          existing_style = new_element.getAttribute("style") || "";
          const combined = existing_style
            ? append_style_separator(existing_style) + height_css
            : height_css;

          new_element.setAttribute("style", combined);
        }
      }
    }

    for (const child of Array.from(element.childNodes)) {
      const sanitized = sanitize_node(child, depth + 1);

      if (sanitized) {
        new_element.appendChild(sanitized);
      }
    }

    return new_element;
  };

  const fragment = output_doc.createDocumentFragment();

  if (sandbox_mode && doc.head) {
    for (const child of Array.from(doc.head.childNodes)) {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as Element).tagName.toLowerCase() === "style"
      ) {
        const sanitized = sanitize_node(child);

        if (sanitized) {
          fragment.appendChild(sanitized);
        }
      }
    }
  }

  for (const child of Array.from(doc.body.childNodes)) {
    const sanitized = sanitize_node(child);

    if (sanitized) {
      fragment.appendChild(sanitized);
    }
  }

  const container = output_doc.createElement("div");

  if (head_styles.length > 0) {
    for (const css of head_styles) {
      const style_el = output_doc.createElement("style");

      style_el.textContent = escape_style_terminator(css);
      container.appendChild(style_el);
    }
  }

  container.appendChild(fragment);

  mark_stylesheet_background_images(container);
  mark_inline_background_images(container);
  mark_brand_backgrounds(container);

  return {
    html: container.innerHTML,
    external_content,
    body_background,
  };
}
