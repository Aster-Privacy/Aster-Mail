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
import { useState, useRef, useEffect, useMemo } from "react";

import { Input } from "@/components/ui/input";
import { use_i18n } from "@/lib/i18n/context";
import {
  emoji_categories,
  search_emojis,
  skin_tones,
  skin_tone_swatches,
  apply_skin_tone,
  type SkinTone,
} from "@/config/emoji";

const CATEGORY_KEYS = Object.keys(emoji_categories);
const SKIN_TONE_STORAGE_KEY = "aster_emoji_skin_tone";

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

function EmojiPicker({ on_select }: { on_select: (emoji: string) => void }) {
  const { t } = use_i18n();
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

  return (
    <div
      className="rounded-2xl shadow-xl border w-[296px] max-w-[calc(100vw-16px)] bg-modal-bg border-edge-primary"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="p-2.5 pb-2 flex items-center gap-1.5">
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
            className={`press_scale w-8 h-8 flex items-center justify-center rounded-full text-base cursor-pointer transition-transform duration-150 ${show_tones ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
            title={t("common.skin_tone")}
            type="button"
            onClick={() => set_show_tones(!show_tones)}
          >
            {skin_tone_swatches[skin_tone]}
          </button>
          {show_tones && (
            <div className="absolute right-0 top-full mt-1 z-10 flex gap-0.5 p-1 rounded-full border shadow-lg bg-modal-bg border-edge-primary">
              {skin_tones.map((tone) => (
                <button
                  key={tone}
                  className={`press_scale w-7 h-7 flex items-center justify-center rounded-full text-sm cursor-pointer transition-transform duration-150 ${skin_tone === tone ? "bg-black/10 dark:bg-white/15" : "hover:bg-black/5 dark:hover:bg-white/10"}`}
                  type="button"
                  onClick={() => select_skin_tone(tone)}
                >
                  {skin_tone_swatches[tone]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!search_query && (
        <div className="flex px-1.5 pb-1.5 gap-0.5 justify-between border-b border-edge-secondary">
          {CATEGORY_KEYS.map((key) => (
            <button
              key={key}
              className={`press_scale w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full cursor-pointer transition-transform duration-150 ${active_category === key ? "bg-black/10 dark:bg-white/15" : "opacity-55 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10"}`}
              title={emoji_categories[key].label}
              type="button"
              onClick={() => {
                set_active_category(key);
                set_search_query("");
              }}
            >
              <span className="text-sm leading-none">
                {emoji_categories[key].icon}
              </span>
            </button>
          ))}
        </div>
      )}

      <div
        ref={grid_ref}
        className="grid grid-cols-8 gap-0.5 p-2 max-h-[216px] overflow-y-auto scrollbar-hide"
      >
        {current_entries.map((entry, index) => {
          const toned = apply_skin_tone(entry.emoji, skin_tone);

          return (
            <button
              key={`${active_category}-${index}`}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-xl cursor-pointer transition-transform duration-100 hover:bg-black/5 dark:hover:bg-white/10 hover:scale-110 active:scale-95"
              type="button"
              onClick={() => on_select(toned)}
            >
              {toned}
            </button>
          );
        })}
      </div>

      {current_entries.length === 0 && (
        <div className="text-center py-6 text-txt-muted">
          <p className="text-xs">{t("common.no_emojis_found")}</p>
        </div>
      )}
    </div>
  );
}

export default EmojiPicker;
