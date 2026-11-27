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
import type { UseEditorReturn } from "@/hooks/use_editor";
import type { ImageResizeHandle } from "@/lib/compose_image_size";

import { useCallback, useRef, useState } from "react";

import { TrashIcon } from "@/components/common/icons";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";
import { apply_input_transform } from "@/utils/input_transform";
import {
  IMAGE_RESIZE_HANDLES,
  MIN_IMAGE_WIDTH,
  get_editor_content_width,
  step_image_width,
} from "@/lib/compose_image_size";

type ImageResizeEditor = Pick<
  UseEditorReturn,
  | "selected_image"
  | "start_image_resize"
  | "delete_selected_image"
  | "set_image_width"
  | "deselect_image"
>;

interface ImageResizeOverlayProps {
  editor: ImageResizeEditor;
  container_ref: React.RefObject<HTMLElement | null>;
}

const HANDLE_HIT_SIZE = 24;
const TOOLBAR_HEIGHT = 24;
const TOOLBAR_GAP = 6;

const HANDLE_PLACEMENT: Record<
  ImageResizeHandle,
  { class_name: string; cursor: string }
> = {
  nw: {
    class_name: "top-0 left-0 -translate-x-1/2 -translate-y-1/2",
    cursor: "nwse-resize",
  },
  ne: {
    class_name: "top-0 right-0 translate-x-1/2 -translate-y-1/2",
    cursor: "nesw-resize",
  },
  sw: {
    class_name: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2",
    cursor: "nesw-resize",
  },
  se: {
    class_name: "bottom-0 right-0 translate-x-1/2 translate-y-1/2",
    cursor: "nwse-resize",
  },
};

export function compute_toolbar_top(
  img_top: number,
  img_height: number,
  container_height: number,
  scroll_top: number,
): number {
  const space_bottom = container_height + scroll_top - (img_top + img_height);
  const space_top = img_top - scroll_top;

  if (space_bottom >= TOOLBAR_HEIGHT + TOOLBAR_GAP) {
    return img_height + TOOLBAR_GAP;
  }

  if (space_top >= TOOLBAR_HEIGHT + TOOLBAR_GAP) {
    return -TOOLBAR_HEIGHT - TOOLBAR_GAP;
  }

  return Math.max(0, img_height - TOOLBAR_HEIGHT - 4);
}

function focus_editor_after(
  editor: HTMLElement | null,
  img: HTMLImageElement | null,
) {
  if (!editor) return;

  editor.focus();

  if (!img || !img.isConnected) return;

  const range = document.createRange();
  const selection = window.getSelection();

  range.setStartAfter(img);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function ImageWidthField({
  width,
  height,
  on_change,
}: {
  width: number;
  height: number;
  on_change: (w: number) => void;
}) {
  const { t } = use_i18n();
  const [editing, set_editing] = useState(false);
  const [value, set_value] = useState("");
  const input_ref = useRef<HTMLInputElement>(null);
  const aspect = width > 0 ? height / width : 1;

  const start_edit = useCallback(() => {
    set_value(String(Math.round(width)));
    set_editing(true);
    requestAnimationFrame(() => input_ref.current?.select());
  }, [width]);

  const commit = useCallback(() => {
    const parsed = parseInt(value, 10);

    if (parsed > 0 && parsed !== Math.round(width)) {
      on_change(parsed);
    }
    set_editing(false);
  }, [value, width, on_change]);

  const handle_key = useCallback(
    (e: React.KeyboardEvent) => {
      if (is_composing(e)) return;

      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        set_editing(false);
      }
    },
    [commit],
  );

  const chip_class =
    "inline-flex h-6 items-center gap-0.5 whitespace-nowrap rounded-[var(--aster-radius-item,6px)] bg-black/75 px-2 text-[11px] tabular-nums text-white shadow-sm";

  if (editing) {
    const parsed = parseInt(value, 10);
    const preview_height =
      parsed > 0 ? Math.round(parsed * aspect) : Math.round(height);

    return (
      <span className={chip_class} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input_ref}
          aria-label={t("mail.image_width_pixels")}
          className="w-9 border-none bg-transparent p-0 text-end text-[11px] text-white outline-none"
          inputMode="numeric"
          type="text"
          value={value}
          onBlur={commit}
          onChange={(e) =>
            set_value(
              apply_input_transform(e.target, (v) => v.replace(/\D/g, "")),
            )
          }
          onKeyDown={handle_key}
        />
        <span className="opacity-50">×</span>
        <span className="w-8">{preview_height}</span>
      </span>
    );
  }

  return (
    <button
      aria-label={t("mail.image_width_pixels")}
      className={`${chip_class} cursor-pointer border-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color,#3b82f6)]`}
      type="button"
      onClick={start_edit}
      onMouseDown={(e) => e.preventDefault()}
    >
      {Math.round(width)} × {Math.round(height)}
    </button>
  );
}

