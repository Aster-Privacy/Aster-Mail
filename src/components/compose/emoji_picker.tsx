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

import {
  memo,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useId,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuApple,
  LuCar,
  LuClock,
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

interface EmojiSection {
  key: string;
  entries: EmojiEntry[];
}

const RECENT_KEY = "recent";
const CATEGORY_KEYS = Object.keys(emoji_categories);

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  recent: "common.emoji_recent",
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
  recent: LuClock,
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
const RECENT_LIMIT = 16;
const SCROLL_SPY_OFFSET = 12;

const TAB_STEPS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };

const ENTRY_BY_EMOJI = new Map<string, EmojiEntry>(
  Object.values(emoji_categories).flatMap((category) =>
    category.entries.map((entry) => [entry.emoji, entry] as const),
  ),
);

const emoji_support_cache = new Map<string, boolean>();
let support_canvas: HTMLCanvasElement | null = null;
let renderable_sections: EmojiSection[] | null = null;

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

function category_sections(): EmojiSection[] {
  if (!renderable_sections) {
    renderable_sections = CATEGORY_KEYS.map((key) => ({
      key,
      entries: emoji_categories[key].entries.filter((entry) =>
        is_emoji_renderable(entry.emoji),
      ),
    })).filter((section) => section.entries.length > 0);
  }

  return renderable_sections;
}

function prefers_touch(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
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

  if (label_key) return t(label_key);

  return emoji_categories[key]?.label ?? key;
}

function entry_from_event(event: { target: EventTarget }): EmojiEntry | null {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-emoji]",
  );
  const emoji = button?.dataset.emoji;

  return emoji ? (ENTRY_BY_EMOJI.get(emoji) ?? null) : null;
}

function vertical_neighbor(
  buttons: HTMLButtonElement[],
  index: number,
  direction: 1 | -1,
): number | null {
  const current = buttons[index].getBoundingClientRect();
  let row_top: number | null = null;
  let best: number | null = null;
  let best_distance = Infinity;

  for (
    let i = index + direction;
    i >= 0 && i < buttons.length;
    i += direction
  ) {
    const rect = buttons[i].getBoundingClientRect();
    const crossed =
      direction === 1 ? rect.top > current.top + 4 : rect.top < current.top - 4;

    if (!crossed) continue;

    if (row_top === null) row_top = rect.top;

    if (Math.abs(rect.top - row_top) > 4) break;

    const distance = Math.abs(rect.left - current.left);

    if (distance < best_distance) {
      best_distance = distance;
      best = i;
    }
  }

  return best;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="sticky top-0 z-[1] bg-modal-bg px-1 pt-2.5 pb-1.5 text-[13px] font-medium leading-5 text-txt-secondary">
      {children}
    </p>
  );
}

const EmojiGrid = memo(function EmojiGrid({
  entries,
  skin_tone,
}: {
  entries: EmojiEntry[];
  skin_tone: SkinTone;
}) {
  return (
    <div className="grid grid-cols-8">
      {entries.map((entry, index) => {
        const toned = apply_skin_tone(entry.emoji, skin_tone);

        return (
          <button
            key={`${entry.emoji}-${index}`}
            aria-label={entry.keywords[0] ?? toned}
            className="flex aspect-square cursor-pointer touch-manipulation items-center justify-center rounded-full text-[28px] leading-none outline-none transition-[transform,background-color] duration-100 hover:bg-black/[0.06] focus-visible:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 active:scale-90 sm:text-[26px] dark:hover:bg-white/[0.08] dark:focus-visible:bg-white/[0.08]"
            data-emoji={entry.emoji}
            type="button"
          >
            {toned}
          </button>
        );
      })}
    </div>
  );
});

