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

import { useCallback, useState, useEffect, useRef } from "react";

export function use_editor_image(
  editor_ref: React.RefObject<HTMLDivElement | null>,
  handle_input: () => void,
) {
  const selected_image_ref = useRef<HTMLImageElement | null>(null);
  const dragged_image_ref = useRef<HTMLImageElement | null>(null);

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
    (
      e: React.MouseEvent,
      handle: string,
      container_ref: React.RefObject<HTMLElement>,
    ) => {
      e.preventDefault();
      e.stopPropagation();

      const img = selected_image_ref.current;

      if (!img) return;

      const start_x = e.clientX;
      const start_y = e.clientY;
      const start_width = img.offsetWidth;
      const start_height = img.offsetHeight;
      const aspect_ratio = start_width / start_height;
      const container = container_ref.current;
      const max_width = container
        ? container.clientWidth - 32
        : start_width * 3;
      const min_width = 50;

      const on_mouse_move = (move_e: MouseEvent) => {
        let dx = move_e.clientX - start_x;
        let dy = move_e.clientY - start_y;

        let new_width = start_width;
        let new_height = start_height;

        if (handle.includes("e")) {
          new_width = Math.max(
            min_width,
            Math.min(max_width, start_width + dx),
          );
          new_height = new_width / aspect_ratio;
        } else if (handle.includes("w")) {
          new_width = Math.max(
            min_width,
            Math.min(max_width, start_width - dx),
          );
          new_height = new_width / aspect_ratio;
        } else if (handle.includes("s")) {
          new_height = Math.max(min_width / aspect_ratio, start_height + dy);
          new_width = new_height * aspect_ratio;
        } else if (handle.includes("n")) {
          new_height = Math.max(min_width / aspect_ratio, start_height - dy);
          new_width = new_height * aspect_ratio;
        }

        new_width = Math.max(min_width, Math.min(max_width, new_width));
        new_height = new_width / aspect_ratio;

        img.style.width = `${Math.round(new_width)}px`;
        img.style.height = "auto";
        img.style.maxWidth = `${Math.round(new_width)}px`;
        img.removeAttribute("width");
        img.removeAttribute("height");

        update_image_rect();
      };

      const on_mouse_up = () => {
        document.removeEventListener("mousemove", on_mouse_move);
        document.removeEventListener("mouseup", on_mouse_up);
        handle_input();
        update_image_rect();
      };

      document.addEventListener("mousemove", on_mouse_move);
      document.addEventListener("mouseup", on_mouse_up);
    },
    [update_image_rect, handle_input],
  );

  const set_image_width = useCallback(
    (width: number) => {
      const img = selected_image_ref.current;

      if (!img) return;

      const clamped = Math.max(20, Math.round(width));

      img.style.width = `${clamped}px`;
      img.style.height = "auto";
      img.style.maxWidth = `${clamped}px`;
      img.removeAttribute("width");
      img.removeAttribute("height");
      handle_input();
      update_image_rect();
    },
    [handle_input, update_image_rect],
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

      if (!editor.contains(e.target as Node)) {
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
