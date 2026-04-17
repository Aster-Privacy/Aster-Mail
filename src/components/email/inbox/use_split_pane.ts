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

interface UseSplitPaneOptions {
  is_split_view: boolean;
  is_bottom_pane: boolean;
  split_pane_width: number;
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
  split_pane_height,
  update_preference,
  on_split_close,
  on_split_scheduled_close,
}: UseSplitPaneOptions) {
  const [is_dragging, set_is_dragging] = useState(false);
  const drag_start_ref = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    max_width: number;
    max_height: number;
  } | null>(null);
  const has_initialized_width = useRef(false);
  const has_initialized_height = useRef(false);
  const list_panel_ref = useRef<HTMLDivElement>(null);
  const list_scroll_ref = useRef<HTMLDivElement>(null);
  const detail_panel_ref = useRef<HTMLDivElement>(null);
  const raf_ref = useRef(0);
  const drag_width_ref = useRef<number | null>(null);
  const drag_height_ref = useRef<number | null>(null);

  useEffect(() => {
    if (has_initialized_width.current) return;
    const content_width = window.innerWidth - SIDEBAR_WIDTH;
    const max_width = Math.max(
      MIN_LIST_WIDTH,
      content_width - MIN_EMAIL_VIEWER_WIDTH,
    );
    const ideal_width = Math.floor(content_width * 0.5);
    const safe_width = Math.max(
      MIN_LIST_WIDTH,
      Math.min(max_width, ideal_width),
    );

    if (
      split_pane_width <= 0 ||
      split_pane_width > max_width ||
      split_pane_width < MIN_LIST_WIDTH
    ) {
      update_preference("split_pane_width", safe_width);
    }
    has_initialized_width.current = true;
  }, [split_pane_width, update_preference]);

  useEffect(() => {
    if (has_initialized_height.current) return;
    const content_height = window.innerHeight - 120;
    const max_height = Math.max(
      MIN_LIST_HEIGHT,
      content_height - MIN_EMAIL_VIEWER_HEIGHT,
    );
    const ideal_height = Math.floor(content_height * 0.5);
    const safe_height = Math.max(
      MIN_LIST_HEIGHT,
      Math.min(max_height, ideal_height),
    );

    if (
      split_pane_height <= 0 ||
      split_pane_height > max_height ||
      split_pane_height < MIN_LIST_HEIGHT
    ) {
      update_preference("split_pane_height", safe_height);
    }
    has_initialized_height.current = true;
  }, [split_pane_height, update_preference]);

  const default_width = Math.floor((window.innerWidth - SIDEBAR_WIDTH) * 0.5);
  const default_height = Math.floor((window.innerHeight - 120) * 0.5);
  const raw_pane_width = split_pane_width || default_width;
  const raw_pane_height = split_pane_height || default_height;
  const content_area_width = window.innerWidth - SIDEBAR_WIDTH;
  const max_allowed_width = Math.max(
    MIN_LIST_WIDTH,
    content_area_width - MIN_EMAIL_VIEWER_WIDTH,
  );
  const pane_width = Math.max(
    MIN_LIST_WIDTH,
    Math.min(raw_pane_width, max_allowed_width),
  );
  const content_area_height = window.innerHeight - 120;
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
    const handle_resize = () => {
      const viewport_width = window.innerWidth;

      if (viewport_width < 900 && on_split_close) {
        on_split_close();
      } else if (viewport_width < 900 && on_split_scheduled_close) {
        on_split_scheduled_close();
      }
    };

    window.addEventListener("resize", handle_resize);
    handle_resize();

    return () => window.removeEventListener("resize", handle_resize);
  }, [is_split_view, on_split_close, on_split_scheduled_close]);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const container = list_panel_ref.current?.parentElement;
      const container_rect = container?.getBoundingClientRect();
      const container_width = container_rect
        ? container_rect.width
        : window.innerWidth - SIDEBAR_WIDTH;
      const container_height = container_rect
        ? container_rect.height
        : window.innerHeight - 120;
      const current_width =
        list_panel_ref.current?.getBoundingClientRect().width || pane_width;
      const current_height =
        list_panel_ref.current?.getBoundingClientRect().height || pane_height;

      drag_start_ref.current = {
        x: e.clientX,
        y: e.clientY,
        width: current_width,
        height: current_height,
        max_width: Math.max(
          MIN_LIST_WIDTH,
          container_width - MIN_EMAIL_VIEWER_WIDTH,
        ),
        max_height: Math.max(
          MIN_LIST_HEIGHT,
          container_height - MIN_EMAIL_VIEWER_HEIGHT,
        ),
      };
      drag_width_ref.current = current_width;
      drag_height_ref.current = current_height;
      set_is_dragging(true);
      document.body.style.cursor = is_bottom_pane ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";
      if (list_panel_ref.current) {
        list_panel_ref.current.style.pointerEvents = "none";
        list_panel_ref.current.style.willChange = is_bottom_pane
          ? "height"
          : "width";
      }
      if (detail_panel_ref.current) {
        detail_panel_ref.current.style.pointerEvents = "none";
      }
    },
    [pane_width, pane_height, is_bottom_pane],
  );

  useEffect(() => {
    if (!is_dragging) return;
    const on_move = (e: MouseEvent) => {
      if (!drag_start_ref.current) return;
      e.preventDefault();
      if (is_bottom_pane) {
        const new_height = Math.max(
          MIN_LIST_HEIGHT,
          Math.min(
            drag_start_ref.current.max_height,
            drag_start_ref.current.height +
              (e.clientY - drag_start_ref.current.y),
          ),
        );

        drag_height_ref.current = new_height;
        if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
        raf_ref.current = requestAnimationFrame(() => {
          if (list_panel_ref.current) {
            list_panel_ref.current.style.height = `${new_height}px`;
          }
        });
      } else {
        const new_width = Math.max(
          MIN_LIST_WIDTH,
          Math.min(
            drag_start_ref.current.max_width,
            drag_start_ref.current.width +
              (e.clientX - drag_start_ref.current.x),
          ),
        );

        drag_width_ref.current = new_width;
        if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
        raf_ref.current = requestAnimationFrame(() => {
          if (list_panel_ref.current) {
            list_panel_ref.current.style.width = `${new_width}px`;
          }
        });
      }
    };
    const on_up = () => {
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
      raf_ref.current = 0;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (list_panel_ref.current) {
        list_panel_ref.current.style.pointerEvents = "";
        list_panel_ref.current.style.willChange = "";
      }
      if (detail_panel_ref.current) {
        detail_panel_ref.current.style.pointerEvents = "";
      }
      set_is_dragging(false);
      if (is_bottom_pane && drag_height_ref.current !== null) {
        update_preference("split_pane_height", drag_height_ref.current);
      } else if (drag_width_ref.current !== null) {
        update_preference("split_pane_width", drag_width_ref.current);
      }
      drag_width_ref.current = null;
      drag_height_ref.current = null;
      drag_start_ref.current = null;
    };

    window.addEventListener("mousemove", on_move, { passive: false });
    window.addEventListener("mouseup", on_up);

    return () => {
      window.removeEventListener("mousemove", on_move);
      window.removeEventListener("mouseup", on_up);
      if (raf_ref.current) cancelAnimationFrame(raf_ref.current);
    };
  }, [is_dragging, is_bottom_pane, update_preference]);

  return {
    is_dragging,
    pane_width,
    pane_height,
    list_panel_ref,
    list_scroll_ref,
    detail_panel_ref,
    handle_drag_start,
  };
}
