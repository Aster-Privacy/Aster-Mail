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

import { useMemo } from "react";
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
import { use_category_previews } from "@/hooks/use_category_previews";

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

  const handle_wheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY === 0) return;
    const el = e.currentTarget;

    if (el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  return (
    <div
      className="aster_scrollbar_thin group/tabs relative flex shrink-0 select-none items-stretch gap-1 overflow-x-auto overflow-y-hidden border-b border-edge-primary bg-surf-primary px-2 sm:px-3"
      onWheel={handle_wheel}
    >
      {tabs.map(({ key, label, Icon, color_style }) => {
        const is_active = key === active_category;
        const bucket = counts[key];
        const new_count = bucket?.new_count ?? 0;
        const unread = bucket?.unread ?? 0;
        const show_new = !is_active && new_count > 0;
        const preview = show_new ? previews[key] : undefined;

        return (
          <button
            key={key}
            aria-current={is_active ? "page" : undefined}
            className={`group relative flex h-[58px] shrink-0 items-center gap-2.5 whitespace-nowrap px-4 text-[13.5px] font-medium outline-none transition-colors duration-150 sm:px-5 ${
              is_active
                ? "text-brand"
                : "text-txt-secondary hover:bg-black/[0.03] hover:text-txt-primary dark:hover:bg-white/[0.04]"
            }`}
            style={color_style}
            type="button"
            onClick={() => on_change(key)}
          >
            <Icon
              className={`h-5 w-5 shrink-0 ${
                is_active
                  ? "text-brand"
                  : "text-txt-muted group-hover:text-txt-secondary"
              }`}
            />
            <span className="relative flex flex-col items-start gap-[2px] sm:min-w-[164px]">
              <span className="flex items-center gap-2.5 leading-[18px]">
                <span>{label}</span>
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
              <span className="block h-[14px] w-full">
                <span className="absolute inset-x-0 bottom-0 block truncate text-start text-[12px] font-normal leading-[14px] text-txt-muted">
                  {preview ? (
                    <>
                      <span className="font-medium text-txt-secondary">
                        {preview.sender}
                      </span>
                      {preview.subject ? ` - ${preview.subject}` : ""}
                    </>
                  ) : null}
                </span>
              </span>
            </span>
            {is_active && (
              <span className="pointer-events-none absolute inset-x-2 -bottom-px h-[3px] rounded-t-full bg-brand sm:inset-x-3" />
            )}
          </button>
        );
      })}
    </div>
  );
}
