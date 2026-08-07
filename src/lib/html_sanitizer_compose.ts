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
import DOMPurify from "dompurify";

import { sanitize_compose_style, is_transparent_color_value } from "./html_sanitizer_css";

const BACKGROUND_DECLARATION_RE = /background(?:-color)?\s*:\s*[^;]+;?/gi;

export function strip_transparent_backgrounds(el: Element): void {
  const style_attr = el.getAttribute("style");

  if (!style_attr || !/background/i.test(style_attr)) return;

  const matches = [...style_attr.matchAll(BACKGROUND_DECLARATION_RE)];

  if (matches.length === 0) return;
  const last_offset = matches[matches.length - 1].index;

  const cleaned = style_attr
    .replace(BACKGROUND_DECLARATION_RE, (declaration, offset) => {
      if (offset !== last_offset) return declaration;

      const value = declaration
        .slice(declaration.indexOf(":") + 1)
        .replace(/;\s*$/, "")
        .trim();

      return is_transparent_color_value(value) ? "" : declaration;
    })
    .trim()
    .replace(/^;+|;+$/g, "")
    .trim();

  if (cleaned) {
    el.setAttribute("style", cleaned);
  } else {
    el.removeAttribute("style");
  }
}

const OUTGOING_URI_REGEXP =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const OUTGOING_DANGEROUS_HREF = /^\s*(?:javascript|vbscript|data|blob|file):/i;

function is_removable_trailing_node(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return !(node.textContent || "").trim();
  }
  if (node.nodeType === Node.COMMENT_NODE) return true;
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;

  if (el.tagName === "BR") return true;
  if (!["DIV", "P", "SECTION", "SPAN"].includes(el.tagName)) return false;
  if ((el.textContent || "").trim()) return false;
  if (el.querySelector("img,hr,table,iframe,svg,video,object,embed,input,button")) {
    return false;
  }

  return !/background|height|border|padding/i.test(el.getAttribute("style") || "");
}

export function trim_trailing_empty_nodes(body: HTMLElement): void {
  let container: Element = body;

  for (;;) {
    let last: Node | null = container.lastChild;

    while (last && is_removable_trailing_node(last)) {
      const removed = last;

      last = last.previousSibling;
      removed.parentNode?.removeChild(removed);
    }
    if (
      last &&
      last.nodeType === Node.ELEMENT_NODE &&
      ["DIV", "P"].includes((last as Element).tagName) &&
      !(last as Element).matches(
        '[class*="quote" i], [class*="cite" i], blockquote[type="cite"]',
      )
    ) {
      container = last as Element;
      continue;
    }
    break;
  }
}

export function sanitize_outgoing_html(html: string): string {
  if (!html || typeof html !== "string") return "";

  const purified = DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: OUTGOING_URI_REGEXP,
  });

  const doc = new DOMParser().parseFromString(purified, "text/html");

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const elements: Element[] = [];

  while (walker.nextNode()) {
    elements.push(walker.currentNode as Element);
  }

  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) {
        el.removeAttribute(attr.name);
      }
    }

    for (const name of ["href", "xlink:href"]) {
      const value = el.getAttribute(name);

      if (value && OUTGOING_DANGEROUS_HREF.test(value)) {
        el.removeAttribute(name);
      }
    }

    strip_transparent_backgrounds(el);
  }

  trim_trailing_empty_nodes(doc.body);

  return doc.body.innerHTML;
}

export function sanitize_compose_paste(html: string): string {
  if (!html || typeof html !== "string") return "";

  const purified = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "a",
      "b",
      "strong",
      "i",
      "em",
      "u",
      "s",
      "strike",
      "del",
      "p",
      "br",
      "div",
      "span",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "td",
      "th",
      "caption",
      "col",
      "colgroup",
      "img",
      "hr",
      "sub",
      "sup",
      "font",
      "center",
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "src",
      "alt",
      "width",
      "height",
      "style",
      "colspan",
      "rowspan",
      "span",
      "align",
      "valign",
      "bgcolor",
      "cellpadding",
      "cellspacing",
      "border",
      "color",
      "face",
      "size",
    ],
    ALLOW_DATA_ATTR: false,
  });

  return apply_compose_paste_dom_rules(purified);
}

export function apply_compose_paste_dom_rules(purified: string): string {
  const doc = new DOMParser().parseFromString(purified, "text/html");

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const nodes_to_process: Element[] = [];

  while (walker.nextNode()) {
    nodes_to_process.push(walker.currentNode as Element);
  }

  for (const el of nodes_to_process) {
    el.removeAttribute("class");
    el.removeAttribute("id");

    for (const attr of Array.from(el.attributes)) {
      if (
        attr.name.startsWith("docs-internal-") ||
        attr.name.startsWith("data-")
      ) {
        el.removeAttribute(attr.name);
      }
    }

    if (el.tagName === "FONT") {
      const span = doc.createElement("span");
      const color = el.getAttribute("color");
      const face = el.getAttribute("face");
      const size = el.getAttribute("size");
      const styles: string[] = [];

      const css_value_is_safe = (value: string) => !/[;:(){}<>\\]/.test(value);

      if (color && css_value_is_safe(color)) styles.push(`color: ${color}`);
      if (face && css_value_is_safe(face)) styles.push(`font-family: ${face}`);
      if (size) {
        const size_map: Record<string, string> = {
          "1": "10px",
          "2": "13px",
          "3": "16px",
          "4": "18px",
          "5": "24px",
          "6": "32px",
          "7": "48px",
        };

        if (size_map[size]) styles.push(`font-size: ${size_map[size]}`);
      }

      if (styles.length > 0) span.setAttribute("style", styles.join("; "));

      while (el.firstChild) span.appendChild(el.firstChild);

      el.parentNode?.replaceChild(span, el);
    }

    const style_attr = el.getAttribute("style");

    if (style_attr) {
      let cleaned = style_attr;

      cleaned = cleaned.replace(/mso-[^:]+:[^;]+;?/gi, "");
      cleaned = sanitize_compose_style(cleaned);

      if (cleaned) {
        el.setAttribute("style", cleaned);
      } else {
        el.removeAttribute("style");
      }
    }

    if (el.tagName === "A") {
      const href = el.getAttribute("href") || "";
      const lower = href.trim().toLowerCase();

      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("vbscript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("file:")
      ) {
        el.removeAttribute("href");
      }

      if (el.hasAttribute("href")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer nofollow");
      } else {
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
    }

    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") || "";

      if (src.startsWith("data:image/svg")) {
        el.parentNode?.removeChild(el);
        continue;
      }

      if (src.startsWith("data:")) {
        const size_estimate = Math.ceil((src.length * 3) / 4);

        if (size_estimate > 2 * 1024 * 1024) {
          el.parentNode?.removeChild(el);
          continue;
        }

        (el as HTMLElement).style.maxWidth = "100%";
        (el as HTMLElement).style.height = "auto";
      }
    }
  }

  const o_tags = [
    ...Array.from(doc.body.getElementsByTagName("o:p")),
    ...Array.from(doc.body.getElementsByTagName("o:smarttags")),
  ];

  for (const tag of o_tags) {
    while (tag.firstChild) tag.parentNode?.insertBefore(tag.firstChild, tag);

    tag.parentNode?.removeChild(tag);
  }

  const style_tags = doc.body.querySelectorAll("style");

  for (const tag of Array.from(style_tags)) {
    tag.parentNode?.removeChild(tag);
  }

  return doc.body.innerHTML;
}
