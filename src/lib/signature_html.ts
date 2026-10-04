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
export const COMPOSE_CARET_BLOCK = "<div><br></div>";

export const SIGNATURE_GAP_BLOCK = "<div><br></div>";

const SIGNATURE_MARKER = '<div data-aster-signature="1"';

export interface SignatureHtmlSource {
  id: string;
  content: string;
  is_html: boolean;
}

function escape_plain_signature(content: string): string {
  return content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>");
}

const SOURCE_LINE_BREAK = /[\r\n]/;

const SOURCE_LINE_BREAK_RUN = /[ \t\f]*(?:\r\n?|\n)[ \t\r\n\f]*/g;

const LITERAL_WHITESPACE_TAGS = new Set(["PRE", "TEXTAREA", "LISTING"]);

const LITERAL_WHITESPACE_STYLE = /white-space\s*:\s*(?:pre|break-spaces)/i;

const BLOCK_BOUNDARY_TAGS = new Set([
  "ADDRESS",
  "BLOCKQUOTE",
  "BR",
  "CAPTION",
  "CENTER",
  "COL",
  "COLGROUP",
  "DD",
  "DIV",
  "DL",
  "DT",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "LI",
  "OL",
  "P",
  "PRE",
  "TABLE",
  "TBODY",
  "TD",
  "TFOOT",
  "TH",
  "THEAD",
  "TR",
  "UL",
]);

function keeps_literal_whitespace(node: Node, root: Element): boolean {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) {
    if (LITERAL_WHITESPACE_TAGS.has(el.tagName)) return true;
    if (LITERAL_WHITESPACE_STYLE.test(el.getAttribute("style") || "")) {
      return true;
    }
  }

  return false;
}

function is_block_boundary(
  sibling: Node | null,
  parent: Element,
  root: Element,
): boolean {
  if (sibling) {
    return (
      sibling.nodeType === 1 &&
      BLOCK_BOUNDARY_TAGS.has((sibling as Element).tagName)
    );
  }

  return parent === root || BLOCK_BOUNDARY_TAGS.has(parent.tagName);
}

function collapse_source_whitespace(html: string): string {
  if (!SOURCE_LINE_BREAK.test(html)) return html;

  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><body>${html}`,
    "text/html",
  );
  const holder = doc.body;
  const walker = doc.createTreeWalker(holder, NodeFilter.SHOW_TEXT);
  const text_nodes: Text[] = [];

  while (walker.nextNode()) {
    text_nodes.push(walker.currentNode as Text);
  }

  for (const node of text_nodes) {
    const parent = node.parentElement;

    if (!parent || !SOURCE_LINE_BREAK.test(node.data)) continue;
    if (keeps_literal_whitespace(node, holder)) continue;

    let text = node.data.replace(SOURCE_LINE_BREAK_RUN, " ");

    if (is_block_boundary(node.previousSibling, parent, holder)) {
      text = text.replace(/^ +/, "");
    }
    if (is_block_boundary(node.nextSibling, parent, holder)) {
      text = text.replace(/ +$/, "");
    }

    if (text) {
      node.data = text;
    } else {
      node.remove();
    }
  }

  return holder.innerHTML;
}

export function format_signature_html(
  signature: SignatureHtmlSource | null,
  show_separator: boolean,
): string {
  if (!signature) return "";

  const content = signature.is_html
    ? collapse_source_whitespace(signature.content)
    : escape_plain_signature(signature.content);
  const separator = show_separator ? "--<br>" : "";

  return `<div data-aster-signature="1" data-aster-signature-id="${signature.id}">${separator}${content}</div>`;
}

export function with_caret_block(
  html: string,
  caret_block: string = COMPOSE_CARET_BLOCK,
): string {
  if (!html) return html;

  if (html.startsWith(SIGNATURE_MARKER)) {
    return caret_block + SIGNATURE_GAP_BLOCK + html;
  }

  return caret_block + html;
}

function is_empty_block(node: ChildNode | null): boolean {
  if (!node || node.nodeType !== 1) return false;
  const element = node as Element;

  if (element.tagName !== "DIV" && element.tagName !== "P") return false;
  if (element.hasAttribute("data-aster-signature")) return false;

  return (
    !element.textContent?.trim() &&
    !element.querySelector("img, video, table, hr, blockquote")
  );
}

function create_empty_block(editor: HTMLElement): HTMLElement {
  const block = editor.ownerDocument.createElement("div");

  block.appendChild(editor.ownerDocument.createElement("br"));

  return block;
}

export function insert_signature_node(
  editor: HTMLElement,
  signature_node: Element,
): void {
  const first = editor.firstChild;

  if (first && is_empty_block(first)) {
    const second = first.nextSibling;

    if (second && is_empty_block(second)) {
      editor.insertBefore(signature_node, second.nextSibling);

      return;
    }

    const gap = create_empty_block(editor);

    editor.insertBefore(gap, second);
    editor.insertBefore(signature_node, gap.nextSibling);

    return;
  }

  const caret = create_empty_block(editor);
  const gap = create_empty_block(editor);

  editor.insertBefore(caret, first);
  editor.insertBefore(gap, caret.nextSibling);
  editor.insertBefore(signature_node, gap.nextSibling);
}

export function append_signature_node(
  editor: HTMLElement,
  signature_node: Element,
): void {
  const has_content = Array.from(editor.childNodes).some((node) =>
    node.nodeType === 1 ? !is_empty_block(node) : !!node.textContent?.trim(),
  );

  if (!has_content) {
    insert_signature_node(editor, signature_node);

    return;
  }

  const last = editor.lastChild;

  if (!is_empty_block(last)) {
    editor.appendChild(create_empty_block(editor));
  }
  editor.appendChild(signature_node);
}

export function has_typed_content(editor: HTMLElement | null): boolean {
  if (!editor) return false;

  return (
    !!editor.textContent?.trim() ||
    !!editor.querySelector("img, video, table, hr, blockquote")
  );
}

export function append_template_after_typed_text(
  editor: HTMLElement,
  template_html: string,
): void {
  const holder = editor.ownerDocument.createElement("div");

  holder.innerHTML = template_html;

  const caret_line = holder.firstChild;

  if (caret_line && is_empty_block(caret_line)) caret_line.remove();

  editor.append(...Array.from(holder.childNodes));
}

export function remove_signature_node(signature_node: Element): void {
  const gap = signature_node.previousSibling;

  if (gap && is_empty_block(gap) && gap.previousSibling) {
    gap.remove();
  }
  signature_node.remove();
}

const RICH_SIGNATURE_SELECTOR = [
  "img",
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "del",
  "sub",
  "sup",
  "font",
  "center",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "hr",
  "[style]",
  "[align]",
].join(", ");

const PLAIN_SIGNATURE_LINE_SELECTOR = "div, p";

export interface EditorSignatureContent {
  content: string;
  is_html: boolean;
}

export function signature_from_editor_html(
  html: string,
): EditorSignatureContent {
  const trimmed = html.trim();
  const temp = document.createElement("div");

  temp.innerHTML = trimmed;

  if (temp.querySelector(RICH_SIGNATURE_SELECTOR)) {
    return { content: trimmed, is_html: true };
  }

  temp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  temp.querySelectorAll(PLAIN_SIGNATURE_LINE_SELECTOR).forEach((block) => {
    block.before("\n");
    block.replaceWith(...block.childNodes);
  });

  const content = (temp.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

  return { content, is_html: false };
}
