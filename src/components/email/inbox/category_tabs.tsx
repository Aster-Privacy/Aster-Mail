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
import type { EmailCategory } from "@/types/email";
import type { CategoryCounts } from "@/services/category_index";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InboxIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_should_reduce_motion } from "@/provider";
import { use_preferences } from "@/contexts/preferences_context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  BUILTIN_CATEGORIES,
  allowed_custom_categories,
} from "@/data/category_catalog";
import { category_icon } from "@/data/category_icons";
import {
  category_color_key,
  category_color_style,
} from "@/data/category_colors";
import { use_category_previews } from "@/hooks/use_category_previews";
import {
  EMAIL_DRAG_MIME,
  end_category_drag,
  use_category_drag_active,
} from "@/components/email/inbox/category_drag";

interface TabConfig {
  key: EmailCategory;
  label: string;
  description: string;
  Icon: typeof InboxIcon;
  color_style: React.CSSProperties;
}

function format_count(value: number): string {
  return value > 999 ? "999+" : value.toLocaleString();
}

interface CategoryTabsProps {
  active_category: EmailCategory;
  counts: CategoryCounts;
  on_change: (category: EmailCategory) => void;
  on_category_drop?: (category: EmailCategory, email_ids: string[]) => void;
}

export function CategoryTabs({
  active_category,
  counts,
  on_change,
  on_category_drop,
}: CategoryTabsProps): React.ReactElement {
  const { t } = use_i18n();
  const reduce_motion = use_should_reduce_motion();
  const { preferences } = use_preferences();
  const { limits } = use_plan_limits();
  const previews = use_category_previews(true);

  const category_limit = limits
    ? (limits.limits["max_custom_categories"]?.limit ?? -1)
    : -1;

  const tabs = useMemo<TabConfig[]>(() => {
    const enabled_ids = new Set(preferences.enabled_categories ?? []);
    const list: TabConfig[] = [];

    for (const cat of BUILTIN_CATEGORIES) {
      if (cat.id !== "primary" && !enabled_ids.has(cat.id)) {
        continue;
      }

      list.push({
        key: cat.id,
        label: t(cat.label_key),
        description: t(cat.info_key),
        Icon: category_icon(cat.icon),
        color_style: category_color_style(category_color_key(cat.id)),
      });
    }

    const permitted = allowed_custom_categories(
      preferences.custom_categories ?? [],
      category_limit,
    );

    for (const rule of permitted) {
      if (!rule.enabled) continue;

      list.push({
        key: rule.id,
        label: rule.name,
        description: t("settings.category_info_custom"),
        Icon: category_icon(rule.icon),
        color_style: category_color_style(category_color_key(rule.id, rule)),
      });
    }

    return list;
  }, [
    preferences.enabled_categories,
    preferences.custom_categories,
    category_limit,
    t,
  ]);

  const [hovered, set_hovered] = useState<{
    key: EmailCategory;
    label: string;
    description: string;
    left: number;
    top: number;
  } | null>(null);
  const [hover_visible, set_hover_visible] = useState(false);
  const hover_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reveal_frame_ref = useRef<number | null>(null);

  const cancel_hover = useCallback(() => {
    if (hover_timer_ref.current) {
      clearTimeout(hover_timer_ref.current);
      hover_timer_ref.current = null;
    }
    if (reveal_frame_ref.current !== null) {
      cancelAnimationFrame(reveal_frame_ref.current);
      reveal_frame_ref.current = null;
    }
    set_hover_visible(false);
    set_hovered(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hover_timer_ref.current) clearTimeout(hover_timer_ref.current);
      if (reveal_frame_ref.current !== null) {
        cancelAnimationFrame(reveal_frame_ref.current);
      }
    };
  }, []);

  const schedule_hover = useCallback(
    (tab: TabConfig, element: HTMLElement) => {
      if (!tab.description) return;
      if (hover_timer_ref.current) clearTimeout(hover_timer_ref.current);
      hover_timer_ref.current = setTimeout(() => {
        const rect = element.getBoundingClientRect();

        set_hovered({
          key: tab.key,
          label: tab.label,
          description: tab.description,
          left: rect.left,
          top: rect.bottom + 8,
        });

        if (reduce_motion) {
          set_hover_visible(true);

          return;
        }

        set_hover_visible(false);
        reveal_frame_ref.current = requestAnimationFrame(() => {
          reveal_frame_ref.current = requestAnimationFrame(() =>
            set_hover_visible(true),
          );
        });
      }, 250);
    },
    [reduce_motion],
  );

  const drag_active = use_category_drag_active();
  const drop_enabled = drag_active && !!on_category_drop;
  const [drop_target, set_drop_target] = useState<EmailCategory | null>(null);

  useEffect(() => {
    if (!drop_enabled) set_drop_target(null);
  }, [drop_enabled]);

  const handle_drop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, category: EmailCategory) => {
      e.preventDefault();
      set_drop_target(null);
      end_category_drag();

      const raw = e.dataTransfer.getData(EMAIL_DRAG_MIME);

      if (!raw || !on_category_drop) return;

      try {
        const ids = JSON.parse(raw) as unknown;

        if (Array.isArray(ids) && ids.length > 0) {
          on_category_drop(category, ids as string[]);
        }
      } catch {}
    },
    [on_category_drop],
  );

  const handle_wheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY === 0) return;
    const el = e.currentTarget;

    if (el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  return (
    <div
      className="aster_scrollbar_thin group/tabs relative flex shrink-0 select-none items-stretch gap-0 overflow-x-auto overflow-y-hidden border-b border-edge-primary bg-surf-primary px-2 sm:px-3"
      onWheel={handle_wheel}
    >
      {tabs.map((tab) => {
        const { key, label, Icon, color_style } = tab;
        const is_active = key === active_category;
        const bucket = counts[key];
        const new_count = is_active ? 0 : (bucket?.new_count ?? 0);
        const show_new = new_count > 0;
        const preview = show_new ? previews[key] : undefined;
        const is_drop_target = drop_enabled && drop_target === key;

        return (
          <button
            key={key}
            aria-current={is_active ? "page" : undefined}
            className={`group relative flex h-12 min-w-[104px] max-w-[176px] flex-1 basis-[176px] items-center justify-start gap-2 whitespace-nowrap px-2.5 text-[13px] font-medium outline-none transition-colors duration-150 sm:px-3 ${
              is_active
                ? "text-brand"
                : "text-txt-secondary hover:bg-black/[0.03] hover:text-txt-primary dark:hover:bg-white/[0.04]"
            } ${
              is_drop_target
                ? "bg-brand/10 text-brand ring-1 ring-inset ring-brand/40"
                : ""
            }`}
            style={color_style}
            type="button"
            onBlur={cancel_hover}
            onClick={() => {
              cancel_hover();
              on_change(key);
            }}
            onDragEnter={drop_enabled ? () => set_drop_target(key) : undefined}
            onDragLeave={
              drop_enabled
                ? (e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) {
                      return;
                    }
                    set_drop_target((current) =>
                      current === key ? null : current,
                    );
                  }
                : undefined
            }
            onDragOver={
              drop_enabled
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                : undefined
            }
            onDrop={drop_enabled ? (e) => handle_drop(e, key) : undefined}
            onFocus={(e) => schedule_hover(tab, e.currentTarget)}
            onMouseDown={(e) => e.preventDefault()}
            onMouseLeave={cancel_hover}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  is_active
                    ? "text-brand"
                    : "text-txt-muted group-hover:text-txt-secondary"
                }`}
              />
              <span
                className={`relative flex flex-col items-start ${
                  preview ? "min-w-[124px]" : "min-w-0"
                } ${drop_enabled && !preview ? "-translate-y-2" : ""}`}
              >
                <span
                  className="flex h-5 min-w-0 items-center gap-2"
                  onMouseEnter={(e) =>
                    schedule_hover(tab, e.currentTarget as HTMLElement)
                  }
                  onMouseLeave={cancel_hover}
                >
                  <span className="truncate">{label}</span>
                  {show_new ? (
                    <span className="aster_cat_badge">
                      {format_count(new_count)} {t("mail.tab_new_count")}
                    </span>
                  ) : null}
                </span>
                {preview ? (
                  <span
                    className={`mt-[3px] block h-[13px] w-[124px] max-w-[124px] truncate text-start text-[11.5px] font-normal leading-[13px] text-txt-muted ${
                      drop_enabled ? "invisible" : ""
                    }`}
                  >
                    {preview.subject
                      ? `${preview.sender} - ${preview.subject}`
                      : preview.sender}
                  </span>
                ) : null}
                {drop_enabled ? (
                  <span className="pointer-events-none absolute left-0 top-[23px] block h-[13px] w-[124px] truncate text-start text-[11.5px] font-normal leading-[13px] text-brand">
                    {t("mail.drop_to_move_here")}
                  </span>
                ) : null}
              </span>
            </span>

            {is_active && (
              <span className="pointer-events-none absolute inset-x-0 -bottom-px h-[3px] rounded-t-full bg-brand" />
            )}
          </button>
        );
      })}

      {hovered &&
        createPortal(
          <div
            className={`pointer-events-none fixed z-[70] max-w-[260px] rounded-[10px] px-3 py-2 text-[12px] leading-snug ${
              reduce_motion
                ? ""
                : "transition-[opacity,transform] duration-150 ease-out"
            }`}
            role="tooltip"
            style={{
              backgroundColor: "var(--dropdown-bg)",
              border: "1px solid var(--border-secondary)",
              boxShadow:
                "0 10px 20px -12px rgba(0, 0, 0, 0.28), 0 2px 6px -3px rgba(0, 0, 0, 0.14)",
              color: "var(--text-secondary)",
              left: `${Math.max(8, Math.min(hovered.left, window.innerWidth - 272))}px`,
              top: `${hovered.top}px`,
              opacity: hover_visible ? 1 : 0,
              transform: reduce_motion
                ? undefined
                : hover_visible
                  ? "translateY(0)"
                  : "translateY(-4px)",
            }}
          >
            {hovered.description}
          </div>,
          document.body,
        )}
    </div>
  );
}
