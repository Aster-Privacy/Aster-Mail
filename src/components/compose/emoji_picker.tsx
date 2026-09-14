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
import type { IconType } from "react-icons";
import type { KeyboardEvent, MouseEvent } from "react";

import { useState, useRef, useEffect, useMemo, useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuApple,
  LuCar,
  LuFlag,
  LuHand,
  LuHeart,
  LuLightbulb,
  LuPawPrint,
  LuSearch,
  LuSmile,
  LuVolleyball,
  LuX,
} from "react-icons/lu";

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

type EmojiEntry = (typeof emoji_categories)[string]["entries"][number];

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

const CATEGORY_ICONS: Record<string, IconType> = {
  smileys: LuSmile,
  gestures: LuHand,
  animals: LuPawPrint,
  food: LuApple,
  travel: LuCar,
  objects: LuLightbulb,
  symbols: LuHeart,
  activities: LuVolleyball,
  flags: LuFlag,
};

const SKIN_TONE_STORAGE_KEY = "aster_emoji_skin_tone";
const RECENT_STORAGE_KEY = "aster_emoji_recent";
const RECENT_LIMIT = 18;
const GRID_COLUMNS = 9;

const TAB_STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
const GRID_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: GRID_COLUMNS,
  ArrowUp: -GRID_COLUMNS,
};

const EASE_STANDARD = [0.2, 0, 0, 1] as const;

const ENTRY_BY_EMOJI = new Map<string, EmojiEntry>(
  Object.values(emoji_categories).flatMap((category) =>
    category.entries.map((entry) => [entry.emoji, entry] as const),
  ),
);

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

function load_recent(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RECENT_STORAGE_KEY) ?? "[]",
    );

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (value): value is string =>
          typeof value === "string" && ENTRY_BY_EMOJI.has(value),
      )
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

function remember_recent(emoji: string): void {
  const next = [emoji, ...load_recent().filter((value) => value !== emoji)];

  try {
    localStorage.setItem(
      RECENT_STORAGE_KEY,
      JSON.stringify(next.slice(0, RECENT_LIMIT)),
    );
  } catch {
    return;
  }
}

function category_label(
  key: string,
  t: (key: TranslationKey) => string,
): string {
  const label_key = CATEGORY_LABEL_KEYS[key];

  return label_key ? t(label_key) : emoji_categories[key].label;
}

function shortcode(entry: EmojiEntry): string {
  const name = entry.keywords[0];

  return name ? `:${name.replace(/\s+/g, "_")}:` : "";
}

function entry_from_event(event: { target: EventTarget }): EmojiEntry | null {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-emoji]",
  );
  const emoji = button?.dataset.emoji;

  return emoji ? (ENTRY_BY_EMOJI.get(emoji) ?? null) : null;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="sticky top-0 z-[1] bg-modal-bg px-1.5 pt-2 pb-1 text-[11px] font-medium text-txt-muted">
      {children}
    </p>
  );
}

function EmojiGrid({
  entries,
  skin_tone,
}: {
  entries: EmojiEntry[];
  skin_tone: SkinTone;
}) {
  return (
    <div className="grid grid-cols-9">
      {entries.map((entry, index) => {
        const toned = apply_skin_tone(entry.emoji, skin_tone);

        return (
          <button
            key={`${entry.emoji}-${index}`}
            aria-label={entry.keywords[0] ?? toned}
            className="flex aspect-square cursor-pointer items-center justify-center rounded-md text-[22px] leading-none outline-none transition-[transform,background-color] duration-100 hover:bg-black/[0.06] focus-visible:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 active:scale-90 dark:hover:bg-white/[0.08] dark:focus-visible:bg-white/[0.08]"
            data-emoji={entry.emoji}
            type="button"
          >
            {toned}
          </button>
        );
      })}
    </div>
  );
}

