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
import type { UserPreferences } from "@/services/api/preferences";

import { useState, useCallback, useRef, useEffect } from "react";

const SIDEBAR_WIDTH = 256;
const MIN_EMAIL_VIEWER_WIDTH = 360;
const MIN_LIST_WIDTH = 256;
const MIN_LIST_HEIGHT = 150;
const MIN_EMAIL_VIEWER_HEIGHT = 200;
const DEFAULT_LIST_RATIO = 0.5;
export const DEFAULT_LIST_MAX_WIDTH = 680;
const KEYBOARD_STEP = 24;

export function resolve_list_width({
  container_width,
  saved_ratio,
  saved_width,
}: {
  container_width: number;
  saved_ratio: number;
  saved_width: number;
}): number {
  const max_allowed = Math.max(
    MIN_LIST_WIDTH,
    container_width - MIN_EMAIL_VIEWER_WIDTH,
  );
  const preferred =
    saved_ratio > 0 && saved_ratio < 1
      ? Math.round(container_width * saved_ratio)
      : saved_width > 0
        ? saved_width
        : Math.min(
            DEFAULT_LIST_MAX_WIDTH,
            Math.floor(container_width * DEFAULT_LIST_RATIO),
          );

  return Math.max(MIN_LIST_WIDTH, Math.min(preferred, max_allowed));
}

function is_rtl_element(element: Element | null | undefined): boolean {
  if (!element) return false;

  return getComputedStyle(element).direction === "rtl";
}

interface UseSplitPaneOptions {
  is_split_view: boolean;
  is_bottom_pane: boolean;
  split_pane_width: number;
  split_pane_ratio?: number;
  split_pane_height: number;
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) => void;
  on_split_close?: () => void;
  on_split_scheduled_close?: () => void;
}

