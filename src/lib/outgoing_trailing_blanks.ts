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
import { strip_outgoing_markers } from "./outgoing_markers";

const DESCEND_TAGS = new Set(["DIV", "P", "SECTION", "SPAN", "FONT"]);

const BLANK_TAGS = new Set([
  "DIV",
  "P",
  "SECTION",
  "SPAN",
  "FONT",
  "B",
  "I",
  "U",
  "EM",
  "STRONG",
]);

const MEDIA_SELECTOR =
  "img,video,picture,audio,table,hr,iframe,svg,object,embed,input,button";

const SPACER_STYLE_RE = /background|height|border|padding/i;

const QUOTE_SELECTOR =
  ".aster_quote, .gmail_quote, .protonmail_quote, .yahoo_quoted, blockquote";

const INVISIBLE_CHARS_RE = /[​‌‍⁠﻿]/g;

function has_visible_text(node: Node): boolean {
  return (
    (node.textContent || "").replace(INVISIBLE_CHARS_RE, "").trim().length > 0
  );
}

function is_empty_fragment(el: Element): boolean {
  return !has_visible_text(el) && !el.querySelector(MEDIA_SELECTOR);
}

function is_empty_quote(el: Element): boolean {
  if (!el.matches(".aster_quote")) return false;

  const quote_body = el.querySelector(".aster_quote_body");

  return quote_body ? is_empty_fragment(quote_body) : is_empty_fragment(el);
}

function is_blank_node(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return !has_visible_text(node);
  if (node.nodeType === Node.COMMENT_NODE) return true;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const el = node as Element;

  if (el.tagName === "BR") return true;
  if (is_empty_quote(el)) return true;
  if (!BLANK_TAGS.has(el.tagName)) return false;
  if (el.matches(QUOTE_SELECTOR)) return false;
  if (SPACER_STYLE_RE.test(el.getAttribute("style") || "")) return false;

  return is_empty_fragment(el);
}

function trim_trailing_nodes(root: Node): boolean {
  let changed = false;
  let container: Node = root;

  for (;;) {
    let last = container.lastChild;

    while (last && is_blank_node(last)) {
      const previous: ChildNode | null = last.previousSibling;

      last.remove();
      changed = true;
      last = previous;
    }

    if (
      last &&
      last.nodeType === Node.ELEMENT_NODE &&
      DESCEND_TAGS.has((last as Element).tagName) &&
      !(last as Element).matches(QUOTE_SELECTOR)
    ) {
      container = last as Element;
      continue;
    }

    return changed;
  }
}

export function trim_outgoing_trailing_blanks(html: string): string {
  if (!html || typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );

  if (!doc.body || !trim_trailing_nodes(doc.body)) return html;

  return doc.body.innerHTML;
}

export function prepare_outgoing_html(html: string): string {
  return trim_outgoing_trailing_blanks(strip_outgoing_markers(html));
}
