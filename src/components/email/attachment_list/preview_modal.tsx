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

import { useEffect } from "react";
import { motion } from "framer-motion";

import { DownloadIcon, PreviewChevronIcon } from "./icons";

import { use_dialog_shell } from "@/lib/use_dialog_shell";
import { is_top_overlay_layer } from "@/lib/overlay_layer_stack";

export function ImagePreviewModal({
  src,
  filename,
  on_close,
  on_download,
  on_prev,
  on_next,
  counter,
  reduce_motion,
  t,
}: {
  src: string;
  filename: string;
  on_close: () => void;
  on_download: () => void;
  on_prev?: () => void;
  on_next?: () => void;
  counter?: string;
  reduce_motion: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}) {
  const { layer_id, dialog_ref, handle_backdrop_pointer_down } =
    use_dialog_shell<HTMLDivElement>(true, on_close, "image_preview");

  useEffect(() => {
    if (!on_prev && !on_next) return;

    const handle_key = (e: KeyboardEvent) => {
      if (!is_top_overlay_layer(layer_id)) return;

      if (e.key === "ArrowLeft" && on_prev) {
        e.preventDefault();
        e.stopPropagation();
        on_prev();
      }

      if (e.key === "ArrowRight" && on_next) {
        e.preventDefault();
        e.stopPropagation();
        on_next();
      }
    };

    window.addEventListener("keydown", handle_key, true);

    return () => window.removeEventListener("keydown", handle_key, true);
  }, [layer_id, on_prev, on_next]);

  return (
    <motion.div
      ref={dialog_ref}
      animate={{ opacity: 1 }}
      aria-label={filename}
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 outline-none"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      role="dialog"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)" }}
      tabIndex={-1}
      transition={{ duration: reduce_motion ? 0 : 0.2 }}
      onPointerDown={handle_backdrop_pointer_down}
    >
      {on_prev && (
        <button
          aria-label={t("common.previous")}
          className="absolute start-3 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
          title={t("common.previous")}
          onClick={on_prev}
        >
          <PreviewChevronIcon direction="left" />
        </button>
      )}
      {on_next && (
        <button
          aria-label={t("common.next")}
          className="absolute end-3 top-1/2 -translate-y-1/2 z-10 p-2.5 rounded-full text-white/90 bg-white/10 hover:bg-white/20 transition-colors"
          title={t("common.next")}
          onClick={on_next}
        >
          <PreviewChevronIcon direction="right" />
        </button>
      )}
      <motion.div
        animate={{ scale: 1, opacity: 1 }}
        className="relative flex flex-col items-center gap-4 max-w-[92vw] max-h-[92vh]"
        exit={{ scale: 0.95, opacity: 0 }}
        initial={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: reduce_motion ? 0 : 0.2 }}
      >
        <img
          alt={filename}
          className="max-w-full max-h-[80vh] rounded-lg object-contain select-none"
          draggable={false}
          src={src}
        />
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-sm truncate max-w-[300px]">
            {filename}
          </span>
          {counter && (
            <span className="text-white/50 text-xs tabular-nums">
              {counter}
            </span>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] text-xs font-medium text-white/90 bg-white/10"
            onClick={on_download}
          >
            <DownloadIcon className="w-3.5 h-3.5" />
            {t("common.download")}
          </button>
          <button
            className="px-3 py-1.5 rounded-[12px] text-xs font-medium text-white/90 bg-white/10"
            onClick={on_close}
          >
            {t("common.close")}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
