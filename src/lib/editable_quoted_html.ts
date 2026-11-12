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
import {
  DEFAULT_BLOCKED_IMAGE_LABELS,
  clear_blocked_image,
  prepare_blocked_image,
  type BlockedImageLabels,
} from "@/lib/blocked_image_placeholder";
import {
  get_compose_sanitize_options,
  get_original_image_source,
  proxy_compose_image_sources,
  restore_compose_image_sources,
} from "@/lib/compose_image_sources";
import { defer_compose_images } from "@/lib/compose_deferred_images";
import { restore_deferred_compose_images } from "@/lib/compose_deferred_markup";
import { sanitize_html } from "@/lib/html_sanitizer";
import { is_tracking_pixel } from "@/lib/html_sanitizer_utils";
import {
  escape_style_terminator,
  strip_css_urls,
} from "@/lib/html_sanitizer_css";
import {
  contain_untrusted_sources,
  get_trusted_image_origins,
  type UntrustedSourceHandlers,
} from "@/lib/untrusted_sources";
import { is_local_resource_url } from "@/lib/url_value";
import {
  blocks_remote_images,
  blocks_tracking_pixels,
  type RemoteImageMode,
} from "@/lib/remote_content_policy";
import { find_own_signature } from "@/lib/signature_html";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { resolve_content_blocking } from "@/components/email/resolve_content_blocking";
import {
  get_displayed_image_blocking,
  get_external_content_mode,
} from "@/components/email/viewer_shared/external_content";

const PARKED_PREFIX = "data-aster-parked-";
const PARKED_CSS_ATTRIBUTE = `${PARKED_PREFIX}css`;
const INLINE_REFERENCE_PATTERN = /^cid:/i;
const LOADING_ATTRIBUTES = ["src", "srcset", "background", "poster"];
const BLOCKED_PLACEHOLDER_CLASS = "blocked-remote-image";
const BLOCKED_PLACEHOLDER_SELECTOR = `img[${PARKED_PREFIX}src].${BLOCKED_PLACEHOLDER_CLASS}`;
const QUOTE_SELECTOR = ".aster_quote";

export interface EditableQuotedHtmlOptions {
  block_remote_images: boolean;
  block_tracking_pixels?: boolean;
  blocked_image_labels?: BlockedImageLabels;
}

export interface QuotedImageBlockingInput {
  block_external_content: boolean;
  block_remote_images: boolean;
  block_tracking_pixels: boolean;
  load_remote_images: string;
  source_email_id?: string | null;
}

export interface QuotedImageBlocking {
  block_remote_images: boolean;
  block_tracking_pixels: boolean;
}

export function resolve_quoted_image_blocking({
  block_external_content,
  block_remote_images,
  block_tracking_pixels,
  load_remote_images,
  source_email_id,
}: QuotedImageBlockingInput): QuotedImageBlocking {
  if (is_any_lockdown_active()) {
    return { block_remote_images: true, block_tracking_pixels: true };
  }

  const displayed = source_email_id
    ? get_displayed_image_blocking(source_email_id, {
        lockdown_active: false,
        block_external_content,
        block_remote_images,
        block_tracking_pixels,
        load_remote_images,
      })
    : undefined;

  if (displayed) return displayed;

  const policy = {
    load_remote_images: load_remote_images as RemoteImageMode,
    block_external_content,
    block_remote_images,
    block_tracking_pixels,
  };

  const resolved = resolve_content_blocking({
    lockdown_active: false,
    load_remote_content:
      !!source_email_id &&
      get_external_content_mode(source_email_id) === "loaded",
    preferences: {
      block_remote_images: blocks_remote_images(policy),
      block_remote_fonts: true,
      block_remote_css: true,
      block_tracking_pixels: blocks_tracking_pixels(policy),
    },
  });

  return {
    block_remote_images: resolved.block_remote_images,
    block_tracking_pixels:
      resolved.block_tracking_pixels || resolved.block_remote_images,
  };
}

function park_attribute(element: Element, name: string): void {
  const value = element.getAttribute(name);

  if (value === null) return;

  element.setAttribute(`${PARKED_PREFIX}${name}`, value);
  element.removeAttribute(name);
}

