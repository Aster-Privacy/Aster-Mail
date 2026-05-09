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

import { sanitize_compose_style } from "./html_sanitizer_css";

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
      "img",
      "hr",
      "sub",
      "sup",
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
      "align",
      "valign",
      "cellpadding",
      "cellspacing",
      "border",
    ],
    ALLOW_DATA_ATTR: false,
  });

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

      if (color) styles.push(`color: ${color}`);
      if (face) styles.push(`font-family: ${face}`);
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

  const o_tags = doc.body.querySelectorAll("o\\:p, o\\:smarttags");

  for (const tag of Array.from(o_tags)) {
    while (tag.firstChild) tag.parentNode?.insertBefore(tag.firstChild, tag);

    tag.parentNode?.removeChild(tag);
  }

  const style_tags = doc.body.querySelectorAll("style");

  for (const tag of Array.from(style_tags)) {
    tag.parentNode?.removeChild(tag);
  }

  return doc.body.innerHTML;
}
