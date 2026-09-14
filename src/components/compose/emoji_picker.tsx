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

import { useState, useRef, useEffect, useMemo, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import {
  emoji_categories,
  search_emojis,
  skin_tones,
  skin_tone_swatches,
  apply_skin_tone,
  type SkinTone,
} from "@/config/emoji";

const CATEGORY_KEYS = Object.keys(emoji_categories);

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  smileys: "common.emoji_smileys",
  gestures: "common.emoji_gestures",
  animals: "common.emoji_animals",
  food: "common.emoji_food",
  travel: "common.emoji_travel",
  objects: "common.emoji_objects",
  symbols: "common.emoji_symbols",
  activities: "common.emoji_activities",
  flags: "common.emoji_flags",
};
const SKIN_TONE_STORAGE_KEY = "aster_emoji_skin_tone";

const EASE_STANDARD = [0.2, 0, 0, 1] as const;

const emoji_support_cache = new Map<string, boolean>();
let support_canvas: HTMLCanvasElement | null = null;

function is_emoji_renderable(emoji: string): boolean {
  const cached = emoji_support_cache.get(emoji);

  if (cached !== undefined) return cached;

  if (!support_canvas) {
    support_canvas = document.createElement("canvas");
  }
  support_canvas.width = 20;
  support_canvas.height = 20;
  const ctx = support_canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) return true;

  ctx.textBaseline = "top";
  ctx.font =
    "16px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
  ctx.fillStyle = "#000";
  ctx.fillText(emoji, 0, 0);
  const data = ctx.getImageData(0, 0, 20, 20).data;
  let supported = false;

  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i + 3] > 16 &&
      (data[i] !== data[i + 1] || data[i + 1] !== data[i + 2])
    ) {
      supported = true;
      break;
    }
  }

  if (supported && emoji.includes(String.fromCharCode(8205))) {
    const width = ctx.measureText(emoji).width;
    const single_width = ctx.measureText("\u{1F600}").width;

    if (width > single_width * 1.25) {
      supported = false;
    }
  }
  emoji_support_cache.set(emoji, supported);

  return supported;
}

function load_skin_tone(): SkinTone {
  try {
    const stored = localStorage.getItem(SKIN_TONE_STORAGE_KEY);

    if (stored && skin_tones.includes(stored as SkinTone)) {
      return stored as SkinTone;
    }
  } catch {
    return "default";
  }

  return "default";
}

function category_label(
  key: string,
  t: (key: TranslationKey) => string,
): string {
  const label_key = CATEGORY_LABEL_KEYS[key];

  return label_key ? t(label_key) : emoji_categories[key].label;
}

