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
  ALLOWED_TAGS,
  DANGEROUS_TAGS,
  ALLOWED_DATA_URL_TYPES,
} from "./html_sanitizer_constants";
import {
  sanitize_css_block,
  block_remote_fonts,
  strip_css_urls,
  escape_style_terminator,
} from "./html_sanitizer_css";

export { is_transparent_color_value } from "./html_sanitizer_css";
import {
  is_tracking_pixel,
  strip_tracking_params,
  repair_comment_markup,
  sanitize_attribute,
} from "./html_sanitizer_utils";
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

const REMOTE_URL_SCHEME = /^\s*https?:/i;

function is_remote_url_value(value: string): boolean {
  const normalized = value.replace(/[\t\n\r]/g, "").toLowerCase().trim();

  return (
    REMOTE_URL_SCHEME.test(normalized) ||
    normalized.startsWith("//") ||
    normalized.startsWith("\\\\") ||
    normalized.startsWith("/\\") ||
    normalized.startsWith("\\/")
  );
}

function srcset_has_remote(value: string): boolean {
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0] || "")
    .some((url) => is_remote_url_value(url));
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
  content_blocking?: ContentBlockingSettings;
  lockdown_mode?: boolean;
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
    const text =
      typeof html === "string"
        ? html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
        : "";
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    return { html: escaped, external_content: fallback_report };
  }
}

const PREVIEW_FORBIDDEN_ELEMENTS =
  "style, script, noscript, template, link, meta, base, iframe, object, embed";

const PREVIEW_FORBIDDEN_REGEX =
  /<\/?(?:style|script|noscript|template|link|meta|base|iframe|object|embed)\b[^>]*>/gi;

const PREVIEW_STYLE_BLOCK_REGEX = /<style[\s\S]*?<\/style\s*>/gi;

function strip_until_stable(input: string, pattern: RegExp): string {
  let previous: string;
  let current = input;

  do {
    previous = current;
    current = current.replace(pattern, "");
  } while (current !== previous);

  return current;
}

