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
import { useState, useEffect, useCallback, useRef } from "react";

interface ModalSize {
  width: number;
  height: number;
}

interface Position {
  x: number;
  y: number;
}

interface DraggableModalState {
  position: Position;
  is_dragging: boolean;
  has_been_moved: boolean;
}

interface DraggableModalReturn {
  position: Position;
  has_been_moved: boolean;
  is_dragging: boolean;
  did_drag: () => boolean;
  handle_drag_start: (e: React.MouseEvent) => void;
  reset: () => void;
  get_position_style: () => React.CSSProperties;
}

const DRAG_THRESHOLD = 5;

export function use_draggable_modal(
  is_open: boolean,
  modal_size: ModalSize,
): DraggableModalReturn {
  const [state, set_state] = useState<DraggableModalState>({
    position: { x: 0, y: 0 },
    is_dragging: false,
    has_been_moved: false,
  });
  const [drag_start, set_drag_start] = useState<Position>({ x: 0, y: 0 });
  const [initial_mouse_pos, set_initial_mouse_pos] = useState<Position>({
    x: 0,
    y: 0,
  });
  const movement_occurred_ref = useRef(false);

  useEffect(() => {
    if (is_open) {
      set_state({
        position: { x: 0, y: 0 },
        is_dragging: false,
        has_been_moved: false,
      });
    }
  }, [is_open]);

  const handle_drag_start = useCallback(
    (e: React.MouseEvent) => {
      const rect = (
        e.currentTarget as HTMLElement
      ).parentElement?.getBoundingClientRect();

      if (!rect) return;

      movement_occurred_ref.current = false;
      set_initial_mouse_pos({ x: e.clientX, y: e.clientY });

      const new_drag_start = !state.has_been_moved
        ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
        : { x: e.clientX - state.position.x, y: e.clientY - state.position.y };

      if (!state.has_been_moved) {
        set_state((prev) => ({
          ...prev,
          position: { x: rect.left, y: rect.top },
          is_dragging: true,
        }));
      } else {
        set_state((prev) => ({ ...prev, is_dragging: true }));
      }

      set_drag_start(new_drag_start);
    },
    [state.has_been_moved, state.position],
  );

  useEffect(() => {
    if (!state.is_dragging) return;

    const handle_move = (e: MouseEvent) => {
      const dx = Math.abs(e.clientX - initial_mouse_pos.x);
      const dy = Math.abs(e.clientY - initial_mouse_pos.y);
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < DRAG_THRESHOLD && !movement_occurred_ref.current) {
        return;
      }

      movement_occurred_ref.current = true;

      const new_x = Math.max(
        0,
        Math.min(
          e.clientX - drag_start.x,
          window.innerWidth - modal_size.width,
        ),
      );
      const new_y = Math.max(
        0,
        Math.min(
          e.clientY - drag_start.y,
          window.innerHeight - modal_size.height,
        ),
      );

      set_state((prev) => ({
        ...prev,
        position: { x: new_x, y: new_y },
        has_been_moved: true,
      }));
    };

    const handle_up = () => {
      set_state((prev) => ({ ...prev, is_dragging: false }));
    };

    window.addEventListener("mousemove", handle_move);
    window.addEventListener("mouseup", handle_up);

    return () => {
      window.removeEventListener("mousemove", handle_move);
      window.removeEventListener("mouseup", handle_up);
    };
  }, [state.is_dragging, drag_start, modal_size, initial_mouse_pos]);

  const reset = useCallback(() => {
    set_state({
      position: { x: 0, y: 0 },
      is_dragging: false,
      has_been_moved: false,
    });
    movement_occurred_ref.current = false;
  }, []);

  const did_drag = useCallback(() => {
    const result = movement_occurred_ref.current;

    movement_occurred_ref.current = false;

    return result;
  }, []);

  const get_position_style = useCallback((): React.CSSProperties => {
    if (!state.has_been_moved) {
      return {
        left: "auto",
        top: "auto",
        right: "1rem",
        bottom: "1rem",
      };
    }

    return {
      left: `${state.position.x}px`,
      top: `${state.position.y}px`,
      right: "auto",
      bottom: "auto",
    };
  }, [state.has_been_moved, state.position]);

  return {
    position: state.position,
    has_been_moved: state.has_been_moved,
    is_dragging: state.is_dragging,
    did_drag,
    handle_drag_start,
    reset,
    get_position_style,
  };
}
