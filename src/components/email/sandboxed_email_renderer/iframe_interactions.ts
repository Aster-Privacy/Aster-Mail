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
import {
  FRAME_TIP_EVENT,
  type FrameTipDetail,
} from "@/components/ui/title_tip_layer";
import { forward_iframe_outside_interaction } from "@/lib/iframe_outside_interaction";
import {
  is_mailto_link,
  parse_mailto_link,
  keep_safe_mailto_fields,
} from "@/lib/mailto_link";
import {
  deliver_mailto_draft,
  has_mailto_listener,
} from "@/native/desktop_mailto_bridge";
import {
  LINK_MENU_EVENT,
  link_menu_host,
  type LinkMenuDetail,
} from "@/lib/link_menu_event";
import { request_external_link } from "@/utils/external_link_request";

const ASTER_PATH_ALLOWLIST = /^(?:settings(?:\/[a-z0-9_-]{1,32})?)$/i;
const ABSOLUTE_URL_REGEX = /^[a-z][a-z0-9+.-]*:/i;
const FRAME_TIP_ATTR = "data-aster-tip";

function send_frame_tip(detail: FrameTipDetail | null): void {
  window.dispatchEvent(new CustomEvent(FRAME_TIP_EVENT, { detail }));
}

function attach_frame_tips(
  iframe: HTMLIFrameElement,
  iframe_doc: Document,
): void {
  let active: Element | null = null;

  const hide = () => {
    if (!active) return;
    active = null;
    send_frame_tip(null);
  };

  iframe_doc.addEventListener("pointerover", (e) => {
    if ((e as PointerEvent).pointerType === "touch") return;

    const el =
      (e.target as Element | null)?.closest?.(`[${FRAME_TIP_ATTR}]`) ?? null;

    if (el === active) return;
    hide();
    if (!el) return;

    const text = el.getAttribute(FRAME_TIP_ATTR) ?? "";

    if (!text) return;

    const frame = iframe.getBoundingClientRect();
    const inner = el.getBoundingClientRect();
    const scale_x = iframe.clientWidth ? frame.width / iframe.clientWidth : 1;
    const scale_y = iframe.clientHeight
      ? frame.height / iframe.clientHeight
      : 1;

    active = el;
    send_frame_tip({
      text,
      rect: new DOMRect(
        frame.left + inner.left * scale_x,
        frame.top + inner.top * scale_y,
        inner.width * scale_x,
        inner.height * scale_y,
      ),
    });
  });
  iframe_doc.addEventListener("pointerdown", hide, true);
  iframe_doc.addEventListener("keydown", hide, true);
  iframe_doc.documentElement.addEventListener("pointerleave", hide);
}

function resolve_link_url(link: MessageLink, href: string): string {
  if (is_mailto_link(href)) return keep_safe_mailto_fields(href);
  if (ABSOLUTE_URL_REGEX.test(href)) return href;

  return link.href || href;
}

const IN_DOCUMENT_ANCHOR_PREFIX = "aster_anchor_";

type MessageLink = HTMLAnchorElement | HTMLAreaElement;

function in_frame_anchor(href: string): string | null {
  const trimmed = href.trim();

  return trimmed.startsWith("#") ? trimmed.slice(1) : null;
}

function decode_anchor_name(raw_name: string): string {
  try {
    return decodeURIComponent(raw_name);
  } catch {
    return raw_name;
  }
}

function find_frame_anchor(iframe_doc: Document, name: string): Element | null {
  const by_id = iframe_doc.getElementById(name);

  if (by_id) return by_id;

  for (const element of Array.from(iframe_doc.querySelectorAll("[name]"))) {
    if (element.getAttribute("name") === name) return element;
  }

  return null;
}

function scroll_to_frame_anchor(iframe_doc: Document, raw_name: string): void {
  const name = decode_anchor_name(raw_name);

  if (!name) return;

  const candidates = name.startsWith(IN_DOCUMENT_ANCHOR_PREFIX)
    ? [name]
    : [name, `${IN_DOCUMENT_ANCHOR_PREFIX}${name}`];

  for (const candidate of candidates) {
    const target = find_frame_anchor(iframe_doc, candidate);

    if (target) {
      target.scrollIntoView({ block: "start" });

      return;
    }
  }
}

