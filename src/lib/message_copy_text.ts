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

const ZERO_WIDTH_PATTERN = /[­͏؜ᅟᅠ឴឵᠎​-‏⁠-⁤ㅤ﻿]/g;

const SKIP_ATTRIBUTE = "data-aster-copy-skip";

const ALWAYS_SKIP_SELECTOR = [
  ".aster-quote-toggle",
  ".aster-forwarded-collapse > summary",
  ".remote-content-banner",
  "img.blocked-remote-image",
  "img[data-tracking-pixel='true']",
  "script",
  "style",
  "template",
  "[hidden]",
  "[aria-hidden='true']",
].join(",");

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIELDSET",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "TABLE",
  "TBODY",
  "THEAD",
  "TFOOT",
  "TR",
  "UL",
]);

export function strip_zero_width(text: string): string {
  return text.replace(ZERO_WIDTH_PATTERN, "");
}

function is_in_closed_details(element: Element): boolean {
  const start = element.tagName === "DETAILS" ? element.parentElement : element;
  const details = start?.closest("details");

  if (!details || details.hasAttribute("open")) return false;

  const summary = start?.closest("summary");

  return !summary || summary.parentElement !== details;
}

export function is_hidden_for_copy(element: Element): boolean {
  if (element.matches(ALWAYS_SKIP_SELECTOR)) return true;
  if (is_in_closed_details(element)) return true;

  const view = element.ownerDocument.defaultView;

  if (!view) return false;

  const style = view.getComputedStyle(element);

  if (style.display === "none") return true;
  if (style.visibility === "hidden" || style.visibility === "collapse") {
    return true;
  }
  if (style.opacity === "0") return true;
  if (style.fontSize === "0px" || style.fontSize === "0") return true;

  const max_height = style.maxHeight;

  return (
    (max_height === "0px" || max_height === "0") && style.overflow === "hidden"
  );
}

function mark_hidden_nodes(range: Range): Element[] {
  const root = range.commonAncestorContainer;
  const root_element =
    root.nodeType === Node.ELEMENT_NODE
      ? (root as Element)
      : root.parentElement;

  if (!root_element) return [];

  const marked: Element[] = [];
  const candidates = [
    root_element,
    ...Array.from(root_element.querySelectorAll("*")),
  ];

  for (const element of candidates) {
    if (!range.intersectsNode(element)) continue;
    if (element.parentElement?.closest(`[${SKIP_ATTRIBUTE}]`)) continue;
    if (!is_hidden_for_copy(element)) continue;
    element.setAttribute(SKIP_ATTRIBUTE, "");
    marked.push(element);
  }

  return marked;
}

function append_break(parts: string[]): void {
  const last = parts[parts.length - 1];

  if (parts.length === 0 || last.endsWith("\n")) return;
  parts.push("\n");
}

function serialize_node(node: Node, parts: string[], in_pre: boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = strip_zero_width(node.textContent || "");
    const text = in_pre ? raw : raw.replace(/\s+/g, " ");
    const last = parts[parts.length - 1];
    const at_line_start = parts.length === 0 || last.endsWith("\n");

    if (!in_pre && at_line_start && text.trim() === "") return;
    if (text) parts.push(text);

    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== 11) return;

  const element = node.nodeType === 11 ? null : (node as Element);
  const tag = element?.tagName ?? "";

  if (tag === "BR") {
    parts.push("\n");

    return;
  }

  if (tag === "IMG") {
    const alt = strip_zero_width(element?.getAttribute("alt") || "").trim();

    if (alt) parts.push(alt);

    return;
  }

  const is_block = BLOCK_TAGS.has(tag);
  const next_pre = in_pre || tag === "PRE";

  if (is_block) append_break(parts);

  node.childNodes.forEach((child, index) => {
    if (tag === "TR" && index > 0 && child.nodeType === Node.ELEMENT_NODE) {
      parts.push("\t");
    }
    serialize_node(child, parts, next_pre);
  });

  if (is_block) append_break(parts);
}

export function fragment_to_clean_text(fragment: DocumentFragment): string {
  const parts: string[] = [];

  serialize_node(fragment, parts, false);

  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, "").replace(/^ +/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function clean_range_for_copy(range: Range): {
  text: string;
  html: string;
} {
  const marked = mark_hidden_nodes(range);
  let fragment: DocumentFragment;

  try {
    fragment = range.cloneContents();
  } finally {
    marked.forEach((element) => element.removeAttribute(SKIP_ATTRIBUTE));
  }

  fragment
    .querySelectorAll(`[${SKIP_ATTRIBUTE}], ${ALWAYS_SKIP_SELECTOR}`)
    .forEach((element) => element.remove());

  const holder = range.startContainer.ownerDocument?.createElement("div");

  holder?.appendChild(fragment.cloneNode(true));

  return {
    text: fragment_to_clean_text(fragment),
    html: strip_zero_width(holder?.innerHTML ?? ""),
  };
}

export function handle_message_copy(
  event: ClipboardEvent,
  doc: Document,
): void {
  const selection = doc.getSelection();
  const data = event.clipboardData;

  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  if (!data) return;

  const range = selection.getRangeAt(0);
  const { text, html } = clean_range_for_copy(range);

  if (!text) return;

  event.preventDefault();
  data.setData("text/plain", text);
  if (html) data.setData("text/html", html);
}