export function use_split_pane({
  is_split_view,
  is_bottom_pane,
  split_pane_width,
  split_pane_ratio = 0,
  split_pane_height,
  update_preference,
  on_split_close,
  on_split_scheduled_close,
}: UseSplitPaneOptions) {
  const [is_dragging, set_is_dragging] = useState(false);
  const drag_start_ref = useRef<{
    x: number;
    y: number;
    direction: 1 | -1;
    container_width: number;
    width: number;
    height: number;
    max_width: number;
    max_height: number;
  } | null>(null);
  const list_panel_ref = useRef<HTMLDivElement>(null);
  const list_column_ref = useRef<HTMLDivElement>(null);
  const detail_panel_ref = useRef<HTMLDivElement>(null);
  const raf_ref = useRef(0);
  const drag_width_ref = useRef<number | null>(null);
  const drag_height_ref = useRef<number | null>(null);
  const [container_size, set_container_size] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const get_resize_target = useCallback(
    () => list_column_ref.current ?? list_panel_ref.current,
    [],
  );

  useEffect(() => {
    if (!is_split_view) return;
    const container = get_resize_target()?.parentElement;

    if (!container || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const rect = container.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) return;
      set_container_size((prev) =>
        prev && prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };

    measure();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [is_split_view, is_bottom_pane, get_resize_target]);

  const default_height = Math.floor(
    (container_size?.height ?? window.innerHeight - 120) * 0.5,
  );
  const raw_pane_height = split_pane_height || default_height;
  const content_area_width =
    container_size?.width ?? window.innerWidth - SIDEBAR_WIDTH;
  const pane_width = resolve_list_width({
    container_width: content_area_width,
    saved_ratio: split_pane_ratio,
    saved_width: split_pane_width,
  });
  const content_area_height =
    container_size?.height ?? window.innerHeight - 120;
  const max_allowed_height = Math.max(
    MIN_LIST_HEIGHT,
    content_area_height - MIN_EMAIL_VIEWER_HEIGHT,
  );
  const pane_height = Math.max(
    MIN_LIST_HEIGHT,
    Math.min(raw_pane_height, max_allowed_height),
  );

  useEffect(() => {
    if (!is_split_view) return;
    let timeout_id: ReturnType<typeof setTimeout> | null = null;

    const handle_resize = () => {
      if (timeout_id !== null) clearTimeout(timeout_id);
      timeout_id = setTimeout(() => {
        timeout_id = null;
        const viewport_width = window.innerWidth;

        if (viewport_width >= 900) return;
        on_split_close?.();
        on_split_scheduled_close?.();
      }, 300);
    };

    window.addEventListener("resize", handle_resize);

    return () => {
      window.removeEventListener("resize", handle_resize);
      if (timeout_id !== null) clearTimeout(timeout_id);
    };
  }, [is_split_view, on_split_close, on_split_scheduled_close]);

  const apply_size = useCallback(
    (size: number) => {
      const target = get_resize_target();

      if (!target) return;
      if (is_bottom_pane) {
        target.style.height = `${size}px`;
      } else {
        target.style.width = `${size}px`;
      }
    },
    [get_resize_target, is_bottom_pane],
  );

  const save_width = useCallback(
    (width: number, container_width: number) => {
      update_preference("split_pane_width", Math.round(width));
      if (container_width > 0) {
        update_preference(
          "split_pane_ratio",
          Math.round((width / container_width) * 10000) / 10000,
        );
      }
    },
    [update_preference],
  );

  const measure_container = useCallback(() => {
    const rect = get_resize_target()?.parentElement?.getBoundingClientRect();

    return {
      width: rect && rect.width > 0 ? rect.width : content_area_width,
      height: rect && rect.height > 0 ? rect.height : content_area_height,
    };
  }, [get_resize_target, content_area_width, content_area_height]);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const target = get_resize_target();
      const container = measure_container();
      const current_rect = target?.getBoundingClientRect();
      const current_width = current_rect?.width || pane_width;
      const current_height = current_rect?.height || pane_height;

      drag_start_ref.current = {
        x: e.clientX,
        y: e.clientY,
        direction: is_rtl_element(target?.parentElement) ? -1 : 1,
        container_width: container.width,
        width: current_width,
        height: current_height,
        max_width: Math.max(
          MIN_LIST_WIDTH,
          container.width - MIN_EMAIL_VIEWER_WIDTH,
        ),
        max_height: Math.max(
          MIN_LIST_HEIGHT,
          container.height - MIN_EMAIL_VIEWER_HEIGHT,
        ),
      };
      drag_width_ref.current = current_width;
      drag_height_ref.current = current_height;
      set_is_dragging(true);
      document.body.style.cursor = is_bottom_pane ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      if (target) {
        target.style.pointerEvents = "none";
        target.style.willChange = is_bottom_pane ? "height" : "width";
      }
      if (detail_panel_ref.current) {
        detail_panel_ref.current.style.pointerEvents = "none";
      }
    },
    [
      get_resize_target,
      measure_container,
      pane_width,
      pane_height,
      is_bottom_pane,
    ],
  );

  const handle_reset = useCallback(() => {
    const container = measure_container();

    if (is_bottom_pane) {
      apply_size(
        Math.max(
          MIN_LIST_HEIGHT,
          Math.min(
            Math.floor(container.height * 0.5),
            container.height - MIN_EMAIL_VIEWER_HEIGHT,
          ),
        ),
      );
      update_preference("split_pane_height", 0);

      return;
    }
    apply_size(
      resolve_list_width({
        container_width: container.width,
        saved_ratio: 0,
        saved_width: 0,
      }),
    );
    update_preference("split_pane_width", 0);
    update_preference("split_pane_ratio", 0);
  }, [apply_size, is_bottom_pane, measure_container, update_preference]);

  const handle_key_down = useCallback(
    (e: React.KeyboardEvent) => {
      const target = get_resize_target();

      if (!target) return;
      if (e.key === "Enter") {
        e.preventDefault();
        handle_reset();

        return;
      }
      const rtl = is_rtl_element(target.parentElement);
      let delta = 0;

      if (is_bottom_pane) {
        if (e.key === "ArrowUp") delta = -KEYBOARD_STEP;
        if (e.key === "ArrowDown") delta = KEYBOARD_STEP;
      } else {
        if (e.key === "ArrowLeft") delta = rtl ? KEYBOARD_STEP : -KEYBOARD_STEP;
        if (e.key === "ArrowRight")
          delta = rtl ? -KEYBOARD_STEP : KEYBOARD_STEP;
      }
      if (delta === 0) return;
      e.preventDefault();
      const container = measure_container();
      const rect = target.getBoundingClientRect();

      if (is_bottom_pane) {
        const next = Math.max(
          MIN_LIST_HEIGHT,
          Math.min(
            Math.max(
              MIN_LIST_HEIGHT,
              container.height - MIN_EMAIL_VIEWER_HEIGHT,
            ),
            (rect.height || pane_height) + delta,
          ),
        );

        apply_size(next);
        update_preference("split_pane_height", Math.round(next));

        return;
      }
      const next = Math.max(
        MIN_LIST_WIDTH,
        Math.min(
          Math.max(MIN_LIST_WIDTH, container.width - MIN_EMAIL_VIEWER_WIDTH),
          (rect.width || pane_width) + delta,
        ),
      );

      apply_size(next);
      save_width(next, container.width);
    },
    [
      apply_size,
      get_resize_target,
      handle_reset,
      is_bottom_pane,
      measure_container,
      pane_height,
      pane_width,
      save_width,
      update_preference,
    ],
  );

  useEffect(() => {
    if (!is_dragging) return;
    const on_move = (e: MouseEvent) => {
      const start = drag_start_ref.current;

      if (!start) return;
      e.preventDefault();
      if (is_bottom_pane) {
        const new_height = Math.max(
          MIN_LIST_HEIGHT,
          Math.min(start.max_height, start.height + (e.clientY - start.y)),
        );

        drag_height_ref.current = new_height;
        if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
        raf_ref.current = requestAnimationFrame(() => apply_size(new_height));

        return;
      }
      const new_width = Math.max(
        MIN_LIST_WIDTH,
        Math.min(
          start.max_width,
          start.width + (e.clientX - start.x) * start.direction,
        ),
      );

      drag_width_ref.current = new_width;
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      raf_ref.current = requestAnimationFrame(() => apply_size(new_width));
    };
    const on_up = () => {
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      raf_ref.current = 0;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const target = get_resize_target();

      if (target) {
        target.style.pointerEvents = "";
        target.style.willChange = "";
      }
      if (detail_panel_ref.current) {
        detail_panel_ref.current.style.pointerEvents = "";
      }
      set_is_dragging(false);
      const start = drag_start_ref.current;

      if (is_bottom_pane && drag_height_ref.current !== null) {
        update_preference(
          "split_pane_height",
          Math.round(drag_height_ref.current),
        );
      } else if (!is_bottom_pane && drag_width_ref.current !== null && start) {
        save_width(drag_width_ref.current, start.container_width);
      }
      drag_width_ref.current = null;
      drag_height_ref.current = null;
      drag_start_ref.current = null;
    };

    window.addEventListener("mousemove", on_move, { passive: false });
    window.addEventListener("mouseup", on_up);
    window.addEventListener("blur", on_up);
    window.addEventListener("pointercancel", on_up);
    document.addEventListener("visibilitychange", on_up);

    return () => {
      window.removeEventListener("mousemove", on_move);
      window.removeEventListener("mouseup", on_up);
      window.removeEventListener("blur", on_up);
      window.removeEventListener("pointercancel", on_up);
      document.removeEventListener("visibilitychange", on_up);
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
    };
  }, [
    is_dragging,
    is_bottom_pane,
    update_preference,
    apply_size,
    get_resize_target,
    save_width,
  ]);

  return {
    is_dragging,
    pane_width,
    pane_height,
    list_panel_ref,
    list_column_ref,
    detail_panel_ref,
    handle_drag_start,
    handle_key_down,
    handle_reset,
  };
}
