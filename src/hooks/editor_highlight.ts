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
const HIGHLIGHT_PROPERTIES = ["background-color", "background"];

const CONTENT_SELECTOR = "img, br, hr, table, video";

function is_element(node: Node | null): node is HTMLElement {
  return node !== null && node.nodeType === Node.ELEMENT_NODE;
}

export function has_highlight(element: Element): boolean {
  if (element.tagName === "MARK") return true;

  const style = (element as HTMLElement).style;

  if (!style) return false;

  return HIGHLIGHT_PROPERTIES.some(
    (property) => style.getPropertyValue(property).trim() !== "",
  );
}

function unwrap(element: Element): void {
  const parent = element.parentNode;

  if (!parent) return;

  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
}

function strip_element(element: HTMLElement): void {
  if (element.tagName === "MARK") {
    unwrap(element);

    return;
  }

  for (const property of HIGHLIGHT_PROPERTIES) {
    element.style.removeProperty(property);
  }

  if (!(element.getAttribute("style") || "").trim()) {
    element.removeAttribute("style");
  }

  if (element.tagName === "SPAN" && element.attributes.length === 0) {
    unwrap(element);
  }
}

export function strip_highlights(container: ParentNode): void {
  const elements = Array.from(container.querySelectorAll("*")).reverse();

  for (const element of elements) {
    if (is_element(element) && has_highlight(element)) {
      strip_element(element);
    }
  }

  if (is_element(container as Node) && has_highlight(container as Element)) {
    strip_element(container as HTMLElement);
  }
}

function has_content(node: Node): boolean {
  if ((node.textContent || "").length > 0) return true;

  if (is_element(node)) {
    return (
      node.matches(CONTENT_SELECTOR) || !!node.querySelector(CONTENT_SELECTOR)
    );
  }

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return !!(node as DocumentFragment).querySelector(CONTENT_SELECTOR);
  }

  return false;
}

function element_of(node: Node): HTMLElement | null {
  return is_element(node) ? node : node.parentElement;
}

function highlighted_ancestors(node: Node, root: HTMLElement): HTMLElement[] {
  const result: HTMLElement[] = [];

  for (
    let element = element_of(node);
    element && element !== root && root.contains(element);
    element = element.parentElement
  ) {
    if (has_highlight(element)) result.push(element);
  }

  return result;
}

function chain_between(
  top: HTMLElement,
  inner: HTMLElement | null,
): HTMLElement[] {
  const chain: HTMLElement[] = [];

  for (let element = inner; element; element = element.parentElement) {
    chain.unshift(element);
    if (element === top) break;
  }

  return chain;
}

function selection_range(first: Node, last: Node): Range {
  const range = document.createRange();

  range.setStartBefore(first);
  range.setEndAfter(last);

  return range;
}

function remove_at_caret(root: HTMLElement, range: Range): Range {
  const anchor = range.startContainer;
  const offset = range.startOffset;

  for (const element of highlighted_ancestors(anchor, root)) {
    strip_element(element);
  }

  const caret = document.createRange();

  if (anchor.isConnected && root.contains(anchor)) {
    caret.setStart(anchor, offset);
  } else {
    caret.selectNodeContents(root);
    caret.collapse(false);
  }
  caret.collapse(true);

  return caret;
}

export function remove_highlight_in_range(
  root: HTMLElement,
  range: Range,
): Range {
  if (range.collapsed) return remove_at_caret(root, range);

  const common = range.commonAncestorContainer;
  const ancestors = highlighted_ancestors(common, root);
  const top = ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;

  const selected = range.extractContents();
  let output: DocumentFragment = selected;

  if (top && top.parentNode) {
    const after_range = document.createRange();

    after_range.setStart(range.startContainer, range.startOffset);
    after_range.setEnd(top, top.childNodes.length);
    const after = after_range.extractContents();

    output = document.createDocumentFragment();
    let holder: Node = output;

    for (const element of chain_between(top, element_of(common))) {
      const clone = element.cloneNode(false);

      holder.appendChild(clone);
      holder = clone;
    }
    holder.appendChild(selected);
    strip_highlights(output);

    const parent = top.parentNode;
    const next_sibling = top.nextSibling;

    if (has_content(after)) {
      const after_clone = top.cloneNode(false);

      after_clone.appendChild(after);
      parent.insertBefore(after_clone, next_sibling);
    }

    const nodes = Array.from(output.childNodes);

    parent.insertBefore(output, top.nextSibling);
    if (!has_content(top)) top.remove();

    if (nodes.length === 0) return remove_at_caret(root, range);

    return selection_range(nodes[0], nodes[nodes.length - 1]);
  }

  strip_highlights(output);
  const nodes = Array.from(output.childNodes);

  range.insertNode(output);

  if (nodes.length === 0) return remove_at_caret(root, range);

  return selection_range(nodes[0], nodes[nodes.length - 1]);
}
