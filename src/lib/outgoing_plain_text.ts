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
import { repair_comment_markup } from "./html_sanitizer_utils";

const SOFT_BREAK = "\u0000";

const SKIPPED_TAGS = new Set([
  "EMBED",
  "HEAD",
  "IFRAME",
  "LINK",
  "META",
  "NOSCRIPT",
  "OBJECT",
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "TITLE",
]);

const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "CENTER",
  "DD",
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
  "MAIN",
  "NAV",
  "OL",
  "P",
  "SECTION",
  "TABLE",
  "TBODY",
  "TFOOT",
  "THEAD",
  "TR",
  "UL",
]);

const MAX_QUOTE_DEPTH = 8;

const MAX_ELEMENT_DEPTH = 256;

const LINE_BOUNDARY_TAGS = new Set([
  ...BLOCK_TAGS,
  "BLOCKQUOTE",
  "BR",
  "LI",
  "PRE",
  "TD",
  "TH",
]);

interface RenderContext {
  preformatted: boolean;
  quote_depth: number;
  depth: number;
}

const SOURCE_WHITESPACE_RUN = /[ \t\r\n\f]+/g;

const SOURCE_LINE_BREAK = /[\r\n]/;

function trim_trailing_spaces(text: string): string {
  let end = text.length;

  while (end > 0 && (text[end - 1] === " " || text[end - 1] === "\t")) {
    end -= 1;
  }

  return end === text.length ? text : text.slice(0, end);
}

function resolve_breaks(text: string): string {
  const pieces = text.split(SOFT_BREAK);
  const out: string[] = [];
  let last_char = "";

  pieces.forEach((piece, index) => {
    if (index > 0 && last_char !== "" && last_char !== "\n") {
      out.push("\n");
      last_char = "\n";
    }

    const kept =
      index < pieces.length - 1 ? trim_trailing_spaces(piece) : piece;

    if (kept.length > 0) {
      out.push(kept);
      last_char = kept[kept.length - 1];
    }
  });

  return out.join("");
}

function is_line_boundary(sibling: Node | null, parent: Node | null): boolean {
  if (sibling) {
    return (
      sibling.nodeType === 1 &&
      LINE_BOUNDARY_TAGS.has((sibling as Element).tagName.toUpperCase())
    );
  }

  if (!parent || parent.nodeType !== 1) return true;

  const tag = (parent as Element).tagName.toUpperCase();

  return tag === "BODY" || LINE_BOUNDARY_TAGS.has(tag);
}

function render_text(node: Text, context: RenderContext): string {
  const data = node.data.replace(/\u0000/g, "").replace(/\u00a0/g, " ");

  if (context.preformatted || !SOURCE_LINE_BREAK.test(data)) return data;

  let text = data.replace(SOURCE_WHITESPACE_RUN, " ");

  if (is_line_boundary(node.previousSibling, node.parentNode)) {
    text = text.trimStart();
  }
  if (is_line_boundary(node.nextSibling, node.parentNode)) {
    text = text.trimEnd();
  }

  return text;
}

function link_suffix(anchor: Element, label: string): string {
  const href = (anchor.getAttribute("href") ?? "").trim();

  if (!/^https?:\/\//i.test(href)) return "";
  if (label.replace(/\s+/g, "").includes(href)) return "";
  if (!label.trim()) return href;

  return ` <${href}>`;
}

function render_children(node: Node, context: RenderContext): string {
  const child_context = { ...context, depth: context.depth + 1 };
  let out = "";

  for (const child of Array.from(node.childNodes)) {
    out += render_node(child, child_context);
  }

  return out;
}

function render_list(list: Element, context: RenderContext): string {
  const child_context = { ...context, depth: context.depth + 1 };
  const ordered = list.tagName.toUpperCase() === "OL";
  const start = Number.parseInt(list.getAttribute("start") ?? "1", 10);
  let number = Number.isFinite(start) ? start : 1;
  let out = SOFT_BREAK;

  for (const child of Array.from(list.childNodes)) {
    if (child.nodeType === 1 && (child as Element).tagName === "LI") {
      const marker = ordered ? `${number}. ` : "- ";

      number += 1;
      out +=
        SOFT_BREAK +
        marker +
        render_children(child, child_context) +
        SOFT_BREAK;
    } else {
      out += render_node(child, child_context);
    }
  }

  return out + SOFT_BREAK;
}

function collect_text(root: Node): string {
  const parts: string[] = [];
  const stack: Node[] = [root];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.nodeType === 3) {
      parts.push((node as Text).data);
    } else if (
      node.nodeType === 1 &&
      !SKIPPED_TAGS.has((node as Element).tagName.toUpperCase())
    ) {
      const children = node.childNodes;

      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
  }

  return parts.join("").replace(/\u0000/g, "");
}

function render_node(node: Node, context: RenderContext): string {
  if (node.nodeType === 3) return render_text(node as Text, context);

  if (node.nodeType !== 1) return "";

  const element = node as Element;
  const tag = element.tagName.toUpperCase();

  if (SKIPPED_TAGS.has(tag)) return "";

  if (context.depth > MAX_ELEMENT_DEPTH) {
    return collect_text(element).replace(SOURCE_WHITESPACE_RUN, " ");
  }

  if (tag === "BR") return "\n";

  if (tag === "IMG") {
    const alt = (element.getAttribute("alt") ?? "").trim();

    return alt ? `[${alt}]` : "";
  }

  if (tag === "PRE") {
    return (
      SOFT_BREAK +
      render_children(element, { ...context, preformatted: true }) +
      SOFT_BREAK
    );
  }

  if (tag === "BLOCKQUOTE" && context.quote_depth < MAX_QUOTE_DEPTH) {
    const inner = resolve_breaks(
      render_children(element, {
        ...context,
        quote_depth: context.quote_depth + 1,
      }),
    )
      .replace(/^\n+/, "")
      .trimEnd();
    const quoted = inner
      .split("\n")
      .map((line) => (line.length > 0 ? `> ${line}` : ">"))
      .join("\n");

    return SOFT_BREAK + quoted + SOFT_BREAK;
  }

  if (tag === "OL" || tag === "UL") return render_list(element, context);

  if (tag === "LI") {
    return SOFT_BREAK + "- " + render_children(element, context) + SOFT_BREAK;
  }

  if (tag === "TD" || tag === "TH") {
    return render_children(element, context) + " ";
  }

  if (tag === "A") {
    const label = render_children(element, context);

    return label + link_suffix(element, label);
  }

  const content = render_children(element, context);

  return BLOCK_TAGS.has(tag) || tag === "BLOCKQUOTE"
    ? SOFT_BREAK + content + SOFT_BREAK
    : content;
}

export function outgoing_html_to_plain_text(html: string): string {
  if (!html) return "";

  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><body>${repair_comment_markup(html)}`,
    "text/html",
  );

  return resolve_breaks(
    render_children(doc.body, {
      preformatted: false,
      quote_depth: 0,
      depth: 0,
    }),
  )
    .replace(/^\n+/, "")
    .trimEnd();
}