function preview_fallback_sanitize(input: string): string {
  let out = strip_until_stable(input, PREVIEW_FORBIDDEN_REGEX);

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

  const working = strip_until_stable(html, PREVIEW_STYLE_BLOCK_REGEX);

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
          const value = attr.value.replace(/[\u0000-\u0020]+/g, "").toLowerCase();

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
    content_blocking,
    lockdown_mode = false,
  } = options;

  const effective_proxy = lockdown_mode ? undefined : image_proxy_url;

  const block_images = lockdown_mode
    ? true
    : (content_blocking?.block_remote_images ?? external_content_mode !== "always");
  const block_fonts = lockdown_mode
    ? true
    : (content_blocking?.block_remote_fonts ?? external_content_mode !== "always");
  const block_css = lockdown_mode
    ? true
    : (content_blocking?.block_remote_css ?? external_content_mode !== "always");
  const block_pixels = lockdown_mode
    ? true
    : (content_blocking?.block_tracking_pixels ?? external_content_mode !== "always");

  const external_content: ExternalContentReport = {
    has_remote_images: false,
    has_remote_fonts: false,
    has_remote_css: false,
    has_tracking_pixels: false,
    blocked_count: 0,
    blocked_items: [],
    cleaned_links: [],
  };

  let body_background: string | undefined;
  const body_style_match = html.match(
    /<body[^>]*style\s*=\s*["']([^"']*)["']/i,
  );

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
    const bgcolor_match = html.match(
      /<body[^>]*bgcolor\s*=\s*["']?([^"'\s>]+)["']?/i,
    );

    if (bgcolor_match) {
      const bg_val = bgcolor_match[1].trim();

      if (/^[#a-zA-Z0-9]+$/.test(bg_val)) {
        body_background = bg_val;
      }
    }
  }

  if (!body_background) {
    const first_el_match = html.match(
      /<body[^>]*>\s*(?:<!--[\s\S]*?-->\s*){0,32}<(table|div|center)\b[^>]*/i,
    );

    if (first_el_match) {
      const tag_str = first_el_match[0];
      const bg_attr = tag_str.match(
        /bgcolor\s*=\s*["']?([^"'\s>]+)["']?/i,
      );

      if (bg_attr) {
        const bg_val = bg_attr[1].trim();

        if (/^[#a-zA-Z0-9]+$/.test(bg_val)) {
          body_background = bg_val;
        }
      }

      if (!body_background) {
        const style_attr = tag_str.match(
          /style\s*=\s*["']([^"']*)["']/i,
        );

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
  const head_match = sandbox_mode
    ? preprocessed.match(/<head[\s>][\s\S]*?<\/head\s*>/i)
    : null;

  if (head_match) {
    const style_regex = /<style[^>]*>([\s\S]*?)<\/style\s*>/gi;
    let style_match;

    while ((style_match = style_regex.exec(head_match[0])) !== null) {
      let sanitized_css = sanitize_css_block(style_match[1], sandbox_mode);

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

      if (lockdown_mode || block_css || block_images) {
        const css_url_matches =
          sanitized_css.match(
            /url\s*\(\s*["']?(https?:\/\/[^"')\s]+)/gi,
          ) || [];

        if (css_url_matches.length > 0) {
          external_content.has_remote_css = true;
          external_content.blocked_count += css_url_matches.length;
          for (const match of css_url_matches) {
            const url_extract = match.match(/https?:\/\/[^"')\s]+/i);

            external_content.blocked_items.push({
              url: url_extract?.[0] || "stylesheet URL",
              type: "css",
            });
          }
        }
        sanitized_css = strip_css_urls(sanitized_css);
      }

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
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|aster):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(purified, "text/html");

  const autolink_text_node = (text_node: Node): Node => {
    const text = text_node.textContent || "";
    const url_pattern = /(https?:\/\/[^\s<>"'{}|\\^`[\]]+)/g;

    if (!url_pattern.test(text)) return text_node.cloneNode(true);

    const fragment = document.createDocumentFragment();
    let last_index = 0;

    url_pattern.lastIndex = 0;
    let match;

    while ((match = url_pattern.exec(text)) !== null) {
      if (match.index > last_index) {
        fragment.appendChild(
          document.createTextNode(text.slice(last_index, match.index)),
        );
      }
      const a = document.createElement("a");

      a.href = match[1];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = match[1];
      fragment.appendChild(a);
      last_index = url_pattern.lastIndex;
    }
    if (last_index < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(last_index)));
    }

    return fragment;
  };

  const MAX_SANITIZE_DEPTH = 1000;
  const sanitize_node = (node: Node, depth = 0): Node | null => {
    if (depth > MAX_SANITIZE_DEPTH) {
      const text = node.textContent || "";

      return text ? document.createTextNode(text) : null;
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
      const raw_css = element.textContent || "";
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

      if (lockdown_mode || block_css || block_images) {
        const css_url_matches =
          sanitized_css.match(
            /url\s*\(\s*["']?(https?:\/\/[^"')\s]+)/gi,
          ) || [];

        if (css_url_matches.length > 0) {
          external_content.has_remote_css = true;
          external_content.blocked_count += css_url_matches.length;
          for (const match of css_url_matches) {
            const url_extract = match.match(/https?:\/\/[^"')\s]+/i);

            external_content.blocked_items.push({
              url: url_extract?.[0] || "stylesheet URL",
              type: "css",
            });
          }
        }
        sanitized_css = strip_css_urls(sanitized_css);
      }

      if (!sanitized_css.trim()) {
        return null;
      }
      const new_style = document.createElement("style");

      new_style.textContent = escape_style_terminator(sanitized_css);

      return new_style;
    }

    if (!ALLOWED_TAGS.has(tag_name)) {
      const fragment = document.createDocumentFragment();

      for (const child of Array.from(element.childNodes)) {
        const sanitized = sanitize_node(child, depth + 1);

        if (sanitized) {
          fragment.appendChild(sanitized);
        }
      }

      return fragment;
    }

    const new_element = document.createElement(tag_name);

    for (const attr of Array.from(element.attributes)) {
      let sanitized_value = sanitize_attribute(
        tag_name,
        attr.name,
        attr.value,
        sandbox_mode,
      );

      if (sanitized_value !== null) {
        const attr_lower = attr.name.toLowerCase();
        if (
          attr_lower === "style" &&
          (lockdown_mode || block_css || block_images)
        ) {
          sanitized_value = strip_css_urls(sanitized_value);
        } else if (attr_lower === "srcset") {
          if (!lockdown_mode && srcset_has_remote(sanitized_value)) {
            external_content.has_remote_images = true;
            if (block_images) {
              external_content.blocked_count++;
              external_content.blocked_items.push({
                url: sanitized_value,
                type: "image",
              });
            }
          }
          continue;
        } else if (attr_lower === "background") {
          if (lockdown_mode) {
            continue;
          }
          if (is_remote_url_value(sanitized_value)) {
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
              sanitized_value = `${effective_proxy}?url=${encodeURIComponent(sanitized_value)}`;
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
      const lower_src = src.toLowerCase().trim();
      const is_remote = is_remote_url_value(src);
      const is_data_url = lower_src.startsWith("data:");
      const is_pixel = is_tracking_pixel(new_element as HTMLImageElement);

      let is_first_party = false;

      if (is_remote && typeof window !== "undefined") {
        try {
          is_first_party = new URL(src).origin === window.location.origin;
        } catch {
          is_first_party = false;
        }
      }

      if (is_remote && !is_first_party && lower_src.startsWith("http://")) {
        src = "https://" + src.slice(7);
        new_element.setAttribute("src", src);
      } else if (is_remote && !is_first_party && lower_src.startsWith("//")) {
        src = "https:" + src.trim();
        new_element.setAttribute("src", src);
      }

      if (is_data_url) {
        const is_safe_data_url = Array.from(ALLOWED_DATA_URL_TYPES).some(
          (type) => lower_src.startsWith(type),
        );

        if (!is_safe_data_url) {
          const placeholder = document.createElement("span");

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

          if (is_pixel && block_pixels) {
            return null;
          }

          if (
            external_content_mode === "never" ||
            (content_blocking && block_images)
          ) {
            const placeholder = document.createElement("span");

            placeholder.className = "blocked-image";
            placeholder.setAttribute("data-original-src", src);
            placeholder.setAttribute(
              "data-tracking-pixel",
              is_pixel ? "true" : "false",
            );

            const w = new_element.getAttribute("width");
            const h = new_element.getAttribute("height");
            const s = new_element.getAttribute("style");

            const alt = new_element.getAttribute("alt");

            if (w) placeholder.setAttribute("data-width", w);
            if (h) placeholder.setAttribute("data-height", h);
            if (s) placeholder.setAttribute("data-style", s);
            if (alt) placeholder.setAttribute("data-alt", alt);

            placeholder.textContent = alt || "[Image blocked]";

            return placeholder;
          }

          new_element.setAttribute("data-original-src", src);
          new_element.setAttribute("data-blocked", "true");
          new_element.setAttribute(
            "data-tracking-pixel",
            is_pixel ? "true" : "false",
          );
          if (effective_proxy) {
            new_element.setAttribute(
              "data-proxy-src",
              `${effective_proxy}?url=${encodeURIComponent(src)}`,
            );
          }
          new_element.setAttribute(
            "src",
            "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
          );
          new_element.setAttribute(
            "alt",
            new_element.getAttribute("alt") || "[Click to load image]",
          );
          new_element.className = (
            new_element.className + " blocked-remote-image"
          ).trim();
        } else if (effective_proxy) {
          new_element.setAttribute(
            "src",
            `${effective_proxy}?url=${encodeURIComponent(src)}`,
          );
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
            ? existing_style.replace(/;?\s*$/, "; ") + width_css
            : width_css;
          new_element.setAttribute("style", existing_style);
        }
      }

      if (height_attr && !/height\s*:/i.test(existing_style)) {
        let height_css = "";

        if (/^\d+$/.test(height_attr)) {
          height_css = `height:${height_attr}px`;
        } else if (/^\d+%$/.test(height_attr)) {
          height_css = `height:${height_attr}`;
        }

        if (height_css) {
          existing_style = new_element.getAttribute("style") || "";
          const combined = existing_style
            ? existing_style.replace(/;?\s*$/, "; ") + height_css
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

  const fragment = document.createDocumentFragment();

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

  const container = document.createElement("div");

  if (head_styles.length > 0) {
    for (const css of head_styles) {
      const style_el = document.createElement("style");

      style_el.textContent = escape_style_terminator(css);
      container.appendChild(style_el);
    }
  }

  container.appendChild(fragment);

  return {
    html: container.innerHTML,
    external_content,
    body_background,
  };
}
