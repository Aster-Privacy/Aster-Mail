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
import {
  use_category_previews,
  use_category_preview_list,
} from "@/hooks/use_category_previews";

interface TabConfig {
  key: EmailCategory;
  label: string;
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
}

export function CategoryTabs({
  active_category,
  counts,
  on_change,
}: CategoryTabsProps): React.ReactElement {
  const { t } = use_i18n();
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
    left: number;
    top: number;
  } | null>(null);
  const hover_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover_previews = use_category_preview_list(hovered?.key ?? null);

  const cancel_hover = useCallback(() => {
    if (hover_timer_ref.current) {
      clearTimeout(hover_timer_ref.current);
      hover_timer_ref.current = null;
    }
    set_hovered(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hover_timer_ref.current) clearTimeout(hover_timer_ref.current);
    };
  }, []);

  const schedule_hover = useCallback(
    (key: EmailCategory, label: string, element: HTMLElement) => {
      if (hover_timer_ref.current) clearTimeout(hover_timer_ref.current);
      hover_timer_ref.current = setTimeout(() => {
        const rect = element.getBoundingClientRect();

        set_hovered({
          key,
          label,
          left: Math.min(rect.left, window.innerWidth - 332),
          top: rect.bottom + 6,
        });
      }, 450);
    },
    [],
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
      {tabs.map(({ key, label, Icon, color_style }) => {
        const is_active = key === active_category;
        const bucket = counts[key];
        const new_count = bucket?.new_count ?? 0;
        const unread = is_active ? 0 : (bucket?.unread ?? 0);
        const show_new = !is_active && new_count > 0;
        const preview = show_new ? previews[key] : undefined;

        return (
          <button
            key={key}
            aria-current={is_active ? "page" : undefined}
            className={`group relative flex h-12 min-w-[132px] max-w-[200px] flex-1 basis-[200px] items-center justify-start gap-2 whitespace-nowrap px-3 text-[13px] font-medium outline-none transition-colors duration-150 sm:px-4 ${
              is_active
                ? "text-brand"
                : "text-txt-secondary hover:bg-black/[0.03] hover:text-txt-primary dark:hover:bg-white/[0.04]"
            }`}
            style={color_style}
            type="button"
            onBlur={cancel_hover}
            onClick={() => {
              cancel_hover();
              on_change(key);
            }}
            onFocus={(e) => schedule_hover(key, label, e.currentTarget)}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={(e) => schedule_hover(key, label, e.currentTarget)}
            onMouseLeave={cancel_hover}
          >
            <span
              className={`flex min-w-0 items-center gap-2.5 ${
                preview ? "-translate-y-2" : ""
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  is_active
                    ? "text-brand"
                    : "text-txt-muted group-hover:text-txt-secondary"
                }`}
              />
              <span
                className={`relative flex flex-col items-start ${
                  preview ? "min-w-[168px]" : "min-w-0"
                }`}
              >
                <span className="flex h-5 min-w-0 items-center gap-2">
                  <span className="truncate">{label}</span>
                  {show_new ? (
                    <span className="aster_cat_badge">
                      {format_count(new_count)} {t("mail.tab_new_count")}
                    </span>
                  ) : unread > 0 ? (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 text-[11px] font-semibold leading-none tabular-nums bg-black/[0.07] text-txt-secondary dark:bg-white/[0.12] dark:text-txt-primary">
                      {format_count(unread)}
                    </span>
                  ) : null}
                </span>
                {preview ? (
                  <span className="absolute left-0 top-full mt-[3px] block h-[13px] w-[168px] max-w-[168px] truncate text-start text-[11.5px] font-normal leading-[13px] text-txt-muted">
                    {preview.subject
                      ? `${preview.sender} - ${preview.subject}`
                      : preview.sender}
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
        hover_previews.length > 0 &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[70] w-[320px] overflow-hidden rounded-[16px] p-1.5"
            style={{
              backgroundColor: "var(--dropdown-bg)",
              border: "1px solid var(--border-secondary)",
              boxShadow:
                "0 12px 24px -10px rgba(0, 0, 0, 0.22), 0 3px 8px -4px rgba(0, 0, 0, 0.12)",
              left: `${Math.max(8, hovered.left)}px`,
              top: `${hovered.top}px`,
            }}
          >
            <div
              className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              {hovered.label}
            </div>
            {hover_previews.map((item, index) => (
              <div
                key={`${item.sender}-${index}`}
                className="flex flex-col gap-0.5 rounded-[11px] px-2.5 py-1.5"
              >
                <span
                  className="truncate text-[12.5px] font-medium leading-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.sender}
                </span>
                {item.subject && (
                  <span
                    className="truncate text-[11.5px] leading-tight"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {item.subject}
                  </span>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