function EmojiPicker({ on_select }: { on_select: (emoji: string) => void }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const indicator_id = useId();
  const [active_category, set_active_category] = useState(CATEGORY_KEYS[0]);
  const [search_query, set_search_query] = useState("");
  const [skin_tone, set_skin_tone] = useState<SkinTone>(load_skin_tone);
  const [show_tones, set_show_tones] = useState(false);
  const [preview, set_preview] = useState<EmojiEntry | null>(null);
  const [recent] = useState<string[]>(load_recent);
  const grid_ref = useRef<HTMLDivElement>(null);
  const input_ref = useRef<HTMLInputElement>(null);
  const tones_ref = useRef<HTMLDivElement>(null);
  const tab_refs = useRef<(HTMLButtonElement | null)[]>([]);

  const trimmed_query = search_query.trim();
  const is_searching = trimmed_query.length > 0;
  const grid_key = is_searching ? "search" : active_category;
  const grid_key_ref = useRef(grid_key);

  const current_entries = useMemo(() => {
    const source = is_searching
      ? search_emojis(trimmed_query)
      : emoji_categories[active_category].entries;

    return source.filter((entry) => is_emoji_renderable(entry.emoji));
  }, [is_searching, trimmed_query, active_category]);

  const recent_entries = useMemo(() => {
    if (is_searching || active_category !== CATEGORY_KEYS[0]) return [];

    return recent
      .map((emoji) => ENTRY_BY_EMOJI.get(emoji))
      .filter(
        (entry): entry is EmojiEntry =>
          entry !== undefined && is_emoji_renderable(entry.emoji),
      );
  }, [recent, is_searching, active_category]);

  const grids = useMemo(
    () => (
      <>
        {recent_entries.length > 0 && (
          <>
            <SectionLabel>{t("common.emoji_recent")}</SectionLabel>
            <EmojiGrid entries={recent_entries} skin_tone={skin_tone} />
          </>
        )}
        {!is_searching && (
          <SectionLabel>{category_label(active_category, t)}</SectionLabel>
        )}
        {current_entries.length > 0 ? (
          <div className={is_searching ? "pt-2" : ""}>
            <EmojiGrid entries={current_entries} skin_tone={skin_tone} />
          </div>
        ) : (
          <div className="flex h-[240px] flex-col items-center justify-center gap-2 text-txt-muted">
            <LuSearch className="h-5 w-5 opacity-60" />
            <p className="text-xs">{t("common.no_emojis_found")}</p>
          </div>
        )}
      </>
    ),
    [recent_entries, current_entries, is_searching, active_category, skin_tone, t],
  );

  const footer_entry = preview ?? (is_searching ? current_entries[0] : null);

  const select_entry = (entry: EmojiEntry) => {
    remember_recent(entry.emoji);
    on_select(apply_skin_tone(entry.emoji, skin_tone));
  };

  const select_skin_tone = (tone: SkinTone) => {
    set_skin_tone(tone);
    set_show_tones(false);

    try {
      localStorage.setItem(SKIN_TONE_STORAGE_KEY, tone);
    } catch {
      return;
    }
  };

  const choose_category = (key: string) => {
    set_active_category(key);
    set_search_query("");
    set_preview(null);
  };

  const emoji_buttons = () =>
    Array.from(
      grid_ref.current?.querySelectorAll<HTMLButtonElement>("[data-emoji]") ??
        [],
    );

  const focus_emoji = (index: number) => {
    const buttons = emoji_buttons();

    if (buttons.length === 0) return;

    const target = buttons[Math.max(0, Math.min(buttons.length - 1, index))];

    target.focus();
    target.scrollIntoView({ block: "nearest" });
  };

  const handle_search_key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focus_emoji(0);

      return;
    }

    if (event.key !== "Enter" || !is_searching) return;

    const first = current_entries[0];

    if (!first) return;

    event.preventDefault();
    select_entry(first);
  };

  const handle_tab_key = (event: KeyboardEvent, index: number) => {
    const step = TAB_STEPS[event.key];

    if (step === undefined) return;

    event.preventDefault();

    const next = (index + step + CATEGORY_KEYS.length) % CATEGORY_KEYS.length;

    choose_category(CATEGORY_KEYS[next]);
    tab_refs.current[next]?.focus();
  };

  const handle_grid_key = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = GRID_STEPS[event.key];

    if (step === undefined) return;

    const index = emoji_buttons().indexOf(
      document.activeElement as HTMLButtonElement,
    );

    if (index === -1) return;

    event.preventDefault();

    if (index + step < 0) {
      input_ref.current?.focus();

      return;
    }

    focus_emoji(index + step);
  };

  const handle_grid_click = (event: MouseEvent<HTMLDivElement>) => {
    const entry = entry_from_event(event);

    if (entry) select_entry(entry);
  };

  const handle_grid_hover = (event: { target: EventTarget }) => {
    const entry = entry_from_event(event);

    if (entry && entry !== preview) set_preview(entry);
  };

  const clear_search = () => {
    set_search_query("");
    set_preview(null);
    input_ref.current?.focus();
  };

  const reset_scroll = () => {
    if (grid_ref.current) grid_ref.current.scrollTop = 0;
  };

  useEffect(() => {
    if (grid_key_ref.current !== grid_key) {
      grid_key_ref.current = grid_key;

      return;
    }

    reset_scroll();
  }, [grid_key, trimmed_query]);

  useEffect(() => {
    input_ref.current?.focus();
  }, []);

  useEffect(() => {
    if (!show_tones) return;

    const handle_pointer = (event: PointerEvent) => {
      if (!tones_ref.current?.contains(event.target as Node)) {
        set_show_tones(false);
      }
    };

    document.addEventListener("pointerdown", handle_pointer, true);

    return () =>
      document.removeEventListener("pointerdown", handle_pointer, true);
  }, [show_tones]);

  const fade = reduce_motion
    ? { duration: 0 }
    : { duration: 0.16, ease: EASE_STANDARD };

  return (
    <div
      className="flex w-[344px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl border border-edge-primary bg-modal-bg shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28),0_2px_6px_-2px_rgba(0,0,0,0.12)]"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="px-2 pt-2">
        <div className="group relative flex h-8 items-center rounded-lg bg-black/[0.045] transition-[background-color,box-shadow] duration-150 focus-within:bg-transparent focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-500 dark:bg-white/[0.06] dark:focus-within:bg-transparent">
          <LuSearch className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-txt-muted" />
          <input
            ref={input_ref}
            className="h-full w-full bg-transparent ps-8 pe-8 text-[13px] text-txt-primary outline-none placeholder:text-txt-muted"
            placeholder={t("common.search_emojis")}
            spellCheck={false}
            type="text"
            value={search_query}
            onChange={(e) => {
              set_search_query(e.target.value);
              set_preview(null);
            }}
            onKeyDown={handle_search_key}
            onMouseDown={(e) => e.stopPropagation()}
          />
          {is_searching && (
            <button
              aria-label={t("common.clear")}
              className="absolute end-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-txt-muted outline-none transition-colors hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-blue-500/70"
              type="button"
              onClick={clear_search}
            >
              <LuX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className="mt-1 grid grid-cols-9 border-b border-edge-secondary px-2"
        role="tablist"
      >
        {CATEGORY_KEYS.map((key, index) => {
          const is_active = !is_searching && active_category === key;
          const is_focus_target = is_searching ? index === 0 : is_active;
          const Icon = CATEGORY_ICONS[key] ?? LuSmile;

          return (
            <button
              key={key}
              ref={(node) => {
                tab_refs.current[index] = node;
              }}
              aria-label={category_label(key, t)}
              aria-selected={is_active}
              className={`relative flex h-9 cursor-pointer items-center justify-center outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 ${is_active ? "text-blue-500" : "text-txt-muted hover:text-txt-primary"}`}
              role="tab"
              tabIndex={is_focus_target ? 0 : -1}
              title={category_label(key, t)}
              type="button"
              onClick={() => choose_category(key)}
              onKeyDown={(event) => handle_tab_key(event, index)}
            >
              <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
              {is_active && (
                <motion.span
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-t-full bg-blue-500"
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

      <div
        ref={grid_ref}
        className="h-[252px] overflow-y-auto overscroll-contain scrollbar-hide px-2 pb-1.5"
        onClick={handle_grid_click}
        onFocus={handle_grid_hover}
        onKeyDown={handle_grid_key}
        onMouseLeave={() => set_preview(null)}
        onMouseOver={handle_grid_hover}
      >
        <AnimatePresence
          initial={false}
          mode="wait"
          onExitComplete={reset_scroll}
        >
          <motion.div
            key={grid_key}
            animate={{ opacity: 1 }}
            className="min-h-full"
            exit={{
              opacity: 0,
              transition: { duration: reduce_motion ? 0 : 0.06 },
            }}
            initial={{ opacity: 0 }}
            transition={fade}
          >
            {grids}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex h-12 items-center gap-2.5 border-t border-edge-secondary ps-3 pe-1.5">
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-[26px] leading-none">
          {footer_entry
            ? apply_skin_tone(footer_entry.emoji, skin_tone)
            : (() => {
                const Icon = CATEGORY_ICONS[active_category] ?? LuSmile;

                return <Icon className="h-[18px] w-[18px] text-txt-muted" />;
              })()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-none">
          {footer_entry ? (
            <span className="font-medium text-txt-primary">
              {shortcode(footer_entry)}
            </span>
          ) : (
            <span className="text-txt-muted">
              {is_searching ? "" : category_label(active_category, t)}
            </span>
          )}
        </span>
        <div
          ref={tones_ref}
          className="relative flex-shrink-0"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !show_tones) return;
            event.stopPropagation();
            set_show_tones(false);
          }}
        >
          <button
            aria-expanded={show_tones}
            aria-haspopup="true"
            aria-label={t("common.skin_tone")}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[18px] leading-none outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500/70 active:scale-90"
            title={t("common.skin_tone")}
            type="button"
            onClick={() => set_show_tones(!show_tones)}
          >
            {skin_tone_swatches[skin_tone]}
          </button>
          <AnimatePresence>
            {show_tones && (
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="absolute end-0 bottom-full z-10 mb-1 flex gap-0.5 rounded-full border border-edge-primary bg-modal-bg p-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] ltr:origin-bottom-right rtl:origin-bottom-left"
                exit={{ opacity: 0, scale: 0.94, y: 4 }}
                initial={
                  reduce_motion ? false : { opacity: 0, scale: 0.94, y: 4 }
                }
                transition={fade}
              >
                {skin_tones.map((tone) => (
                  <button
                    key={tone}
                    aria-label={t("common.skin_tone")}
                    aria-pressed={skin_tone === tone}
                    className={`relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[18px] leading-none outline-none transition-[transform,opacity] duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500/70 active:scale-90 ${skin_tone === tone ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
                    type="button"
                    onClick={() => select_skin_tone(tone)}
                  >
                    {skin_tone_swatches[tone]}
                    {skin_tone === tone && (
                      <span className="absolute bottom-0 h-1 w-1 rounded-full bg-blue-500" />
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default EmojiPicker;
