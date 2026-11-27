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
import type { ImageResizeState } from "@/hooks/editor_utils";

import type { ImageResizeHandle } from "@/lib/compose_image_size";

import { useCallback, useState, useEffect, useRef } from "react";

import {
  apply_image_width,
  clamp_image_width,
  compute_drag_width,
  get_editor_content_width,
  read_image_width,
} from "@/lib/compose_image_size";

export function use_editor_image(
  editor_ref: React.RefObject<HTMLDivElement | null>,
  handle_input: () => void,
) {
  const selected_image_ref = useRef<HTMLImageElement | null>(null);
  const dragged_image_ref = useRef<HTMLImageElement | null>(null);
  const resize_cleanup_ref = useRef<(() => void) | null>(null);

  const [selected_image, set_selected_image] = useState<ImageResizeState>({
    image: null,
    rect: null,
  });

  const update_image_rect = useCallback(() => {
    const img = selected_image_ref.current;

    if (!img || !img.isConnected) {
      set_selected_image({ image: null, rect: null });
      selected_image_ref.current = null;

      return;
    }

    set_selected_image({ image: img, rect: img.getBoundingClientRect() });
  }, []);

  const deselect_image = useCallback(() => {
    selected_image_ref.current = null;
    set_selected_image({ image: null, rect: null });
  }, []);

  const delete_selected_image = useCallback(() => {
    const img = selected_image_ref.current;

    if (img && img.isConnected) {
      img.remove();
      handle_input();
    }
    deselect_image();
  }, [deselect_image, handle_input]);

  const start_image_resize = useCallback(
    (e: React.PointerEvent, handle: ImageResizeHandle) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      const img = selected_image_ref.current;

      if (!img) return;

      const pointer_id = e.pointerId;
      const start_x = e.clientX;
      const start_y = e.clientY;
      const start_width = img.offsetWidth || read_image_width(img);
      const start_height = img.offsetHeight || start_width;
      const max_width = get_editor_content_width(editor_ref.current);

      const on_pointer_move = (move_e: PointerEvent) => {
        if (move_e.pointerId !== pointer_id) return;

        move_e.preventDefault();

        const next_width = compute_drag_width({
          handle,
          start_width,
          start_height,
          dx: move_e.clientX - start_x,
          dy: move_e.clientY - start_y,
          max_width,
        });

        apply_image_width(img, next_width);
        update_image_rect();
      };

      const detach = () => {
        document.removeEventListener("pointermove", on_pointer_move);
        document.removeEventListener("pointerup", on_pointer_end);
        document.removeEventListener("pointercancel", on_pointer_end);
        resize_cleanup_ref.current = null;
      };

      const on_pointer_end = (end_e: PointerEvent) => {
        if (end_e.pointerId !== pointer_id) return;

        detach();
        handle_input();
        update_image_rect();
      };

      resize_cleanup_ref.current?.();
      document.addEventListener("pointermove", on_pointer_move, {
        passive: false,
      });
      document.addEventListener("pointerup", on_pointer_end);
      document.addEventListener("pointercancel", on_pointer_end);
      resize_cleanup_ref.current = detach;
    },
    [editor_ref, update_image_rect, handle_input],
  );

  useEffect(
    () => () => {
      resize_cleanup_ref.current?.();
    },
    [],
  );

  const set_image_width = useCallback(
    (width: number) => {
      const img = selected_image_ref.current;

      if (!img) return;

      apply_image_width(
        img,
        clamp_image_width(width, get_editor_content_width(editor_ref.current)),
      );
      handle_input();
      update_image_rect();
    },
    [editor_ref, handle_input, update_image_rect],
  );

  useEffect(() => {
    const editor = editor_ref.current;

    if (!editor) return;

    const handle_editor_click = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "IMG" && editor.contains(target)) {
        selected_image_ref.current = target as HTMLImageElement;
        update_image_rect();

        return;
      }

      if (selected_image_ref.current) {
        deselect_image();
      }
    };

    const handle_dragstart = (e: DragEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "IMG" && editor.contains(target)) {
        dragged_image_ref.current = target as HTMLImageElement;
        deselect_image();
      }
    };

    const handle_dragend = () => {
      dragged_image_ref.current = null;
    };

    const handle_global_mousedown = (e: MouseEvent) => {
      if (!selected_image_ref.current) return;

      const target = e.target as Element | null;

      if (target?.closest?.("[data-image-resize-overlay]")) return;

      if (!editor.contains(target)) {
        deselect_image();
      }
    };

    const handle_keydown_for_image = (e: KeyboardEvent) => {
      if (!selected_image_ref.current) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        delete_selected_image();
      } else if (e.key === "Escape") {
        deselect_image();
      }
    };

    const handle_scroll = () => {
      if (selected_image_ref.current) {
        update_image_rect();
      }
    };

    editor.addEventListener("click", handle_editor_click);
    editor.addEventListener("dragstart", handle_dragstart);
    editor.addEventListener("dragend", handle_dragend);
    document.addEventListener("mousedown", handle_global_mousedown);
    editor.addEventListener("keydown", handle_keydown_for_image);
    editor.parentElement?.addEventListener("scroll", handle_scroll);
    window.addEventListener("resize", handle_scroll);

    return () => {
      editor.removeEventListener("click", handle_editor_click);
      editor.removeEventListener("dragstart", handle_dragstart);
      editor.removeEventListener("dragend", handle_dragend);
      document.removeEventListener("mousedown", handle_global_mousedown);
      editor.removeEventListener("keydown", handle_keydown_for_image);
      editor.parentElement?.removeEventListener("scroll", handle_scroll);
      window.removeEventListener("resize", handle_scroll);
    };
  }, [editor_ref, update_image_rect, deselect_image, delete_selected_image]);

  return {
    selected_image_ref,
    dragged_image_ref,
    selected_image,
    update_image_rect,
    deselect_image,
    delete_selected_image,
    start_image_resize,
    set_image_width,
  };
}
