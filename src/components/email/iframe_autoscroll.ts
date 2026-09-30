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
import type { ScrollTarget } from "@/lib/autoscroll";

import {
  document_target,
  element_target,
  is_scrollable,
  start_autoscroll_session,
} from "@/lib/autoscroll";

const resolve_target = (iframe: HTMLIFrameElement): ScrollTarget | null => {
  const inner_doc = iframe.contentDocument;

  if (inner_doc) {
    const inner = document_target(inner_doc);

    if (inner) return inner;
  }

  let node: Element | null = iframe.parentElement;

  while (node) {
    if (is_scrollable(node, "y") || is_scrollable(node, "x")) {
      return element_target(node);
    }
    node = node.parentElement;
  }

  const root = document.scrollingElement;

  if (root && root.scrollHeight > root.clientHeight + 1) {
    return document_target(document);
  }

  return null;
};

export const start_iframe_autoscroll = (
  iframe: HTMLIFrameElement,
  origin_client_x: number,
  origin_client_y: number,
): boolean => {
  const target = resolve_target(iframe);

  if (!target) return false;

  const rect = iframe.getBoundingClientRect();

  return start_autoscroll_session(
    target,
    rect.left + origin_client_x,
    rect.top + origin_client_y,
    iframe.contentDocument,
    () => {
      const current = iframe.getBoundingClientRect();

      return { left: current.left, top: current.top };
    },
  );
};
