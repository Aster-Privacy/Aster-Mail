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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TitleTipState {
  text: string;
  rect: DOMRect;
}

const SHOW_DELAY_MS = 450;
const GAP_PX = 6;
const EDGE_PADDING_PX = 8;
const TIP_ID = "aster_title_tip";
const STASH_ATTR = "data-aster-title";

export const FRAME_TIP_EVENT = "aster-frame-tip";

export interface FrameTipDetail {
  text: string;
  rect: DOMRect;
}

function stash_title(el: HTMLElement): string {
  const live = el.getAttribute("title");

  if (live !== null) {
    el.removeAttribute("title");
    if (live.trim()) {
      el.setAttribute(STASH_ATTR, live);
    } else {
      el.removeAttribute(STASH_ATTR);
    }
  }

  return el.getAttribute(STASH_ATTR) ?? "";
}

function restore_title(el: HTMLElement) {
  const stashed = el.getAttribute(STASH_ATTR);

  el.removeAttribute(STASH_ATTR);
  if (stashed !== null && el.getAttribute("title") === null) {
    el.setAttribute("title", stashed);
  }
  if (el.getAttribute("aria-describedby") === TIP_ID) {
    el.removeAttribute("aria-describedby");
  }
}

function target_from(node: EventTarget | null): HTMLElement | null {
  const el = (node as Element | null)?.closest?.(`[title],[${STASH_ATTR}]`);

  if (!(el instanceof HTMLElement)) return null;
  if (el.closest("[data-rail-tip]")) return null;
  if (el instanceof HTMLIFrameElement) return null;

  return el;
}

export function TitleTipLayer() {
  const [tip, set_tip] = useState<TitleTipState | null>(null);
  const node_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let target: HTMLElement | null = null;
    let timer: number | null = null;
    let observer: MutationObserver | null = null;

    const clear_timer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const release = () => {
      clear_timer();
      observer?.disconnect();
      observer = null;
      if (target) restore_title(target);
      target = null;
      set_tip(null);
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute(STASH_ATTR);

      if (!text || !el.isConnected) return;
      el.setAttribute("aria-describedby", TIP_ID);
      set_tip({ text, rect: el.getBoundingClientRect() });
    };

    const adopt = (el: HTMLElement, immediate: boolean) => {
      if (el === target) return;
      release();
      target = el;
      stash_title(el);
      if (typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(() => {
          if (!el.isConnected) {
            release();

            return;
          }
          if (el.getAttribute("title") !== null) {
            const text = stash_title(el);

            if (!text) {
              release();

              return;
            }
            set_tip((prev) => (prev ? { ...prev, text } : prev));
          }
        });
        observer.observe(el, { attributes: true, attributeFilter: ["title"] });
      }
      if (immediate) {
        show(el);
      } else {
        timer = window.setTimeout(() => {
          timer = null;
          if (target === el) show(el);
        }, SHOW_DELAY_MS);
      }
    };

    const handle_over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = target_from(e.target);

      if (!el) {
        if (target) release();

        return;
      }
      adopt(el, false);
    };

    const handle_focus_in = (e: FocusEvent) => {
      const el = target_from(e.target);

      if (!el || el !== e.target) return;
      let focus_visible = false;

      try {
        focus_visible = el.matches(":focus-visible");
      } catch {
        focus_visible = false;
      }
      if (!focus_visible) return;
      adopt(el, true);
    };

    const handle_focus_out = (e: FocusEvent) => {
      if (target && e.target === target) release();
    };

    const handle_leave_window = (e: PointerEvent) => {
      if (!e.relatedTarget) release();
    };

    const handle_frame_tip = (e: Event) => {
      const detail = (e as CustomEvent<FrameTipDetail | null>).detail;

      release();
      if (!detail || !detail.text) return;
      timer = window.setTimeout(() => {
        timer = null;
        set_tip({ text: detail.text, rect: detail.rect });
      }, SHOW_DELAY_MS);
    };

    document.addEventListener("pointerover", handle_over, true);
    document.addEventListener("pointerout", handle_leave_window, true);
    document.addEventListener("focusin", handle_focus_in, true);
    document.addEventListener("focusout", handle_focus_out, true);
    document.addEventListener("pointerdown", release, true);
    document.addEventListener("keydown", release, true);
    window.addEventListener("blur", release);
    window.addEventListener("scroll", release, {
      capture: true,
      passive: true,
    });
    window.addEventListener("wheel", release, { passive: true });
    window.addEventListener("resize", release);
    window.addEventListener(FRAME_TIP_EVENT, handle_frame_tip);

    return () => {
      release();
      window.removeEventListener(FRAME_TIP_EVENT, handle_frame_tip);
      document.removeEventListener("pointerover", handle_over, true);
      document.removeEventListener("pointerout", handle_leave_window, true);
      document.removeEventListener("focusin", handle_focus_in, true);
      document.removeEventListener("focusout", handle_focus_out, true);
      document.removeEventListener("pointerdown", release, true);
      document.removeEventListener("keydown", release, true);
      window.removeEventListener("blur", release);
      window.removeEventListener("scroll", release, { capture: true });
      window.removeEventListener("wheel", release);
      window.removeEventListener("resize", release);
    };
  }, []);

  useLayoutEffect(() => {
    const node = node_ref.current;

    if (!tip || !node) return;
    const box = node.getBoundingClientRect();
    const below = tip.rect.bottom + GAP_PX;
    const above = tip.rect.top - GAP_PX - box.height;
    const fits_below =
      below + box.height <= window.innerHeight - EDGE_PADDING_PX;
    const top = fits_below || above < EDGE_PADDING_PX ? below : above;
    const centered = tip.rect.left + tip.rect.width / 2 - box.width / 2;
    const left = Math.max(
      EDGE_PADDING_PX,
      Math.min(centered, window.innerWidth - box.width - EDGE_PADDING_PX),
    );

    node.style.top = `${Math.max(EDGE_PADDING_PX, top)}px`;
    node.style.left = `${left}px`;
    node.style.visibility = "visible";
  }, [tip]);

  if (!tip || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={node_ref}
      className="aster_tip_portal aster_title_tip"
      id={TIP_ID}
      role="tooltip"
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
