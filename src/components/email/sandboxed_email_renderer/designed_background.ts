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
import { is_transparent_color_value } from "@/lib/html_sanitizer";

const PAINTED_BACKGROUND_RE =
  /^(?:#[0-9a-f]|rgba?\(|hsla?\(|white\b|black\b|[a-z]+gr[ae]y\b)/i;
const INLINE_BACKGROUND_RE = /background(?:-color)?\s*:\s*([^;]+)/gi;
const PAGE_BACKGROUND_RE =
  /^(?:#f{3}|#f{6}|white|rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*1(?:\.0+)?\s*)?\))$/i;
const BOX_PROPERTY_RE =
  /^(?:padding(?:-[a-z]+)?|width|min-width|height|min-height)$/;
const ZERO_LENGTH_RE = /^0(?:\.0+)?[a-z%]*$/i;
const LAYOUT_TAGS = new Set([
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "center",
]);
const INLINE_TAGS = new Set([
  "a",
  "span",
  "mark",
  "font",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "small",
  "big",
  "sub",
  "sup",
  "code",
  "kbd",
  "samp",
  "tt",
  "var",
  "abbr",
  "cite",
  "dfn",
  "q",
  "time",
  "label",
]);
const SMALL_TEXT_SHARE = 0.1;

function is_painted_background(value: string): boolean {
  const trimmed = value.trim();

  return (
    PAINTED_BACKGROUND_RE.test(trimmed) && !is_transparent_color_value(trimmed)
  );
}

function has_painted_style(style: string): boolean {
  for (const match of style.matchAll(INLINE_BACKGROUND_RE)) {
    if (is_painted_background(match[1])) return true;
  }

  return false;
}

function text_length(node: Node): number {
  return (node.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

function sets_box_layout(style: string): boolean {
  return style.split(";").some((declaration) => {
    const separator = declaration.indexOf(":");

    if (separator === -1) return false;

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase();

    if (property === "display") return value !== "inline";

    return (
      BOX_PROPERTY_RE.test(property) &&
      !value.split(/\s+/).every((length) => ZERO_LENGTH_RE.test(length))
    );
  });
}

function is_box(element: Element, style: string): boolean {
  return (
    sets_box_layout(style) ||
    element.hasAttribute("width") ||
    element.hasAttribute("height") ||
    element.querySelector("img, table, video, svg") !== null
  );
}

function paints_design(element: Element, total_text: number): boolean {
  const tag = element.tagName.toLowerCase();
  const style = element.getAttribute("style") ?? "";
  const bgcolor = element.getAttribute("bgcolor");
  const painted_by_attribute = !!bgcolor && is_painted_background(bgcolor);

  if (!painted_by_attribute && !has_painted_style(style)) return false;
  if (painted_by_attribute || LAYOUT_TAGS.has(tag)) return true;
  if (is_box(element, style)) return true;
  if (INLINE_TAGS.has(tag)) return false;

  return text_length(element) > total_text * SMALL_TEXT_SHARE;
}

export function has_designed_background(
  html: string,
  body_background?: string,
): boolean {
  if (
    body_background &&
    is_painted_background(body_background) &&
    !PAGE_BACKGROUND_RE.test(body_background.trim())
  ) {
    return true;
  }

  if (!/background|bgcolor/i.test(html)) return false;
  if (typeof DOMParser === "undefined") return false;

  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("style, script").forEach((node) => node.remove());
  const total_text = text_length(doc.body);

  for (const element of Array.from(
    doc.body.querySelectorAll("[style], [bgcolor]"),
  )) {
    if (paints_design(element, total_text)) return true;
  }

  return false;
}
