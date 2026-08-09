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
import { start_iframe_autoscroll } from "@/components/email/iframe_autoscroll";
import { forward_iframe_outside_interaction } from "@/lib/iframe_outside_interaction";

export function attach_iframe_interactions(
  iframe: HTMLIFrameElement,
  iframe_doc: Document,
  iframe_body: HTMLElement,
  update_height: () => void,
  zoom_fn_ref: { current: ((src: string | null) => void) | null },
): void {
  forward_iframe_outside_interaction(iframe_doc);

  iframe_doc.addEventListener(
    "wheel",
    (e) => {
      const container = iframe.parentElement;

      if (!container) return;

      const scroller = iframe_doc?.scrollingElement;

      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
        const at_top = scroller.scrollTop <= 0;
        const at_bottom =
          scroller.scrollTop + scroller.clientHeight >=
          scroller.scrollHeight - 1;

        if ((e.deltaY < 0 && !at_top) || (e.deltaY > 0 && !at_bottom)) return;
      }

      container.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { passive: true },
  );

  const find_outer_scroller = (): HTMLElement | null => {
    let node = iframe.parentElement;

    while (node) {
      const overflow_y = window.getComputedStyle(node).overflowY;

      if (
        (overflow_y === "auto" || overflow_y === "scroll") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
  };

  iframe_doc.addEventListener("mousedown", (e) => {
    const event = e as MouseEvent;

    if (event.button !== 1) return;

    event.preventDefault();

    if (start_iframe_autoscroll(iframe, event.clientX, event.clientY)) return;

    const outer = find_outer_scroller();

    if (!outer) return;

    const restore_top = outer.scrollTop;
    let frames = 0;
    const restore_scroll = () => {
      if (outer.scrollTop !== restore_top) outer.scrollTop = restore_top;
      frames += 1;
      if (frames < 8) requestAnimationFrame(restore_scroll);
    };

    requestAnimationFrame(restore_scroll);
  });

  const forward_touch = (name: string) => (e: TouchEvent) => {
    const touch = e.touches[0] || e.changedTouches[0];

    if (!touch) return;

    iframe.dispatchEvent(
      new TouchEvent(name, {
        bubbles: true,
        cancelable: true,
        touches: Array.from(e.touches),
        targetTouches: Array.from(e.targetTouches),
        changedTouches: Array.from(e.changedTouches),
      }),
    );
  };

  iframe_doc.addEventListener(
    "touchstart",
    forward_touch("touchstart"),
    { passive: true },
  );
  iframe_doc.addEventListener(
    "touchmove",
    forward_touch("touchmove"),
    { passive: true },
  );
  iframe_doc.addEventListener(
    "touchend",
    forward_touch("touchend"),
    { passive: true },
  );

  iframe_body.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (target.tagName === "IMG" && !target.closest("a")) {
      if (target.getAttribute("data-blocked") !== "true") {
        const img_el = target as HTMLImageElement;

        if (img_el.naturalWidth >= 16 && img_el.naturalHeight >= 16) {
          e.preventDefault();
          const src = img_el.currentSrc || img_el.src;

          if (src) zoom_fn_ref.current?.(src);

          return;
        }
      }
    }

    const link = target.closest("a");

    if (!link) return;
    const href = link.getAttribute("href") || "";

    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

    e.preventDefault();
    e.stopPropagation();

    if (href.startsWith("aster:")) {
      const path = href.slice("aster:".length);
      const ASTER_PATH_ALLOWLIST = /^(?:settings(?:\/[a-z0-9_-]{1,32})?)$/i;

      if (ASTER_PATH_ALLOWLIST.test(path)) {
        window.dispatchEvent(
          new CustomEvent("aster-internal-link", { detail: { path } }),
        );
      }
    } else {
      window.dispatchEvent(
        new CustomEvent("aster-external-link", {
          detail: { url: href },
        }),
      );
    }
  });

  iframe_body.addEventListener("auxclick", (e) => {
    if ((e as MouseEvent).button !== 1) return;

    const target = e.target as HTMLElement;
    const link = target.closest("a");

    if (!link) return;
    const href = link.getAttribute("href") || "";

    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;

    e.preventDefault();
    e.stopPropagation();

    if (href.startsWith("aster:")) {
      const path = href.slice("aster:".length);
      const ASTER_PATH_ALLOWLIST = /^(?:settings(?:\/[a-z0-9_-]{1,32})?)$/i;

      if (ASTER_PATH_ALLOWLIST.test(path)) {
        window.dispatchEvent(
          new CustomEvent("aster-internal-link", { detail: { path } }),
        );
      }
    } else {
      window.dispatchEvent(
        new CustomEvent("aster-external-link", {
          detail: { url: href },
        }),
      );
    }
  });

  iframe_doc.addEventListener("keydown", (e) => {
    const is_select_all =
      (e.ctrlKey || e.metaKey) &&
      !e.altKey &&
      (e.key === "a" || e.key === "A");

    if (!is_select_all) return;

    const doc = iframe_doc;
    const body = doc?.body;
    const selection = doc?.getSelection();

    if (!doc || !body || !selection) return;

    e.preventDefault();
    const range = doc.createRange();

    range.selectNodeContents(body);
    selection.removeAllRanges();
    selection.addRange(range);
  });

  iframe_doc.addEventListener("selectionchange", () => {
    const selection = iframe_doc?.getSelection();

    if (selection && selection.isCollapsed) update_height();
  });
}