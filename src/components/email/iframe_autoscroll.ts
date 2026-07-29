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
const DEAD_ZONE_PX = 12;
const SPEED_DIVISOR = 9;
const MAX_STEP_PX = 40;
const DRAG_RELEASE_PX = 8;
const MARKER_SIZE_PX = 26;

type ScrollTarget = {
  scroll_by: (dx: number, dy: number) => void;
  can_scroll_y: boolean;
  can_scroll_x: boolean;
};

const is_scrollable = (node: Element, axis: "x" | "y"): boolean => {
  const style = window.getComputedStyle(node);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;

  if (overflow !== "auto" && overflow !== "scroll" && overflow !== "overlay") {
    return false;
  }

  return axis === "y"
    ? node.scrollHeight > node.clientHeight + 1
    : node.scrollWidth > node.clientWidth + 1;
};

const element_target = (node: Element): ScrollTarget => ({
  scroll_by: (dx, dy) => {
    node.scrollTop += dy;
    node.scrollLeft += dx;
  },
  can_scroll_y: is_scrollable(node, "y"),
  can_scroll_x: is_scrollable(node, "x"),
});

const document_target = (doc: Document): ScrollTarget | null => {
  const scroller = doc.scrollingElement;

  if (!scroller) return null;

  const can_scroll_y = scroller.scrollHeight > scroller.clientHeight + 1;
  const can_scroll_x = scroller.scrollWidth > scroller.clientWidth + 1;

  if (!can_scroll_y && !can_scroll_x) return null;

  return {
    scroll_by: (dx, dy) => {
      scroller.scrollTop += dy;
      scroller.scrollLeft += dx;
    },
    can_scroll_y,
    can_scroll_x,
  };
};

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

const build_marker = (x: number, y: number): HTMLElement => {
  const marker = document.createElement("div");

  marker.setAttribute("aria-hidden", "true");
  marker.style.cssText = [
    "position:fixed",
    `left:${x - MARKER_SIZE_PX / 2}px`,
    `top:${y - MARKER_SIZE_PX / 2}px`,
    `width:${MARKER_SIZE_PX}px`,
    `height:${MARKER_SIZE_PX}px`,
    "border-radius:9999px",
    "border:1px solid rgba(127,127,127,0.85)",
    "background:rgba(127,127,127,0.16)",
    "backdrop-filter:blur(2px)",
    "pointer-events:none",
    "z-index:2147483647",
  ].join(";");

  return marker;
};

export const start_iframe_autoscroll = (
  iframe: HTMLIFrameElement,
  origin_client_x: number,
  origin_client_y: number,
): boolean => {
  const target = resolve_target(iframe);

  if (!target) return false;

  const rect = iframe.getBoundingClientRect();
  const origin_x = rect.left + origin_client_x;
  const origin_y = rect.top + origin_client_y;
  const marker = build_marker(origin_x, origin_y);
  const inner_doc = iframe.contentDocument;

  document.body.appendChild(marker);

  let pointer_x = origin_x;
  let pointer_y = origin_y;
  let moved_while_held = false;
  let frame = 0;
  let stopped = false;

  const step = (offset: number, enabled: boolean): number => {
    if (!enabled) return 0;

    const magnitude = Math.abs(offset);

    if (magnitude <= DEAD_ZONE_PX) return 0;

    const scaled = (magnitude - DEAD_ZONE_PX) / SPEED_DIVISOR;

    return Math.sign(offset) * Math.min(scaled, MAX_STEP_PX);
  };

  const tick = () => {
    if (stopped) return;

    const dy = step(pointer_y - origin_y, target.can_scroll_y);
    const dx = step(pointer_x - origin_x, target.can_scroll_x);

    if (dx || dy) target.scroll_by(dx, dy);
    frame = requestAnimationFrame(tick);
  };

  const track_outer = (event: MouseEvent) => {
    pointer_x = event.clientX;
    pointer_y = event.clientY;
    if (
      Math.abs(pointer_x - origin_x) > DRAG_RELEASE_PX ||
      Math.abs(pointer_y - origin_y) > DRAG_RELEASE_PX
    ) {
      moved_while_held = true;
    }
  };

  const track_inner = (event: MouseEvent) => {
    const current = iframe.getBoundingClientRect();

    track_outer({
      clientX: current.left + event.clientX,
      clientY: current.top + event.clientY,
    } as MouseEvent);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    marker.remove();
    document.removeEventListener("mousemove", track_outer, true);
    document.removeEventListener("mousedown", on_stop_event, true);
    document.removeEventListener("mouseup", on_release, true);
    document.removeEventListener("wheel", on_stop_event, true);
    document.removeEventListener("keydown", on_key, true);
    window.removeEventListener("blur", stop);
    inner_doc?.removeEventListener("mousemove", track_inner, true);
    inner_doc?.removeEventListener("mousedown", on_stop_event, true);
    inner_doc?.removeEventListener("mouseup", on_release, true);
    inner_doc?.removeEventListener("wheel", on_stop_event, true);
    inner_doc?.removeEventListener("keydown", on_key, true);
  };

  const on_stop_event = () => stop();

  const on_release = (event: MouseEvent) => {
    if (event.button !== 1) return;
    if (moved_while_held) stop();
  };

  const on_key = (event: KeyboardEvent) => {
    if (event.key === "Escape") stop();
  };

  document.addEventListener("mousemove", track_outer, true);
  document.addEventListener("mousedown", on_stop_event, true);
  document.addEventListener("mouseup", on_release, true);
  document.addEventListener("wheel", on_stop_event, true);
  document.addEventListener("keydown", on_key, true);
  window.addEventListener("blur", stop);
  inner_doc?.addEventListener("mousemove", track_inner, true);
  inner_doc?.addEventListener("mousedown", on_stop_event, true);
  inner_doc?.addEventListener("mouseup", on_release, true);
  inner_doc?.addEventListener("wheel", on_stop_event, true);
  inner_doc?.addEventListener("keydown", on_key, true);

  frame = requestAnimationFrame(tick);

  return true;
};
