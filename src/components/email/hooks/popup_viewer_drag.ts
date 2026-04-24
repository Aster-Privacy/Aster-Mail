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

import {
  type PopupSize,
  POPUP_MARGIN,
  FULLSCREEN_MARGIN,
} from "@/components/email/hooks/popup_viewer_types";

export function use_popup_drag_resize(preview_mode?: "popup" | "split" | "fullpage") {
  const is_split_mode = preview_mode === "split";
  const is_fullpage_mode = preview_mode === "fullpage";
  const [popup_size, set_popup_size] = useState<PopupSize>(is_fullpage_mode ? "fullscreen" : "default");
  const [position, set_position] = useState({ x: 0, y: 0 });
  const [is_dragging, set_is_dragging] = useState(false);
  const [is_exiting_fullscreen, set_is_exiting_fullscreen] = useState(false);
  const drag_start_ref = useRef({ x: 0, y: 0, pos_x: 0, pos_y: 0 });
  const popup_ref = useRef<HTMLDivElement>(null);

  const is_fullscreen = popup_size === "fullscreen";

  const dimensions = useMemo(() => {
    if (is_split_mode) {
      return {
        width: Math.min(Math.round(window.innerWidth * 0.5), 800),
        height: window.innerHeight - POPUP_MARGIN * 2,
      };
    }

    if (is_fullscreen) {
      return {
        width: window.innerWidth - FULLSCREEN_MARGIN * 2,
        height: window.innerHeight - FULLSCREEN_MARGIN * 2,
      };
    }

    return {
      width: 680,
      height: popup_size === "expanded" ? 860 : 720,
    };
  }, [popup_size, is_fullscreen, is_split_mode]);

  useEffect(() => {
    if (is_split_mode) {
      set_position({
        x: window.innerWidth - dimensions.width - POPUP_MARGIN,
        y: POPUP_MARGIN,
      });
    } else {
      set_position({
        x: window.innerWidth - dimensions.width - POPUP_MARGIN,
        y: window.innerHeight - dimensions.height - POPUP_MARGIN,
      });
    }
  }, []);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      if (is_fullscreen || is_split_mode) return;
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
    [position, is_fullscreen, is_split_mode],
  );

  useEffect(() => {
    if (!is_dragging) return;

    const handle_mouse_move = (e: MouseEvent) => {
      const dx = e.clientX - drag_start_ref.current.x;
      const dy = e.clientY - drag_start_ref.current.y;

      set_position({
        x: drag_start_ref.current.pos_x + dx,
        y: drag_start_ref.current.pos_y + dy,
      });
    };

    const handle_mouse_up = () => {
      set_is_dragging(false);
    };

    document.addEventListener("mousemove", handle_mouse_move);
    document.addEventListener("mouseup", handle_mouse_up);

    return () => {
      document.removeEventListener("mousemove", handle_mouse_move);
      document.removeEventListener("mouseup", handle_mouse_up);
    };
  }, [is_dragging]);

  const toggle_size = useCallback(() => {
    if (is_fullscreen || is_split_mode) return;

    const new_size = popup_size === "default" ? "expanded" : "default";
    const new_height = new_size === "expanded" ? 820 : 640;

    set_popup_size(new_size);
    set_position((prev) => ({
      x: prev.x,
      y: Math.max(POPUP_MARGIN, window.innerHeight - new_height - POPUP_MARGIN),
    }));
  }, [popup_size, is_fullscreen]);

  const handle_fullscreen = useCallback(() => {
    if (is_fullscreen) {
      set_is_exiting_fullscreen(true);
      setTimeout(() => {
        set_popup_size("default");
        set_position({
          x: window.innerWidth - 520 - POPUP_MARGIN,
          y: window.innerHeight - 640 - POPUP_MARGIN,
        });
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
    is_split_mode,
    is_exiting_fullscreen,
    dimensions,
    popup_ref,
    handle_drag_start,
    toggle_size,
    handle_fullscreen,
  };
}
