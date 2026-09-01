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

interface RailTipState {
  text: string;
  top: number;
  left: number;
}

const SHOW_DELAY_MS = 400;
const GAP_PX = 10;
const EDGE_PADDING_PX = 8;
const TIP_ID = "aster_rail_tip";

export function RailTipLayer() {
  const [tip, set_tip] = useState<RailTipState | null>(null);
  const timer_ref = useRef<number | null>(null);
  const target_ref = useRef<HTMLElement | null>(null);
  const node_ref = useRef<HTMLDivElement | null>(null);
  const tip_visible_ref = useRef(false);

  useEffect(() => {
    const clear_timer = () => {
      if (timer_ref.current !== null) {
        window.clearTimeout(timer_ref.current);
        timer_ref.current = null;
      }
    };

    const clear_target = () => {
      if (target_ref.current?.getAttribute("aria-describedby") === TIP_ID) {
        target_ref.current.removeAttribute("aria-describedby");
      }
      target_ref.current = null;
    };

    const hide = () => {
      if (
        timer_ref.current === null &&
        target_ref.current === null &&
        !tip_visible_ref.current
      ) {
        return;
      }
      clear_timer();
      clear_target();
      tip_visible_ref.current = false;
      set_tip(null);
    };

    const show_for = (el: HTMLElement) => {
      const text = el.getAttribute("data-rail-tip");

      if (!text) return;
      const rect = el.getBoundingClientRect();

      el.setAttribute("aria-describedby", TIP_ID);
      tip_visible_ref.current = true;
      set_tip({
        text,
        top: rect.top + rect.height / 2,
        left: rect.right + GAP_PX,
      });
    };

    const target_from = (node: EventTarget | null) =>
      ((node as HTMLElement | null)?.closest?.("[data-rail-tip]") ??
        null) as HTMLElement | null;

    const handle_over = (e: PointerEvent) => {
      const el = target_from(e.target);

      if (!el || !el.getAttribute("data-rail-tip")) {
        if (target_ref.current) hide();

        return;
      }
      if (el === target_ref.current) return;
      clear_timer();
      clear_target();
      target_ref.current = el;
      set_tip(null);
      timer_ref.current = window.setTimeout(() => {
        if (target_ref.current === el && el.isConnected) show_for(el);
      }, SHOW_DELAY_MS);
    };

    const handle_focus_in = (e: FocusEvent) => {
      const el = target_from(e.target);

      if (!el || !el.getAttribute("data-rail-tip")) {
        if (target_ref.current) hide();

        return;
      }
      if (el === target_ref.current) return;
      clear_timer();
      clear_target();
      target_ref.current = el;
      show_for(el);
    };

    const handle_focus_out = (e: FocusEvent) => {
      if (target_ref.current && target_from(e.target) === target_ref.current) {
        hide();
      }
    };

    const rail_root: HTMLElement | Document =
      document.querySelector<HTMLElement>("[data-sidebar-root]") ?? document;

    rail_root.addEventListener("pointerover", handle_over as EventListener);
    rail_root.addEventListener("pointerleave", hide);
    rail_root.addEventListener("focusin", handle_focus_in as EventListener);
    rail_root.addEventListener("focusout", handle_focus_out as EventListener);
    document.addEventListener("pointerdown", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    window.addEventListener("resize", hide);

    return () => {
      clear_timer();
      clear_target();
      rail_root.removeEventListener("pointerover", handle_over as EventListener);
      rail_root.removeEventListener("pointerleave", hide);
      rail_root.removeEventListener("focusin", handle_focus_in as EventListener);
      rail_root.removeEventListener(
        "focusout",
        handle_focus_out as EventListener,
      );
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, []);

  useLayoutEffect(() => {
    if (!tip || !node_ref.current) return;
    const rect = node_ref.current.getBoundingClientRect();
    const max_left = window.innerWidth - rect.width - EDGE_PADDING_PX;
    const max_top = window.innerHeight - rect.height - EDGE_PADDING_PX;
    const next_left = Math.min(tip.left, Math.max(EDGE_PADDING_PX, max_left));
    const next_top = Math.min(
      Math.max(EDGE_PADDING_PX, tip.top - rect.height / 2),
      Math.max(EDGE_PADDING_PX, max_top),
    );

    node_ref.current.style.left = `${next_left}px`;
    node_ref.current.style.top = `${next_top}px`;
    node_ref.current.style.visibility = "visible";
  }, [tip]);

  if (!tip || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={node_ref}
      className="aster_tip_portal"
      id={TIP_ID}
      role="tooltip"
      style={{
        position: "fixed",
        top: tip.top,
        left: tip.left,
        visibility: "hidden",
      }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