function park_loading_attributes(
  element: Element,
  labels: BlockedImageLabels,
): void {
  for (const name of LOADING_ATTRIBUTES) {
    const value = element.getAttribute(name);

    if (value === null || is_local_resource_url(value)) continue;

    park_attribute(element, name);

    if (name === "src" && element.localName === "img") {
      prepare_blocked_image(element as HTMLImageElement, false, labels);
    }
  }

  const style = element.getAttribute("style");

  if (style !== null) {
    const display_style = strip_css_urls(style);

    if (display_style !== style) {
      element.setAttribute(`${PARKED_PREFIX}style`, style);
      element.setAttribute("style", display_style);
    }
  }

  if (element.localName === "style") {
    const css = element.textContent ?? "";
    const display_css = escape_style_terminator(strip_css_urls(css));

    if (display_css !== css) {
      element.setAttribute(PARKED_CSS_ATTRIBUTE, css);
      element.textContent = display_css;
    }
  }
}

const PARK_UNTRUSTED_SOURCES: UntrustedSourceHandlers = {
  on_attribute: park_attribute,
  on_style_attribute: (element, original, contained) => {
    if (!element.hasAttribute(`${PARKED_PREFIX}style`)) {
      element.setAttribute(`${PARKED_PREFIX}style`, original);
    }
    element.setAttribute("style", contained);
  },
  on_style_element: (element, original, contained) => {
    if (!element.hasAttribute(PARKED_CSS_ATTRIBUTE)) {
      element.setAttribute(PARKED_CSS_ATTRIBUTE, original);
    }
    element.textContent = escape_style_terminator(contained);
  },
};

function is_quoted_tracking_pixel(image: HTMLImageElement): boolean {
  const original = get_original_image_source(image.getAttribute("src") ?? "");

  if (!original) return is_tracking_pixel(image);

  const probe = image.cloneNode(false) as HTMLImageElement;

  probe.setAttribute("src", original);

  return is_tracking_pixel(probe);
}

export function contain_quoted_remote_content(
  root: ParentNode,
  options: EditableQuotedHtmlOptions,
): void {
  if ((options.block_tracking_pixels ?? true) || options.block_remote_images) {
    root.querySelectorAll("img").forEach((image) => {
      if (is_quoted_tracking_pixel(image)) image.remove();
    });
  }

  if (!options.block_remote_images) return;

  const labels = options.blocked_image_labels ?? DEFAULT_BLOCKED_IMAGE_LABELS;

  if (root instanceof Element) park_loading_attributes(root, labels);
  root
    .querySelectorAll("*")
    .forEach((element) => park_loading_attributes(element, labels));
}

export function build_quoted_editor_html(
  html: string,
  options: EditableQuotedHtmlOptions,
): string {
  const template = document.createElement("template");

  template.innerHTML = html;
  contain_quoted_remote_content(template.content, options);

  return template.innerHTML;
}

function contain_unmarked_draft(
  root: DocumentFragment,
  options: EditableQuotedHtmlOptions,
): void {
  const signature = find_own_signature(root);
  const placeholder = document.createComment("");

  signature?.replaceWith(placeholder);
  contain_quoted_remote_content(root, options);
  if (signature) placeholder.replaceWith(signature);
}

export function contain_draft_quotes(
  html: string,
  options: EditableQuotedHtmlOptions,
  contain_unmarked = false,
): string {
  const has_quote = html.includes("aster_quote");

  if (!has_quote && !contain_unmarked) return html;

  const template = document.createElement("template");

  template.innerHTML = html;

  if (has_quote) {
    template.content
      .querySelectorAll(QUOTE_SELECTOR)
      .forEach((quote) => contain_quoted_remote_content(quote, options));
  } else {
    contain_unmarked_draft(template.content, options);
  }

  return template.innerHTML;
}

export function build_editable_quoted_fragment(
  html: string,
  options: EditableQuotedHtmlOptions,
): DocumentFragment {
  const template = document.createElement("template");

  template.innerHTML = proxy_compose_image_sources(
    sanitize_html(html, get_compose_sanitize_options()).html,
  );

  template.content.querySelectorAll("img").forEach((image) => {
    image.removeAttribute("srcset");

    if (INLINE_REFERENCE_PATTERN.test(image.getAttribute("src") ?? "")) {
      park_attribute(image, "src");
    }
  });

  contain_quoted_remote_content(template.content, options);

  contain_untrusted_sources(
    template.content,
    get_trusted_image_origins(),
    PARK_UNTRUSTED_SOURCES,
  );

  const built = template.innerHTML;
  const deferred = defer_compose_images(built);

  if (deferred !== built) template.innerHTML = deferred;

  return template.content;
}

