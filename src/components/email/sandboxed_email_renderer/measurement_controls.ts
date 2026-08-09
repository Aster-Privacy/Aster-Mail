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
import type { Dispatch, SetStateAction } from "react";

import {
  FIT_SLACK_PX,
  body_has_renderable_content,
  fit_zoom_for,
  measure_content_bounds,
  remember_measured_height,
  should_recover_collapsed_height,
} from "./helpers";
import type { SandboxedEmailRendererProps } from "./renderer";

export interface measurement_context {
  iframe: HTMLIFrameElement;
  email_id: string | undefined;
  base_zoom_ref: { current: number };
  document_ready_cleanup_ref: { current: (() => void) | null };
  has_fired_ready_ref: { current: boolean };
  mutation_observer_ref: { current: MutationObserver | null };
  observer_ref: { current: ResizeObserver | null };
  raf_ref: { current: number };
  remeasure_ref: { current: (() => void) | null };
  stable_timer_ref: { current: ReturnType<typeof setTimeout> | null };
  on_document_ready_ref: { current: SandboxedEmailRendererProps["on_document_ready"] };
  set_height_ready: Dispatch<SetStateAction<boolean>>;
  set_iframe_height: Dispatch<SetStateAction<string>>;
}

export function build_measurement_controls(ctx: measurement_context) {
  const {
    iframe,
    email_id,
    base_zoom_ref,
    document_ready_cleanup_ref,
    has_fired_ready_ref,
    mutation_observer_ref,
    observer_ref,
    raf_ref,
    remeasure_ref,
    stable_timer_ref,
    on_document_ready_ref,
    set_height_ready,
    set_iframe_height,
  } = ctx;

  const MAX_IFRAME_HEIGHT = 12000;

  const schedule_ready = () => {
    if (has_fired_ready_ref.current || !email_id) return;
    if (stable_timer_ref.current) clearTimeout(stable_timer_ref.current);
    stable_timer_ref.current = setTimeout(() => {
      if (!has_fired_ready_ref.current) {
        has_fired_ready_ref.current = true;
        window.dispatchEvent(
          new CustomEvent("astermail:iframe-ready", { detail: email_id }),
        );
      }
    }, 100);
  };

  let last_height = 0;

  const capture_ancestor_scroll = (): { node: Element; top: number }[] => {
    const captured: { node: Element; top: number }[] = [];
    let node: Element | null = iframe.parentElement;

    while (node) {
      if (node.scrollTop > 0) captured.push({ node, top: node.scrollTop });
      node = node.parentElement;
    }

    return captured;
  };

  const restore_ancestor_scroll = (
    captured: { node: Element; top: number }[],
  ) => {
    captured.forEach(({ node, top }) => {
      if (node.scrollTop !== top) node.scrollTop = top;
    });
  };

  const sync_fit_zoom = (doc: Document, body: HTMLElement) => {
    const available = iframe.clientWidth;

    if (available <= 0) return;

    body.style.setProperty("zoom", "1");
    const natural = Math.max(
      body.scrollWidth,
      doc.documentElement.scrollWidth,
    );
    const fitted = fit_zoom_for(natural, available, base_zoom_ref.current);

    body.style.setProperty("zoom", String(fitted));
    if (natural * fitted > available + FIT_SLACK_PX) {
      body.style.setProperty("overflow-x", "auto");
    } else {
      body.style.removeProperty("overflow-x");
    }
  };

  const measure_decoupled_height = (): number => {
    const doc = iframe.contentDocument;
    const body = doc?.body;
    const html = doc?.documentElement;

    if (!body || !doc || !html) return 0;

    const scroller = doc.scrollingElement;
    const saved_scroll_top = scroller ? scroller.scrollTop : 0;
    const saved_ancestor_scroll = capture_ancestor_scroll();
    const saved_window_scroll = window.scrollY;
    const saved_iframe_height = iframe.style.height;
    const saved_html_h = html.style.getPropertyValue("height");
    const saved_html_h_pri = html.style.getPropertyPriority("height");
    const saved_html_minh = html.style.getPropertyValue("min-height");
    const saved_html_minh_pri = html.style.getPropertyPriority("min-height");
    const saved_body_h = body.style.getPropertyValue("height");
    const saved_body_h_pri = body.style.getPropertyPriority("height");
    const saved_body_minh = body.style.getPropertyValue("min-height");
    const saved_body_minh_pri = body.style.getPropertyPriority("min-height");

    iframe.style.height = "0px";
    html.style.setProperty("height", "auto", "important");
    html.style.setProperty("min-height", "0px", "important");
    body.style.setProperty("height", "auto", "important");
    body.style.setProperty("min-height", "0px", "important");

    sync_fit_zoom(doc, body);

    const rect = body.getBoundingClientRect();
    const body_zoom =
      parseFloat(iframe.contentWindow?.getComputedStyle(body).zoom || "1") ||
      1;
    const scroll_height = Math.min(
      body.scrollHeight,
      body.scrollHeight * body_zoom,
    );
    const measured = Math.max(rect.bottom, scroll_height);
    const recovered = should_recover_collapsed_height(
      measured,
      body_has_renderable_content(body),
    )
      ? measure_content_bounds(body)
      : measured;

    if (saved_html_h) html.style.setProperty("height", saved_html_h, saved_html_h_pri);
    else html.style.removeProperty("height");
    if (saved_html_minh) html.style.setProperty("min-height", saved_html_minh, saved_html_minh_pri);
    else html.style.removeProperty("min-height");
    if (saved_body_h) body.style.setProperty("height", saved_body_h, saved_body_h_pri);
    else body.style.removeProperty("height");
    if (saved_body_minh) body.style.setProperty("min-height", saved_body_minh, saved_body_minh_pri);
    else body.style.removeProperty("min-height");
    iframe.style.height = saved_iframe_height;
    if (
      scroller &&
      saved_scroll_top > 0 &&
      scroller.scrollTop !== saved_scroll_top
    ) {
      scroller.scrollTop = saved_scroll_top;
    }
    restore_ancestor_scroll(saved_ancestor_scroll);
    if (saved_window_scroll > 0 && window.scrollY !== saved_window_scroll) {
      window.scrollTo(window.scrollX, saved_window_scroll);
    }

    return recovered;
  };

  const sync_clip_overflow = (doc: Document, clipped: boolean) => {
    const body = doc.body;

    if (!body) return;
    if (clipped) {
      if (body.style.getPropertyValue("overflow-y") !== "auto") {
        body.style.setProperty("overflow-y", "auto");
      }
    } else if (body.style.getPropertyValue("overflow-y")) {
      body.style.removeProperty("overflow-y");
    }
  };

  const measure_and_apply = (force = false) => {
    const doc = iframe.contentDocument;
    const body = doc?.body;

    if (!body || !doc) return;

    const active_selection = doc.getSelection();

    if (!force && active_selection && !active_selection.isCollapsed) return;

    const measured = measure_decoupled_height();

    if (measured <= 0) return;

    const height = Math.min(measured + 8, MAX_IFRAME_HEIGHT);

    sync_clip_overflow(doc, measured + 8 > MAX_IFRAME_HEIGHT);

    if (Math.abs(height - last_height) < 2) return;
    last_height = height;

    set_iframe_height(`${height}px`);
    set_height_ready(true);
    if (email_id) {
      remember_measured_height(email_id, body, height);
      schedule_ready();
    }
  };

  const update_height = () => {
    if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
    raf_ref.current = requestAnimationFrame(() => measure_and_apply());
  };

  const force_remeasure = () => {
    if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
    raf_ref.current = requestAnimationFrame(() => measure_and_apply(true));
  };

  remeasure_ref.current = update_height;

  const reveal_content = () => {
    const content_doc = iframe.contentDocument;

    if (!content_doc?.body) return;

    const immediate_height = measure_decoupled_height();

    if (immediate_height > 0) {
      const clamped = Math.min(immediate_height + 8, MAX_IFRAME_HEIGHT);

      sync_clip_overflow(content_doc, immediate_height + 8 > MAX_IFRAME_HEIGHT);
      last_height = clamped;
      set_iframe_height(`${clamped}px`);
      set_height_ready(true);
      if (email_id) {
        remember_measured_height(email_id, content_doc.body, clamped);
        schedule_ready();
      }
    }
  };

  const listen_to_images = (root: Element | Document) => {
    const images = root.querySelectorAll("img");

    images.forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", update_height, { once: true });
        img.addEventListener("error", update_height, { once: true });
      }
    });
  };

  const apply_fast_height = (entry: ResizeObserverEntry) => {
    const body = iframe.contentDocument?.body;
    const box_height =
      entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
    const content_height = body
      ? Math.max(
          box_height,
          body.scrollHeight,
          body.getBoundingClientRect().bottom,
        )
      : box_height;

    if (!content_height || content_height <= 0) return;

    const candidate = Math.min(content_height + 8, MAX_IFRAME_HEIGHT);

    if (Math.abs(candidate - last_height) < 2) return;
    if (last_height > 0 && candidate > last_height) return;

    last_height = candidate;
    set_iframe_height(`${candidate}px`);
    set_height_ready(true);
    if (email_id) {
      remember_measured_height(email_id, body, candidate);
      schedule_ready();
    }
  };

  const attach_observer = () => {
    if (!iframe.contentDocument?.body) return;
    const resize_observer_ctor =
      (iframe.contentWindow as (Window & typeof globalThis) | null)
        ?.ResizeObserver ?? ResizeObserver;

    observer_ref.current = new resize_observer_ctor((entries) => {
      const entry = entries[0];
      const doc = iframe.contentDocument;
      const active_selection = doc?.getSelection();

      if (active_selection && !active_selection.isCollapsed) return;
      if (entry) apply_fast_height(entry);

      update_height();
    });
    observer_ref.current.observe(iframe.contentDocument.body);
    update_height();

    listen_to_images(iframe.contentDocument);

    if (mutation_observer_ref.current) {
      mutation_observer_ref.current.disconnect();
    }

    mutation_observer_ref.current = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLImageElement) {
            if (!node.complete) {
              node.addEventListener("load", update_height, { once: true });
              node.addEventListener("error", update_height, { once: true });
            } else {
              update_height();
            }
          } else if (node instanceof HTMLElement) {
            listen_to_images(node);
            update_height();
          }
        }
      }
    });

    mutation_observer_ref.current.observe(iframe.contentDocument.body, {
      childList: true,
      subtree: true,
    });
  };

  const notify_document_ready = () => {
    const body = iframe.contentDocument?.body;
    const handler = on_document_ready_ref.current;

    document_ready_cleanup_ref.current?.();
    document_ready_cleanup_ref.current = null;

    if (!body || !handler) return;

    const cleanup = handler(body, force_remeasure);

    if (typeof cleanup === "function") {
      document_ready_cleanup_ref.current = cleanup;
    }
  };

  return {
    measure_and_apply,
    update_height,
    reveal_content,
    attach_observer,
    notify_document_ready,
  };
}