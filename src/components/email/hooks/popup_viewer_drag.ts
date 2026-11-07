//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useState, useCallback, useEffect, useRef, useMemo } from "react";

import { type PopupSize } from "@/components/email/hooks/popup_viewer_types";
import {
  type PopupViewport,
  read_popup_viewport,
  get_popup_dimensions,
  get_centered_popup_position,
  clamp_popup_position,
} from "@/components/email/hooks/popup_viewer_layout";

function centered_for(size: PopupSize) {
  const viewport = read_popup_viewport();

  return get_centered_popup_position(
    get_popup_dimensions(size, viewport),
    viewport,
  );
}

export function use_popup_drag_resize() {
  const [popup_size, set_popup_size] = useState<PopupSize>("default");
  const [viewport, set_viewport] = useState<PopupViewport>(read_popup_viewport);
  const [raw_position, set_raw_position] = useState(() =>
    centered_for("default"),
  );
  const [is_dragging, set_is_dragging] = useState(false);
  const [is_exiting_fullscreen, set_is_exiting_fullscreen] = useState(false);
  const drag_start_ref = useRef({ x: 0, y: 0, pos_x: 0, pos_y: 0 });
  const exit_fullscreen_timeout = useRef<number | null>(null);
  const popup_ref = useRef<HTMLDivElement>(null);

  const is_fullscreen = popup_size === "fullscreen";

  const dimensions = useMemo(
    () => get_popup_dimensions(popup_size, viewport),
    [popup_size, viewport],
  );

  const position = useMemo(
    () => clamp_popup_position(raw_position, dimensions, viewport),
    [raw_position, dimensions, viewport],
  );

  useEffect(() => {
    const handle_resize = () => set_viewport(read_popup_viewport());

    window.addEventListener("resize", handle_resize);

    return () => window.removeEventListener("resize", handle_resize);
  }, []);

  useEffect(() => {
    return () => {
      if (exit_fullscreen_timeout.current !== null) {
        window.clearTimeout(exit_fullscreen_timeout.current);
      }
    };
  }, []);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      if (is_fullscreen) return;
      if (!e.currentTarget.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest("button")) return;
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      set_is_dragging(true);
      drag_start_ref.current = {
        x: e.clientX,
        y: e.clientY,
        pos_x: position.x,
        pos_y: position.y,
      };
    },
    [position, is_fullscreen],
  );

  useEffect(() => {
    if (!is_dragging) return;

    let frame = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const next = pending;

      pending = null;
      set_raw_position(next);
    };

    const handle_mouse_move = (e: MouseEvent) => {
      const dx = e.clientX - drag_start_ref.current.x;
      const dy = e.clientY - drag_start_ref.current.y;

      pending = {
        x: drag_start_ref.current.pos_x + dx,
        y: drag_start_ref.current.pos_y + dy,
      };

      if (frame === 0) frame = window.requestAnimationFrame(flush);
    };

    const handle_mouse_up = () => {
      flush();
      set_is_dragging(false);
    };

    document.addEventListener("mousemove", handle_mouse_move);
    document.addEventListener("mouseup", handle_mouse_up);

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      document.removeEventListener("mousemove", handle_mouse_move);
      document.removeEventListener("mouseup", handle_mouse_up);
    };
  }, [is_dragging]);

  const toggle_size = useCallback(() => {
    if (is_fullscreen) return;

    const new_size = popup_size === "default" ? "expanded" : "default";
    const current_viewport = read_popup_viewport();
    const new_dimensions = get_popup_dimensions(new_size, current_viewport);

    set_popup_size(new_size);
    set_viewport(current_viewport);
    set_raw_position({
      x: position.x,
      y: Math.round((current_viewport.height - new_dimensions.height) / 2),
    });
  }, [popup_size, is_fullscreen, position.x]);

  const handle_fullscreen = useCallback(() => {
    if (is_fullscreen) {
      set_is_exiting_fullscreen(true);
      exit_fullscreen_timeout.current = window.setTimeout(() => {
        set_popup_size("default");
        set_viewport(read_popup_viewport());
        set_raw_position(centered_for("default"));
        set_is_exiting_fullscreen(false);
      }, 150);
    } else {
      set_popup_size("fullscreen");
    }
  }, [is_fullscreen]);

  return {
    popup_size,
    position,
    is_dragging,
    is_fullscreen,
    is_exiting_fullscreen,
    dimensions,
    popup_ref,
    handle_drag_start,
    toggle_size,
    handle_fullscreen,
  };
}
