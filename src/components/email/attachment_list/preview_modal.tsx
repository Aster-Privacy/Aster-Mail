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
import type { TranslationKey } from "@/lib/i18n/types";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { DownloadIcon, PreviewChevronIcon } from "./icons";

import { use_dialog_shell } from "@/lib/use_dialog_shell";
import { is_top_overlay_layer } from "@/lib/overlay_layer_stack";

export const PREVIEW_MIN_SCALE = 1;
export const PREVIEW_MAX_SCALE = 8;
export const PREVIEW_ZOOM_STEP = 1.5;
export const PREVIEW_CLICK_SCALE = 2.5;

const DRAG_THRESHOLD_PX = 4;
const WHEEL_ZOOM_RATE = 0.01;

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

interface GestureState {
  start_scale: number;
  start_distance: number;
  start_x: number;
  start_y: number;
  origin_x: number;
  origin_y: number;
  moved: boolean;
}

const FIT_STATE: ZoomState = { scale: 1, x: 0, y: 0 };

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

const TOOL_BUTTON_CLASS = `flex h-9 w-9 items-center justify-center rounded-full text-white/90 bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-40 disabled:hover:bg-white/10 ${FOCUS_RING}`;

const NAV_BUTTON_CLASS = `absolute top-1/2 z-10 -translate-y-1/2 rounded-full p-2.5 text-white/90 bg-white/10 hover:bg-white/20 transition-colors ${FOCUS_RING}`;

function clamp_scale(scale: number): number {
  return Math.min(PREVIEW_MAX_SCALE, Math.max(PREVIEW_MIN_SCALE, scale));
}

