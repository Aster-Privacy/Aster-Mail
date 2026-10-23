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
  get_compose_sanitize_options,
  proxy_compose_image_sources,
  restore_compose_image_sources,
} from "@/lib/compose_image_sources";
import { sanitize_html } from "@/lib/html_sanitizer";
import {
  escape_style_terminator,
  strip_css_urls,
} from "@/lib/html_sanitizer_css";
import {
  contain_untrusted_sources,
  get_trusted_image_origins,
  type UntrustedSourceHandlers,
} from "@/lib/untrusted_sources";
import { get_url_scheme } from "@/lib/url_value";

const PARKED_PREFIX = "data-aster-parked-";
const PARKED_CSS_ATTRIBUTE = `${PARKED_PREFIX}css`;
const INLINE_REFERENCE_PATTERN = /^cid:/i;
const LOADING_ATTRIBUTES = ["src", "srcset", "background", "poster"];

export interface EditableQuotedHtmlOptions {
  block_remote_images: boolean;
}

function park_attribute(element: Element, name: string): void {
  const value = element.getAttribute(name);

  if (value === null) return;

  element.setAttribute(`${PARKED_PREFIX}${name}`, value);
  element.removeAttribute(name);
}

function park_loading_attributes(element: Element): void {
  for (const name of LOADING_ATTRIBUTES) {
    const value = element.getAttribute(name);

    if (value === null || get_url_scheme(value) === "data") continue;

    park_attribute(element, name);
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

  if (options.block_remote_images) {
    template.content.querySelectorAll("*").forEach(park_loading_attributes);
  }

  contain_untrusted_sources(
    template.content,
    get_trusted_image_origins(),
    PARK_UNTRUSTED_SOURCES,
  );

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

export function read_editable_quoted_html(container: HTMLElement): string {
  return restore_compose_image_sources(
    restore_parked_sources(container.innerHTML),
  );
}