function open_mailto(href: string): void {
  const safe_link = keep_safe_mailto_fields(href);
  const draft = has_mailto_listener() ? parse_mailto_link(safe_link) : null;

  if (draft) {
    deliver_mailto_draft({ ...draft, bcc: [] });

    return;
  }

  void request_external_link(safe_link);
}

function activate_link(link: MessageLink, href: string): void {
  if (href.startsWith("aster:")) {
    const path = href.slice("aster:".length);

    if (ASTER_PATH_ALLOWLIST.test(path)) {
      window.dispatchEvent(
        new CustomEvent("aster-internal-link", { detail: { path } }),
      );
    }

    return;
  }

  window.dispatchEvent(
    new CustomEvent("aster-external-link", {
      detail: { url: resolve_link_url(link, href) },
    }),
  );
}

export function attach_iframe_interactions(
  iframe: HTMLIFrameElement,
  iframe_doc: Document,
  iframe_body: HTMLElement,
  update_height: () => void,
  zoom_fn_ref: { current: ((src: string | null) => void) | null },
): void {
  forward_iframe_outside_interaction(iframe_doc);
  attach_frame_tips(iframe, iframe_doc);

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

  iframe_doc.addEventListener("touchstart", forward_touch("touchstart"), {
    passive: true,
  });
  iframe_doc.addEventListener("touchmove", forward_touch("touchmove"), {
    passive: true,
  });
  iframe_doc.addEventListener("touchend", forward_touch("touchend"), {
    passive: true,
  });

  iframe_body.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (target.tagName === "IMG" && !target.closest("a, area")) {
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

    const link = target.closest("a, area");

    if (!link) return;
    if (e.detail > 0) (link as HTMLElement).blur();
    const href = link.getAttribute("href") || "";

    if (!href) return;

    const anchor_name = in_frame_anchor(href);

    if (anchor_name !== null) {
      e.preventDefault();
      e.stopPropagation();
      scroll_to_frame_anchor(iframe_doc, anchor_name);

      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (is_mailto_link(href)) {
      open_mailto(href);

      return;
    }

    activate_link(link as MessageLink, href);
  });

  iframe_body.addEventListener("contextmenu", (e) => {
    const link = (e.target as HTMLElement).closest("a, area");

    if (!link) return;
    const href = link.getAttribute("href") || "";

    if (!href || in_frame_anchor(href) !== null || href.startsWith("aster:"))
      return;
    const url = resolve_link_url(link as MessageLink, href);

    if (!link_menu_host(url)) return;

    e.preventDefault();
    e.stopPropagation();

    const frame = iframe.getBoundingClientRect();
    const scale_x = iframe.clientWidth ? frame.width / iframe.clientWidth : 1;
    const scale_y = iframe.clientHeight
      ? frame.height / iframe.clientHeight
      : 1;
    const detail: LinkMenuDetail = {
      url,
      x: frame.left + e.clientX * scale_x,
      y: frame.top + e.clientY * scale_y,
    };

    window.dispatchEvent(new CustomEvent(LINK_MENU_EVENT, { detail }));
  });

  iframe_body.addEventListener("auxclick", (e) => {
    if ((e as MouseEvent).button !== 1) return;

    const target = e.target as HTMLElement;
    const link = target.closest("a, area");

    if (!link) return;
    const href = link.getAttribute("href") || "";

    if (!href) return;

    if (in_frame_anchor(href) !== null) {
      e.preventDefault();
      e.stopPropagation();

      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (is_mailto_link(href)) {
      open_mailto(href);

      return;
    }

    activate_link(link as MessageLink, href);
  });

  iframe_doc.addEventListener("keydown", (e) => {
    const is_select_all =
      (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "a" || e.key === "A");

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
