import { useState, useEffect, useCallback } from "react";

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
  handle_drag_start: (e: React.MouseEvent) => void;
  reset: () => void;
  get_position_style: () => React.CSSProperties;
}

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

      const new_drag_start = !state.has_been_moved
        ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
        : { x: e.clientX - state.position.x, y: e.clientY - state.position.y };

      if (!state.has_been_moved) {
        set_state((prev) => ({
          ...prev,
          position: { x: rect.left, y: rect.top },
          has_been_moved: true,
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

      set_state((prev) => ({ ...prev, position: { x: new_x, y: new_y } }));
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
  }, [state.is_dragging, drag_start, modal_size]);

  const reset = useCallback(() => {
    set_state({
      position: { x: 0, y: 0 },
      is_dragging: false,
      has_been_moved: false,
    });
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
    handle_drag_start,
    reset,
    get_position_style,
  };
}
