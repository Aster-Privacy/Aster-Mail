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
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface RailTipState {
  text: string;
  top: number;
  left: number;
}

const SHOW_DELAY_MS = 400;
const GAP_PX = 10;
const EDGE_PADDING_PX = 8;

export function RailTipLayer() {
  const [tip, set_tip] = useState<RailTipState | null>(null);
  const timer_ref = useRef<number | null>(null);
  const target_ref = useRef<HTMLElement | null>(null);
  const node_ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const clear_timer = () => {
      if (timer_ref.current !== null) {
        window.clearTimeout(timer_ref.current);
        timer_ref.current = null;
      }
    };

    const hide = () => {
      clear_timer();
      target_ref.current = null;
      set_tip(null);
    };

    const show_for = (el: HTMLElement) => {
      const text = el.getAttribute("data-rail-tip");

      if (!text) return;
      const rect = el.getBoundingClientRect();

      set_tip({
        text,
        top: rect.top + rect.height / 2,
        left: rect.right + GAP_PX,
      });
    };

    const handle_over = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(
        "[data-rail-tip]",
      ) as HTMLElement | null;

      if (!el || !el.getAttribute("data-rail-tip")) {
        if (target_ref.current) hide();

        return;
      }
      if (el === target_ref.current) return;
      clear_timer();
      target_ref.current = el;
      set_tip(null);
      timer_ref.current = window.setTimeout(() => {
        if (target_ref.current === el && el.isConnected) show_for(el);
      }, SHOW_DELAY_MS);
    };

    document.addEventListener("pointerover", handle_over);
    document.addEventListener("pointerdown", hide);
    window.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);

    return () => {
      clear_timer();
      document.removeEventListener("pointerover", handle_over);
      document.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  useEffect(() => {
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