const TAG_PATTERN = /<[a-z][^\s/>]*(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const TAG_HEAD_PATTERN = /^<[^\s/>]+/;
const ATTRIBUTE_PATTERN =
  /\s+([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;
const PARKED_STYLE_PATTERN =
  /<style\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/style>/gi;
const PARKED_CSS_VALUE_PATTERN = /\sdata-aster-parked-css="([^"]*)"/;

interface ParsedAttribute {
  name: string;
  text: string;
}

function decode_serialized_attribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&");
}

function restore_parked_tag(tag: string): string {
  if (!tag.includes(PARKED_PREFIX)) return tag;

  const head = TAG_HEAD_PATTERN.exec(tag);

  if (!head) return tag;

  const attributes: ParsedAttribute[] = [];
  let position = head[0].length;

  ATTRIBUTE_PATTERN.lastIndex = position;

  for (
    let match = ATTRIBUTE_PATTERN.exec(tag);
    match;
    match = ATTRIBUTE_PATTERN.exec(tag)
  ) {
    attributes.push({ name: match[1].toLowerCase(), text: match[0] });
    position = ATTRIBUTE_PATTERN.lastIndex;
  }

  const parked_names = new Set(
    attributes
      .filter((attribute) => attribute.name.startsWith(PARKED_PREFIX))
      .map((attribute) => attribute.name.slice(PARKED_PREFIX.length)),
  );

  const kept = attributes.flatMap((attribute) => {
    if (attribute.name === PARKED_CSS_ATTRIBUTE) return [];
    if (attribute.name.startsWith(PARKED_PREFIX)) {
      const name = attribute.name.slice(PARKED_PREFIX.length);
      const prefix_start = attribute.text.toLowerCase().indexOf(PARKED_PREFIX);

      return [
        attribute.text.slice(0, prefix_start) +
          name +
          attribute.text.slice(
            prefix_start + PARKED_PREFIX.length + name.length,
          ),
      ];
    }
    if (parked_names.has(attribute.name)) return [];

    return [attribute.text];
  });

  return head[0] + kept.join("") + tag.slice(position);
}

function restore_parked_styles(html: string): string {
  if (!html.includes(PARKED_CSS_ATTRIBUTE)) return html;

  return html.replace(
    PARKED_STYLE_PATTERN,
    (match: string, attributes: string) => {
      const parked = PARKED_CSS_VALUE_PATTERN.exec(attributes);

      if (!parked) return match;

      const remaining = attributes.replace(PARKED_CSS_VALUE_PATTERN, "");

      return `<style${remaining}>${decode_serialized_attribute(parked[1])}</style>`;
    },
  );
}

function restore_parked_sources(html: string): string {
  if (!html.includes(PARKED_PREFIX)) return html;

  return restore_parked_styles(html).replace(TAG_PATTERN, restore_parked_tag);
}

function clear_blocked_placeholders(html: string): string {
  if (!html.includes(BLOCKED_PLACEHOLDER_CLASS)) return html;

  const template = document.createElement("template");

  template.innerHTML = html;

  const placeholders = template.content.querySelectorAll(
    BLOCKED_PLACEHOLDER_SELECTOR,
  );

  if (placeholders.length === 0) return html;

  placeholders.forEach((image) => {
    clear_blocked_image(image);
    image.removeAttribute("data-tracking-pixel");
    image.classList.remove(BLOCKED_PLACEHOLDER_CLASS);
    if (image.classList.length === 0) image.removeAttribute("class");
  });

  return template.innerHTML;
}

export function read_compose_editor_html(html: string): string {
  return restore_compose_image_sources(
    restore_parked_sources(
      clear_blocked_placeholders(restore_deferred_compose_images(html)),
    ),
  );
}

export function read_editable_quoted_html(container: HTMLElement): string {
  return read_compose_editor_html(container.innerHTML);
}
