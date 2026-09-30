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
const FOOTER_HREF_SELECTOR = 'a[href^="https://astermail.org"]';
const FOOTER_LINK_TEXT = "Aster Mail";
const FOOTER_LABEL_MAX_LENGTH = 40;
const QUOTE_SCOPE_SELECTOR = "blockquote, .aster_quote, .gmail_quote";

function is_br(node: Node | null): boolean {
  return node?.nodeType === 1 && (node as Element).tagName === "BR";
}

function is_blank_text(node: Node | null): boolean {
  return node?.nodeType === 3 && !(node.textContent || "").trim();
}

function remove_footer_link(link: Element): boolean {
  if ((link.textContent || "").trim() !== FOOTER_LINK_TEXT) return false;
  const label = link.previousSibling;

  if (!label || label.nodeType !== 3) return false;
  const label_text = (label.textContent || "").trim();

  if (!label_text || label_text.length > FOOTER_LABEL_MAX_LENGTH) return false;
  let before: Node | null = label.previousSibling;

  while (is_blank_text(before)) before = before!.previousSibling;
  if (before && !is_br(before)) return false;

  while (is_br(before) || is_blank_text(before)) {
    const previous: Node | null = before!.previousSibling;

    before!.parentNode?.removeChild(before!);
    before = previous;
  }
  let after: Node | null = link.nextSibling;

  label.parentNode?.removeChild(label);
  link.parentNode?.removeChild(link);

  let kept_break = false;

  while (is_br(after) || is_blank_text(after)) {
    const next: Node | null = after!.nextSibling;

    if (is_br(after) && !kept_break && before) {
      kept_break = true;
    } else {
      after!.parentNode?.removeChild(after!);
    }
    after = next;
  }

  return true;
}

export function remove_aster_footers(
  root: ParentNode,
  quotes_only: boolean,
): void {
  const links = Array.from(root.querySelectorAll(FOOTER_HREF_SELECTOR));

  for (const link of links) {
    if (quotes_only && !link.closest(QUOTE_SCOPE_SELECTOR)) continue;
    remove_footer_link(link);
  }
}

export function strip_aster_footers_html(html: string): string {
  if (!html || !html.includes("astermail.org")) return html;
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  );

  if (!doc.body) return html;
  remove_aster_footers(doc.body, false);

  return doc.body.innerHTML;
}