function EmojiPicker({ on_select }: { on_select: (emoji: string) => void }) {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const indicator_id = useId();
  const [search_query, set_search_query] = useState("");
  const [skin_tone, set_skin_tone] = useState<SkinTone>(load_skin_tone);
  const [show_tones, set_show_tones] = useState(false);
  const [recent] = useState<string[]>(load_recent);
  const [is_touch] = useState(prefers_touch);
  const grid_ref = useRef<HTMLDivElement>(null);
  const input_ref = useRef<HTMLInputElement>(null);
  const tones_ref = useRef<HTMLDivElement>(null);
  const tab_refs = useRef<(HTMLButtonElement | null)[]>([]);
  const spy_frame_ref = useRef(0);
  const pending_jump_ref = useRef<string | null>(null);

  const trimmed_query = search_query.trim();
  const is_searching = trimmed_query.length > 0;

  const sections = useMemo<EmojiSection[]>(() => {
    const recent_entries = recent
      .map((emoji) => ENTRY_BY_EMOJI.get(emoji))
      .filter(
        (entry): entry is EmojiEntry =>
          entry !== undefined && is_emoji_renderable(entry.emoji),
      );
    const categories = category_sections();

    return recent_entries.length > 0
      ? [{ key: RECENT_KEY, entries: recent_entries }, ...categories]
      : categories;
  }, [recent]);

  const section_keys = useMemo(
    () => sections.map((section) => section.key),
    [sections],
  );

  const [active_section, set_active_section] = useState(section_keys[0]);

  const search_results = useMemo(
    () =>
      is_searching
        ? search_emojis(trimmed_query).filter((entry) =>
            is_emoji_renderable(entry.emoji),
          )
        : [],
    [is_searching, trimmed_query],
  );

  const content = useMemo(() => {
    if (is_searching) {
      return search_results.length > 0 ? (
        <div className="pt-2">
          <EmojiGrid entries={search_results} skin_tone={skin_tone} />
        </div>
      ) : (
        <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-txt-muted">
          <LuSearch className="h-5 w-5 opacity-60" />
          <p className="text-xs leading-5">{t("common.no_emojis_found")}</p>
        </div>
      );
    }

    return sections.map((section) => (
      <section key={section.key} data-section={section.key}>
        <SectionLabel>{category_label(section.key, t)}</SectionLabel>
        <EmojiGrid entries={section.entries} skin_tone={skin_tone} />
      </section>
    ));
  }, [is_searching, search_results, sections, skin_tone, t]);

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

  const scroll_to_section = (key: string) => {
    const grid = grid_ref.current;
    const target = grid?.querySelector<HTMLElement>(`[data-section="${key}"]`);

    if (!grid || !target) return;

    grid.scrollTop = target.offsetTop;
  };

  const choose_section = (key: string) => {
    set_active_section(key);

    if (is_searching) {
      pending_jump_ref.current = key;
      set_search_query("");

      return;
    }

    scroll_to_section(key);
  };

  const update_active_from_scroll = () => {
    const grid = grid_ref.current;

    if (!grid || is_searching) return;

    const threshold = grid.scrollTop + SCROLL_SPY_OFFSET;
    const nodes = grid.querySelectorAll<HTMLElement>("[data-section]");
    let current = section_keys[0];

    for (const node of nodes) {
      if (node.offsetTop > threshold) break;
      current = node.dataset.section ?? current;
    }

    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 2) {
      current = nodes[nodes.length - 1]?.dataset.section ?? current;
    }

    set_active_section((previous) =>
      previous === current ? previous : current,
    );
  };

  const handle_scroll = () => {
    if (spy_frame_ref.current) return;

    spy_frame_ref.current = window.requestAnimationFrame(() => {
      spy_frame_ref.current = 0;
      update_active_from_scroll();
    });
  };

  const emoji_buttons = () =>
    Array.from(
      grid_ref.current?.querySelectorAll<HTMLButtonElement>("[data-emoji]") ??
        [],
    );

  const focus_emoji = (buttons: HTMLButtonElement[], index: number) => {
    const target = buttons[index];

    if (!target) return;

    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  };

  const handle_search_key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focus_emoji(emoji_buttons(), 0);

      return;
    }

    if (event.key === "Escape" && is_searching) {
      event.preventDefault();
      event.stopPropagation();
      set_search_query("");

      return;
    }

    if (event.key !== "Enter" || !is_searching) return;

    const first = search_results[0];

    if (!first) return;

    event.preventDefault();
    select_entry(first);
  };

  const handle_tab_key = (event: KeyboardEvent, index: number) => {
    const step = TAB_STEPS[event.key];

    if (step === undefined) return;

    event.preventDefault();

    const next = (index + step + section_keys.length) % section_keys.length;

    choose_section(section_keys[next]);
    tab_refs.current[next]?.focus();
  };

  const handle_grid_key = (event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;

    if (
      key !== "ArrowRight" &&
      key !== "ArrowLeft" &&
      key !== "ArrowDown" &&
      key !== "ArrowUp"
    ) {
      return;
    }

    const buttons = emoji_buttons();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (index === -1) return;

    event.preventDefault();

    if (key === "ArrowRight" || key === "ArrowLeft") {
      const step = key === "ArrowRight" ? 1 : -1;

      focus_emoji(
        buttons,
        Math.max(0, Math.min(buttons.length - 1, index + step)),
      );

      return;
    }

    const next = vertical_neighbor(
      buttons,
      index,
      key === "ArrowDown" ? 1 : -1,
    );

    if (next === null) {
      if (key === "ArrowUp") input_ref.current?.focus();

      return;
    }

    focus_emoji(buttons, next);
  };

  const handle_grid_click = (event: MouseEvent<HTMLDivElement>) => {
    const entry = entry_from_event(event);

    if (entry) select_entry(entry);
  };

  const clear_search = () => {
    set_search_query("");
    input_ref.current?.focus();
  };

  useLayoutEffect(() => {
    const grid = grid_ref.current;

    if (!grid) return;

    if (is_searching) {
      grid.scrollTop = 0;

      return;
    }

    const jump = pending_jump_ref.current;

    pending_jump_ref.current = null;

    if (jump) {
      scroll_to_section(jump);
    } else {
      grid.scrollTop = 0;
      set_active_section(section_keys[0]);
    }
  }, [is_searching, trimmed_query, section_keys]);

  useEffect(() => {
    if (!is_touch) input_ref.current?.focus({ preventScroll: true });

    return () => window.cancelAnimationFrame(spy_frame_ref.current);
  }, [is_touch]);

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
    : { duration: 0.16, ease: [0.2, 0, 0, 1] as const };

  const tone_menu = (
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
        className="flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-full text-[20px] leading-none outline-none transition-[transform,background-color] duration-150 hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-blue-500/70 active:scale-90 sm:h-9 sm:w-9 dark:hover:bg-white/[0.08]"
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
            className="absolute end-0 top-full z-20 mt-1 flex gap-0.5 rounded-full border border-edge-primary bg-modal-bg p-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] ltr:origin-top-right rtl:origin-top-left"
            exit={{ opacity: 0, scale: 0.94, y: -4 }}
            initial={reduce_motion ? false : { opacity: 0, scale: 0.94, y: -4 }}
            transition={fade}
          >
            {skin_tones.map((tone) => (
              <button
                key={tone}
                aria-label={t("common.skin_tone")}
                aria-pressed={skin_tone === tone}
                className={`relative flex h-10 w-10 cursor-pointer touch-manipulation items-center justify-center rounded-full text-[20px] leading-none outline-none transition-[transform,opacity] duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-blue-500/70 active:scale-90 sm:h-8 sm:w-8 sm:text-[18px] ${skin_tone === tone ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
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
  );

  return (
    <div
      className="flex w-[360px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-2xl border border-edge-primary bg-modal-bg shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28),0_2px_6px_-2px_rgba(0,0,0,0.12)]"
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex px-2 pt-1" role="tablist">
        {section_keys.map((key, index) => {
          const is_active = !is_searching && active_section === key;
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
              className={`relative flex h-11 min-w-0 flex-1 cursor-pointer touch-manipulation items-center justify-center outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/70 sm:h-10 ${is_active ? "text-txt-primary" : "text-txt-muted hover:text-txt-primary"}`}
              role="tab"
              tabIndex={is_focus_target ? 0 : -1}
              title={category_label(key, t)}
              type="button"
              onClick={() => choose_section(key)}
              onKeyDown={(event) => handle_tab_key(event, index)}
            >
              <Icon className="h-5 w-5" strokeWidth={1.9} />
              {is_active && (
                <motion.span
                  className="absolute bottom-0.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-blue-500"
                  layoutId={`${indicator_id}_emoji_tab`}
                  transition={
                    reduce_motion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 620, damping: 44 }
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 px-3 pt-1.5 pb-1">
        <div className="relative flex h-10 min-w-0 flex-1 items-center rounded-full bg-black/[0.05] transition-[background-color,box-shadow] duration-150 focus-within:ring-1 focus-within:ring-inset focus-within:ring-blue-500 sm:h-9 dark:bg-white/[0.07]">
          <LuSearch className="pointer-events-none absolute start-3 h-4 w-4 text-txt-muted" />
          <input
            ref={input_ref}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="h-full w-full bg-transparent ps-9 pe-9 text-base leading-normal text-txt-primary outline-none placeholder:text-txt-muted sm:text-sm"
            enterKeyHint="done"
            inputMode="search"
            placeholder={t("common.search_emojis")}
            spellCheck={false}
            type="text"
            value={search_query}
            onChange={(e) => set_search_query(e.target.value)}
            onKeyDown={handle_search_key}
            onMouseDown={(e) => e.stopPropagation()}
          />
          {is_searching && (
            <button
              aria-label={t("common.clear")}
              className="absolute end-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-txt-muted outline-none transition-colors hover:text-txt-primary focus-visible:ring-2 focus-visible:ring-blue-500/70 sm:h-7 sm:w-7"
              type="button"
              onClick={clear_search}
            >
              <LuX className="h-4 w-4" />
            </button>
          )}
        </div>
        {tone_menu}
      </div>

      <div
        ref={grid_ref}
        className="relative h-[min(300px,42vh)] overflow-y-auto overscroll-contain scrollbar-hide px-2 pb-2 sm:h-[300px]"
        onClick={handle_grid_click}
        onKeyDown={handle_grid_key}
        onScroll={handle_scroll}
      >
        {content}
      </div>
    </div>
  );
}

export default EmojiPicker;
