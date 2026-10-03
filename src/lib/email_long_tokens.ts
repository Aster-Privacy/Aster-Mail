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
export const LONG_TOKEN_MARK = "data-aster-long-token";

export const LONG_TOKEN_MIN_LENGTH = 30;

const LONG_TOKEN_PATTERN = new RegExp(`\\S{${LONG_TOKEN_MIN_LENGTH},}`, "g");

const SKIPPED_PARENTS = new Set(["STYLE", "SCRIPT", "TEXTAREA", "TITLE"]);

function token_width(node: Text, start: number, end: number): number {
  const range = node.ownerDocument.createRange();

  range.setStart(node, start);
  range.setEnd(node, end);

  return range.getBoundingClientRect().width;
}

function has_overflowing_token(node: Text, max_width: number): boolean {
  const value = node.nodeValue || "";

  for (const match of value.matchAll(LONG_TOKEN_PATTERN)) {
    const start = match.index ?? 0;

    if (token_width(node, start, start + match[0].length) > max_width) {
      return true;
    }
  }

  return false;
}

export function mark_long_tokens(root: Element, max_width: number): boolean {
  if (!(max_width > 0)) return false;

  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const to_mark = new Set<Element>();

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;

    if (!parent || parent === root || to_mark.has(parent)) continue;
    if (parent.hasAttribute(LONG_TOKEN_MARK)) continue;
    if (SKIPPED_PARENTS.has(parent.tagName)) continue;
    if ((node.nodeValue || "").length < LONG_TOKEN_MIN_LENGTH) continue;
    if (parent.closest("pre")) continue;
    if (!has_overflowing_token(node as Text, max_width)) continue;

    to_mark.add(parent);
  }

  for (const element of to_mark) element.setAttribute(LONG_TOKEN_MARK, "1");

  return to_mark.size > 0;
}
