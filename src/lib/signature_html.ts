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

export function format_signature_html(
  signature: SignatureHtmlSource | null,
  show_separator: boolean,
): string {
  if (!signature) return "";

  const content = signature.is_html
    ? signature.content
    : escape_plain_signature(signature.content);
  const separator = show_separator ? "--<br>" : "";

  return `<div data-aster-signature="1" data-aster-signature-id="${signature.id}">${separator}${content}</div>`;
}

export function with_caret_block(html: string): string {
  if (!html) return html;

  return COMPOSE_CARET_BLOCK + html;
}

function is_empty_block(node: ChildNode | null): boolean {
  if (!node || node.nodeType !== 1) return false;
  const element = node as Element;

  if (element.hasAttribute("data-aster-signature")) return false;

  return (
    !element.textContent?.trim() &&
    !element.querySelector("img, video, table, hr, blockquote")
  );
}

export function insert_signature_node(
  editor: HTMLElement,
  signature_node: Element,
): void {
  const first = editor.firstChild;

  if (first && is_empty_block(first)) {
    editor.insertBefore(signature_node, first.nextSibling);

    return;
  }

  const caret = editor.ownerDocument.createElement("div");

  caret.appendChild(editor.ownerDocument.createElement("br"));
  editor.insertBefore(caret, first);
  editor.insertBefore(signature_node, caret.nextSibling);
}