function EmojiPicker({ on_select }: { on_select: (emoji: string) => void }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const indicator_id = useId();
  const [active_category, set_active_category] = useState(CATEGORY_KEYS[0]);
  const [search_query, set_search_query] = useState("");
  const [skin_tone, set_skin_tone] = useState<SkinTone>(load_skin_tone);
  const [show_tones, set_show_tones] = useState(false);
  const grid_ref = useRef<HTMLDivElement>(null);
  const input_ref = useRef<HTMLInputElement>(null);

  const search_results = search_query ? search_emojis(search_query) : null;
  const unfiltered_entries =
    search_results ?? emoji_categories[active_category].entries;
  const current_entries = useMemo(
    () =>
      unfiltered_entries.filter((entry) => is_emoji_renderable(entry.emoji)),
    [unfiltered_entries],
  );

  const select_skin_tone = (tone: SkinTone) => {
    set_skin_tone(tone);
    set_show_tones(false);

    try {
      localStorage.setItem(SKIN_TONE_STORAGE_KEY, tone);
    } catch {
      return;
    }
  };

  useEffect(() => {
    if (grid_ref.current) {
      grid_ref.current.scrollTop = 0;
    }
  }, [active_category, search_query]);

  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  const fade = reduce_motion
    ? { duration: 0 }
    : { duration: 0.16, ease: EASE_STANDARD };
  const grid_key = search_query ? "search" : active_category;
  const section_label = search_query
    ? null
    : category_label(active_category, t);

  return (
    <div
      className="w-[320px] max-w-[calc(100vw-16px)] rounded-2xl border border-edge-primary bg-modal-bg shadow-xl"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <Input
          ref={input_ref}
          className="flex-1 bg-transparent"
          placeholder={t("common.search_emojis")}
          size="sm"
          type="text"
          value={search_query}
          onChange={(e) => set_search_query(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
        <div className="relative flex-shrink-0">
          <button
            aria-expanded={show_tones}
            aria-label={t("common.skin_tone")}
            className="flex h-8 w-8 cursor-pointer items-center justify-center text-lg leading-none transition-transform duration-150 hover:scale-110 active:scale-90"
            title={t("common.skin_tone")}
            type="button"
            onClick={() => set_show_tones(!show_tones)}
          >
            {skin_tone_swatches[skin_tone]}
          </button>
          <AnimatePresence>
            {show_tones && (
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                className="absolute end-0 top-full z-10 mt-1 flex gap-0.5 rounded-full border border-edge-primary bg-modal-bg p-1 shadow-lg"
                exit={{ opacity: 0, scale: 0.94 }}
                initial={reduce_motion ? false : { opacity: 0, scale: 0.94 }}
                style={{ transformOrigin: "top right" }}
                transition={fade}
              >
                {skin_tones.map((tone) => (
                  <button
                    key={tone}
                    aria-pressed={skin_tone === tone}
                    className={`relative flex h-7 w-7 cursor-pointer items-center justify-center text-base leading-none transition-[transform,opacity] duration-150 hover:scale-110 active:scale-90 ${skin_tone === tone ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
                    type="button"
                    onClick={() => select_skin_tone(tone)}
                  >
                    {skin_tone_swatches[tone]}
                    {skin_tone === tone && (
                      <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {!search_query && (
        <div
          className="grid grid-cols-9 border-b border-edge-secondary px-2"
          role="tablist"
        >
          {CATEGORY_KEYS.map((key) => {
            const is_active = active_category === key;

            return (
              <button
                key={key}
                aria-label={category_label(key, t)}
                aria-selected={is_active}
                className="group relative flex h-9 cursor-pointer items-center justify-center"
                role="tab"
                title={category_label(key, t)}
                type="button"
                onClick={() => {
                  set_active_category(key);
                  set_search_query("");
                }}
              >
                <span
                  className={`text-base leading-none transition-[opacity,transform,filter] duration-150 group-hover:scale-110 group-active:scale-90 ${is_active ? "opacity-100" : "opacity-50 grayscale group-hover:opacity-90 group-hover:grayscale-0"}`}
                >
                  {emoji_categories[key].icon}
                </span>
                {is_active && (
                  <motion.span
                    className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-blue-500"
                    layoutId={`${indicator_id}_emoji_tab`}
                    transition={
                      reduce_motion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 520, damping: 40 }
                    }
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={grid_ref}
        className="h-[248px] overflow-y-auto overscroll-contain scrollbar-hide px-2 pb-2"
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={grid_key}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduce_motion ? 0 : 0.06 } }}
            initial={{ opacity: 0 }}
            transition={fade}
          >
            {section_label && (
              <p className="px-1 pt-2.5 pb-1.5 text-[11px] font-medium text-txt-muted">
                {section_label}
              </p>
            )}
            {current_entries.length > 0 ? (
              <div
                className={`grid grid-cols-8 ${section_label ? "" : "pt-2"}`}
              >
                {current_entries.map((entry, index) => {
                  const toned = apply_skin_tone(entry.emoji, skin_tone);

                  return (
                    <button
                      key={`${grid_key}-${index}`}
                      className="flex aspect-square cursor-pointer items-center justify-center rounded-lg text-[22px] leading-none transition-[transform,background-color] duration-100 hover:bg-black/[0.05] active:scale-90 dark:hover:bg-white/[0.07]"
                      type="button"
                      onClick={() => on_select(toned)}
                    >
                      {toned}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="pt-16 text-center text-xs text-txt-muted">
                {t("common.no_emojis_found")}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export default EmojiPicker;
