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
import { get_image_proxy_url } from "@/lib/image_proxy";
import {
  escape_style_terminator,
  restrict_css_urls,
} from "@/lib/html_sanitizer_css";
import {
  get_page_origin,
  is_trusted_render_url,
  parse_srcset_candidates,
  resolve_url_origin,
} from "@/lib/url_value";

const SOURCE_ATTRIBUTES = ["src", "background", "poster", "lowsrc", "dynsrc"];
const SRCSET_ATTRIBUTES = ["srcset", "imagesrcset"];
const LINKED_IMAGE_ELEMENTS = new Set(["image", "use", "feimage"]);
const LINKED_IMAGE_ATTRIBUTES = ["href", "xlink:href"];
const CSS_FETCH_HINT = /url\s*\(|image-set|cross-fade|@import|\\/i;

export interface UntrustedSourceHandlers {
  on_attribute: (element: Element, name: string) => void;
  on_style_attribute: (
    element: Element,
    original: string,
    contained: string,
  ) => void;
  on_style_element: (
    element: Element,
    original: string,
    contained: string,
  ) => void;
}

export const REMOVE_UNTRUSTED_SOURCES: UntrustedSourceHandlers = {
  on_attribute: (element, name) => element.removeAttribute(name),
  on_style_attribute: (element, _original, contained) =>
    element.setAttribute("style", contained),
  on_style_element: (element, _original, contained) => {
    element.textContent = escape_style_terminator(contained);
  },
};

export function get_trusted_image_origins(): Set<string> {
  const origins = new Set<string>();
  const page_origin = get_page_origin();

  if (page_origin) origins.add(page_origin);

  const proxy_origin = resolve_url_origin(get_image_proxy_url());

  if (proxy_origin) origins.add(proxy_origin);

  return origins;
}

function has_untrusted_srcset(
  value: string,
  trusted_origins: ReadonlySet<string>,
): boolean {
  return parse_srcset_candidates(value).some(
    (candidate) => !is_trusted_render_url(candidate.url, trusted_origins),
  );
}

function contain_element(
  element: Element,
  trusted_origins: ReadonlySet<string>,
  handlers: UntrustedSourceHandlers,
): number {
  const is_trusted = (url: string) =>
    is_trusted_render_url(url, trusted_origins);
  let contained = 0;

  for (const name of SOURCE_ATTRIBUTES) {
    const value = element.getAttribute(name);

    if (value !== null && !is_trusted(value)) {
      handlers.on_attribute(element, name);
      contained += 1;
    }
  }

  for (const name of SRCSET_ATTRIBUTES) {
    const value = element.getAttribute(name);

    if (value !== null && has_untrusted_srcset(value, trusted_origins)) {
      handlers.on_attribute(element, name);
      contained += 1;
    }
  }

  if (LINKED_IMAGE_ELEMENTS.has(element.localName.toLowerCase())) {
    for (const name of LINKED_IMAGE_ATTRIBUTES) {
      const value = element.getAttribute(name);

      if (value !== null && !is_trusted(value)) {
        handlers.on_attribute(element, name);
        contained += 1;
      }
    }
  }

  const style = element.getAttribute("style");

  if (style !== null && CSS_FETCH_HINT.test(style)) {
    const restricted = restrict_css_urls(style, is_trusted);

    if (restricted.blocked) {
      handlers.on_style_attribute(element, style, restricted.css);
      contained += 1;
    }
  }

  if (element.localName.toLowerCase() === "style") {
    const css = element.textContent ?? "";
    const restricted = restrict_css_urls(css, is_trusted);

    if (restricted.blocked) {
      handlers.on_style_element(element, css, restricted.css);
      contained += 1;
    }
  }

  return contained;
}

export function contain_untrusted_sources(
  root: ParentNode,
  trusted_origins: ReadonlySet<string> = get_trusted_image_origins(),
  handlers: UntrustedSourceHandlers = REMOVE_UNTRUSTED_SOURCES,
): number {
  const elements = Array.from(root.querySelectorAll("*"));

  if (root instanceof Element) elements.unshift(root);

  return elements.reduce(
    (total, element) =>
      total + contain_element(element, trusted_origins, handlers),
    0,
  );
}

export function contain_untrusted_html(
  html: string,
  trusted_origins: ReadonlySet<string> = get_trusted_image_origins(),
): string {
  if (!html || typeof document === "undefined") return html;

  const template = document.createElement("template");

  template.innerHTML = html;
  contain_untrusted_sources(template.content, trusted_origins);

  return template.innerHTML;
}