export function ImageResizeOverlay({
  editor,
  container_ref,
}: ImageResizeOverlayProps) {
  const { t } = use_i18n();
  const {
    selected_image,
    start_image_resize,
    delete_selected_image,
    set_image_width,
    deselect_image,
  } = editor;
  const container = container_ref.current;
  const img = selected_image?.image;

  if (!img || !selected_image?.rect || !container || !img.isConnected) {
    return null;
  }

  const editor_el = img.closest<HTMLElement>("[data-compose-editor]");
  const container_rect = container.getBoundingClientRect();
  const img_rect = img.getBoundingClientRect();
  const top = img_rect.top - container_rect.top + container.scrollTop;
  const left = img_rect.left - container_rect.left + container.scrollLeft;
  const toolbar_top = compute_toolbar_top(
    top,
    img_rect.height,
    container.clientHeight,
    container.scrollTop,
  );
  const max_width = get_editor_content_width(editor_el);
  const width = Math.round(img_rect.width);
  const height = Math.round(img_rect.height);

  const remove_image = () => {
    delete_selected_image();
    focus_editor_after(editor_el, null);
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      deselect_image();
      focus_editor_after(editor_el, img);

      return;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove_image();

      return;
    }

    const next = step_image_width(width, e.key, e.shiftKey, max_width);

    if (next === null) return;

    e.preventDefault();
    set_image_width(next);
  };

  return (
    <div
      className="pointer-events-none absolute z-10"
      data-image-resize-overlay=""
      style={{
        top: `${top}px`,
        left: `${left}px`,
        width: `${img_rect.width}px`,
        height: `${img_rect.height}px`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[2px] border-2 border-[var(--accent-color,#3b82f6)]" />
      {IMAGE_RESIZE_HANDLES.map((handle) => {
        const placement = HANDLE_PLACEMENT[handle];
        const is_primary = handle === "se";
        const slider_props = is_primary
          ? {
              role: "slider",
              tabIndex: 0,
              "aria-label": t("mail.resize_image"),
              "aria-orientation": "horizontal" as const,
              "aria-valuemin": MIN_IMAGE_WIDTH,
              "aria-valuemax": Number.isFinite(max_width)
                ? Math.round(max_width)
                : undefined,
              "aria-valuenow": width,
              "aria-valuetext": `${width} × ${height}`,
              onKeyDown: handle_key_down,
            }
          : { "aria-hidden": true, tabIndex: -1 };

        return (
          <div
            key={handle}
            className={`pointer-events-auto absolute flex items-center justify-center rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color,#3b82f6)] ${placement.class_name}`}
            data-image-resize-handle={handle}
            style={{
              width: `${HANDLE_HIT_SIZE}px`,
              height: `${HANDLE_HIT_SIZE}px`,
              cursor: placement.cursor,
              touchAction: "none",
            }}
            {...slider_props}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => start_image_resize(e, handle)}
          >
            <span className="block h-2.5 w-2.5 rounded-[2px] border border-white bg-[var(--accent-color,#3b82f6)] shadow-sm" />
          </div>
        );
      })}
      <div
        className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1"
        style={{ top: `${toolbar_top}px` }}
      >
        <ImageWidthField
          height={img_rect.height}
          width={img_rect.width}
          on_change={set_image_width}
        />
        <button
          aria-label={t("mail.delete_image")}
          className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-[var(--aster-radius-item,6px)] border-none bg-red-600/90 text-white shadow-sm hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          type="button"
          onClick={remove_image}
          onMouseDown={(e) => e.preventDefault()}
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
