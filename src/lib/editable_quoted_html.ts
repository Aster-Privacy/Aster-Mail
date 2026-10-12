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

const PARKED_SOURCE_ATTRIBUTE = "data-aster-parked-src";
const INLINE_REFERENCE_PATTERN = /^cid:/i;
const REMOTE_SOURCE_PATTERN = /^(?:https?:)?\/\//i;

export interface EditableQuotedHtmlOptions {
  block_remote_images: boolean;
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
    const source = image.getAttribute("src") ?? "";
    const is_inline_reference = INLINE_REFERENCE_PATTERN.test(source);
    const is_blocked_remote =
      options.block_remote_images && REMOTE_SOURCE_PATTERN.test(source);

    image.removeAttribute("srcset");

    if (!is_inline_reference && !is_blocked_remote) return;

    image.setAttribute(PARKED_SOURCE_ATTRIBUTE, source);
    image.removeAttribute("src");
  });

  return template.content;
}

export function read_editable_quoted_html(container: HTMLElement): string {
  const copy = container.cloneNode(true) as HTMLElement;

  copy.querySelectorAll(`[${PARKED_SOURCE_ATTRIBUTE}]`).forEach((element) => {
    const source = element.getAttribute(PARKED_SOURCE_ATTRIBUTE) ?? "";

    element.removeAttribute(PARKED_SOURCE_ATTRIBUTE);
    if (element.tagName === "IMG" && source) {
      element.setAttribute("src", source);
    }
  });

  return restore_compose_image_sources(copy.innerHTML);
}