export function ImagePreviewModal({
  src,
  filename,
  caption,
  on_close,
  on_download,
  on_open_link,
  on_prev,
  on_next,
  counter,
  reduce_motion,
  t,
}: {
  src: string;
  filename: string;
  caption?: string;
  on_close: () => void;
  on_download: () => void;
  on_open_link?: () => void;
  on_prev?: () => void;
  on_next?: () => void;
  counter?: string;
  reduce_motion: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { layer_id, dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(true, on_close, "image_preview");
  const caption_id = useId();
  const [zoom, set_zoom] = useState<ZoomState>(FIT_STATE);
  const [is_dragging, set_is_dragging] = useState(false);
  const zoom_ref = useRef<ZoomState>(FIT_STATE);
  const stage_ref = useRef<HTMLDivElement>(null);
  const image_ref = useRef<HTMLImageElement>(null);
  const pointers_ref = useRef(new Map<number, { x: number; y: number }>());
  const gesture_ref = useRef<GestureState | null>(null);
  const moved_ref = useRef(false);
  const press_on_image_ref = useRef<boolean | null>(null);

  const clamp_offset = useCallback((next: ZoomState): ZoomState => {
    const stage = stage_ref.current;
    const image = image_ref.current;

    if (next.scale <= PREVIEW_MIN_SCALE) return FIT_STATE;
    if (!stage || !image) return next;

    const max_x = Math.max(
      0,
      (image.offsetWidth * next.scale - stage.clientWidth) / 2,
    );
    const max_y = Math.max(
      0,
      (image.offsetHeight * next.scale - stage.clientHeight) / 2,
    );

    return {
      scale: next.scale,
      x: Math.min(max_x, Math.max(-max_x, next.x)),
      y: Math.min(max_y, Math.max(-max_y, next.y)),
    };
  }, []);

  const apply_zoom = useCallback(
    (next: ZoomState) => {
      const clamped = clamp_offset(next);

      zoom_ref.current = clamped;
      set_zoom(clamped);
    },
    [clamp_offset],
  );

  const zoom_at = useCallback(
    (target_scale: number, point_x = 0, point_y = 0) => {
      const current = zoom_ref.current;
      const scale = clamp_scale(target_scale);
      const ratio = scale / current.scale;

      apply_zoom({
        scale,
        x: point_x - (point_x - current.x) * ratio,
        y: point_y - (point_y - current.y) * ratio,
      });
    },
    [apply_zoom],
  );

  const is_on_image = (target: EventTarget | null) =>
    target instanceof Node && !!image_ref.current?.contains(target);

  const stage_point = useCallback((client_x: number, client_y: number) => {
    const rect = stage_ref.current?.getBoundingClientRect();

    if (!rect) return { x: 0, y: 0 };

    return {
      x: client_x - rect.left - rect.width / 2,
      y: client_y - rect.top - rect.height / 2,
    };
  }, []);

  useEffect(() => {
    zoom_ref.current = FIT_STATE;
    set_zoom(FIT_STATE);
    pointers_ref.current.clear();
    gesture_ref.current = null;
    set_is_dragging(false);
  }, [src]);

  useEffect(() => {
    const stage = stage_ref.current;

    if (!stage) return;

    const handle_wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const point = stage_point(e.clientX, e.clientY);

      zoom_at(
        zoom_ref.current.scale * Math.exp(-e.deltaY * WHEEL_ZOOM_RATE),
        point.x,
        point.y,
      );
    };

    stage.addEventListener("wheel", handle_wheel, { passive: false });

    return () => stage.removeEventListener("wheel", handle_wheel);
  }, [stage_point, zoom_at]);

  useEffect(() => {
    const handle_key = (e: KeyboardEvent) => {
      if (!is_top_overlay_layer(layer_id)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "ArrowLeft" && on_prev) {
        e.preventDefault();
        e.stopPropagation();
        on_prev();

        return;
      }

      if (e.key === "ArrowRight" && on_next) {
        e.preventDefault();
        e.stopPropagation();
        on_next();

        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoom_at(zoom_ref.current.scale * PREVIEW_ZOOM_STEP);

        return;
      }

      if (e.key === "-") {
        e.preventDefault();
        zoom_at(zoom_ref.current.scale / PREVIEW_ZOOM_STEP);

        return;
      }

      if (e.key === "0") {
        e.preventDefault();
        apply_zoom(FIT_STATE);
      }
    };

    window.addEventListener("keydown", handle_key, true);

    return () => window.removeEventListener("keydown", handle_key, true);
  }, [layer_id, on_prev, on_next, zoom_at, apply_zoom]);

  const start_gesture = (
    origin_x: number,
    origin_y: number,
    moved: boolean,
  ) => {
    const current = zoom_ref.current;

    gesture_ref.current = {
      start_scale: current.scale,
      start_distance: 0,
      start_x: current.x,
      start_y: current.y,
      origin_x,
      origin_y,
      moved,
    };
  };

  const handle_pointer_down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers_ref.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers_ref.current.size === 1) {
      press_on_image_ref.current = is_on_image(e.target);
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    moved_ref.current = false;

    const points = [...pointers_ref.current.values()];

    if (points.length >= 2) {
      const [a, b] = points;
      const mid = stage_point((a.x + b.x) / 2, (a.y + b.y) / 2);
      const current = zoom_ref.current;

      gesture_ref.current = {
        start_scale: current.scale,
        start_distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        start_x: current.x,
        start_y: current.y,
        origin_x: mid.x,
        origin_y: mid.y,
        moved: true,
      };

      return;
    }

    start_gesture(e.clientX, e.clientY, false);
  };

  const handle_pointer_move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers_ref.current.has(e.pointerId)) return;
    pointers_ref.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const gesture = gesture_ref.current;

    if (!gesture) return;

    const points = [...pointers_ref.current.values()];

    if (points.length >= 2 && gesture.start_distance > 0) {
      const [a, b] = points;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const scale = clamp_scale(
        gesture.start_scale * (distance / gesture.start_distance),
      );
      const ratio = scale / gesture.start_scale;

      moved_ref.current = true;
      set_is_dragging(true);
      apply_zoom({
        scale,
        x: gesture.origin_x - (gesture.origin_x - gesture.start_x) * ratio,
        y: gesture.origin_y - (gesture.origin_y - gesture.start_y) * ratio,
      });

      return;
    }

    const dx = e.clientX - gesture.origin_x;
    const dy = e.clientY - gesture.origin_y;

    if (!gesture.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    gesture.moved = true;
    moved_ref.current = true;

    if (zoom_ref.current.scale <= PREVIEW_MIN_SCALE) return;

    set_is_dragging(true);
    apply_zoom({
      scale: zoom_ref.current.scale,
      x: gesture.start_x + dx,
      y: gesture.start_y + dy,
    });
  };

  const handle_pointer_end = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointers_ref.current.delete(e.pointerId);

    const [remaining] = [...pointers_ref.current.values()];

    if (!remaining) {
      gesture_ref.current = null;
      set_is_dragging(false);

      return;
    }

    start_gesture(remaining.x, remaining.y, true);
  };

  const toggle_zoom = (point?: { x: number; y: number }) => {
    if (zoom_ref.current.scale > PREVIEW_MIN_SCALE) {
      apply_zoom(FIT_STATE);

      return;
    }

    zoom_at(PREVIEW_CLICK_SCALE, point?.x, point?.y);
  };

  const handle_stage_click = (e: ReactMouseEvent<HTMLDivElement>) => {
    const pressed_image = press_on_image_ref.current ?? is_on_image(e.target);

    press_on_image_ref.current = null;
    if (moved_ref.current) {
      moved_ref.current = false;

      return;
    }

    if (pressed_image) {
      toggle_zoom(stage_point(e.clientX, e.clientY));

      return;
    }

    on_close();
  };

  const handle_image_key = (e: ReactKeyboardEvent<HTMLImageElement>) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    toggle_zoom();
  };

  const is_zoomed = zoom.scale > PREVIEW_MIN_SCALE;
  const caption_text = caption?.trim() ?? "";
  const image_cursor = is_dragging
    ? "grabbing"
    : is_zoomed
      ? "zoom-out"
      : "zoom-in";

  return (
    <motion.div
      ref={dialog_ref}
      animate={{ opacity: 1 }}
      aria-describedby={caption_text ? caption_id : undefined}
      aria-label={filename}
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex flex-col outline-none"
      data-testid="image_preview_modal"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      tabIndex={-1}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
      onPointerDown={handle_backdrop_pointer_down}
    >
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
        <span className="min-w-0 flex-1 truncate text-sm text-white/70">
          {filename}
        </span>
        <button
          aria-label={t("common.zoom_out")}
          className={TOOL_BUTTON_CLASS}
          data-testid="image_preview_zoom_out"
          disabled={!is_zoomed}
          title={t("common.zoom_out")}
          type="button"
          onClick={() => zoom_at(zoom_ref.current.scale / PREVIEW_ZOOM_STEP)}
        >
          <MagnifyingGlassMinusIcon className="h-5 w-5" />
        </button>
        <button
          aria-label={t("common.zoom_to_fit")}
          className={`h-9 min-w-[3.5rem] rounded-full bg-white/10 px-2 text-xs font-medium tabular-nums text-white/90 transition-colors hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 ${FOCUS_RING}`}
          data-testid="image_preview_zoom_reset"
          disabled={!is_zoomed}
          title={t("common.zoom_to_fit")}
          type="button"
          onClick={() => apply_zoom(FIT_STATE)}
        >
          {`${Math.round(zoom.scale * 100)}%`}
        </button>
        <button
          aria-label={t("common.zoom_in")}
          className={TOOL_BUTTON_CLASS}
          data-testid="image_preview_zoom_in"
          disabled={zoom.scale >= PREVIEW_MAX_SCALE}
          title={t("common.zoom_in")}
          type="button"
          onClick={() => zoom_at(zoom_ref.current.scale * PREVIEW_ZOOM_STEP)}
        >
          <MagnifyingGlassPlusIcon className="h-5 w-5" />
        </button>
        {on_open_link && (
          <button
            aria-label={t("common.open_link")}
            className={TOOL_BUTTON_CLASS}
            data-testid="image_preview_open_link"
            title={t("common.open_link")}
            type="button"
            onClick={on_open_link}
          >
            <ArrowTopRightOnSquareIcon className="h-5 w-5" />
          </button>
        )}
        <button
          aria-label={t("common.download")}
          className={TOOL_BUTTON_CLASS}
          data-testid="image_preview_download"
          title={t("common.download")}
          type="button"
          onClick={on_download}
        >
          <DownloadIcon className="h-5 w-5" />
        </button>
        <button
          aria-label={t("common.close")}
          className={TOOL_BUTTON_CLASS}
          data-testid="image_preview_close"
          title={t("common.close")}
          type="button"
          onClick={on_close}
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center">
        {on_prev && (
          <button
            aria-label={t("common.previous")}
            className={`start-3 ${NAV_BUTTON_CLASS}`}
            data-testid="image_preview_prev"
            title={t("common.previous")}
            type="button"
            onClick={on_prev}
          >
            <PreviewChevronIcon direction="left" />
          </button>
        )}
        <motion.div
          ref={stage_ref}
          animate={{ scale: 1, opacity: 1 }}
          className="flex h-full w-full items-center justify-center overflow-hidden px-4 py-2"
          data-testid="image_preview_stage"
          exit={{ scale: reduce_motion ? 1 : 0.95, opacity: 0 }}
          initial={{ scale: reduce_motion ? 1 : 0.95, opacity: 0 }}
          style={{ touchAction: "none" }}
          transition={{ duration: reduce_motion ? 0 : 0.2 }}
          onClick={handle_stage_click}
          onPointerCancel={handle_pointer_end}
          onPointerDown={handle_pointer_down}
          onPointerMove={handle_pointer_move}
          onPointerUp={handle_pointer_end}
        >
          <motion.img
            ref={image_ref}
            alt={caption_text || filename}
            animate={{ x: zoom.x, y: zoom.y, scale: zoom.scale }}
            className={`max-h-full max-w-full select-none rounded-lg object-contain ${FOCUS_RING}`}
            data-testid="image_preview_image"
            data-zoomed={is_zoomed}
            draggable={false}
            initial={false}
            src={src}
            style={{ cursor: image_cursor }}
            tabIndex={0}
            transition={
              is_dragging || reduce_motion
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.2, 0, 0, 1] }
            }
            onKeyDown={handle_image_key}
          />
        </motion.div>
        {on_next && (
          <button
            aria-label={t("common.next")}
            className={`end-3 ${NAV_BUTTON_CLASS}`}
            data-testid="image_preview_next"
            title={t("common.next")}
            type="button"
            onClick={on_next}
          >
            <PreviewChevronIcon direction="right" />
          </button>
        )}
      </div>
      <div className="flex min-h-[2.5rem] shrink-0 items-center justify-center gap-3 px-4 pb-4 pt-2">
        {caption_text && (
          <p
            className="max-w-[80ch] truncate text-sm text-white/80"
            data-testid="image_preview_caption"
            id={caption_id}
          >
            {caption_text}
          </p>
        )}
        {counter && (
          <span className="text-xs tabular-nums text-white/50">{counter}</span>
        )}
      </div>
    </motion.div>
  );
}
