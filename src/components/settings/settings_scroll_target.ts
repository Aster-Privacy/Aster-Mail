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

const FIRST_ATTEMPT_MS = 120;
const RETRY_INTERVAL_MS = 150;
const MAX_ATTEMPTS = 25;

const SKIPPED_TAGS = ["script", "style", "input", "textarea"];

function is_visually_hidden(element: HTMLElement, container: HTMLElement) {
  let current: HTMLElement | null = element;

  while (current) {
    if (current.hidden) return true;
    if (current.style.display === "none") return true;
    if (current.style.visibility === "hidden") return true;
    if (current.getAttribute("aria-hidden") === "true") return true;
    if (current === container) return false;
    current = current.parentElement;
  }

  return false;
}

export function find_scroll_target(
  container: HTMLElement,
  label: string,
): HTMLElement | null {
  const lower = label.trim().toLowerCase();

  if (lower === "") return null;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName.toLowerCase();

      if (tag && SKIPPED_TAGS.includes(tag)) return NodeFilter.FILTER_REJECT;

      return node.textContent?.toLowerCase().includes(lower)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  let exact: HTMLElement | null = null;
  let closest: HTMLElement | null = null;
  let closest_length = Number.POSITIVE_INFINITY;

  for (
    let node = walker.nextNode() as Text | null;
    node;
    node = walker.nextNode() as Text | null
  ) {
    const element = node.parentElement;

    if (!element) continue;
    if (is_visually_hidden(element, container)) continue;

    const text = (node.textContent ?? "").trim().toLowerCase();

    if (text === lower) {
      exact = element;
      break;
    }

    if (text.length < closest_length) {
      closest = element;
      closest_length = text.length;
    }
  }

  return exact ?? closest;
}

export function start_scroll_seek(
  container: HTMLElement,
  label: string,
  on_settled: (target: HTMLElement | null) => void,
): () => void {
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const attempt = () => {
    attempts += 1;
    const target = find_scroll_target(container, label);

    if (target || attempts >= MAX_ATTEMPTS) {
      on_settled(target);

      return;
    }
    timer = setTimeout(attempt, RETRY_INTERVAL_MS);
  };

  timer = setTimeout(attempt, FIRST_ATTEMPT_MS);

  return () => {
    if (timer) clearTimeout(timer);
  };
}
