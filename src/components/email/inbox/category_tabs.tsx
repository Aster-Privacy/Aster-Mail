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
import type { TranslationKey } from "@/lib/i18n/types";

import {
  InboxIcon,
  TagIcon,
  UsersIcon,
  BellIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface TabConfig {
  key: EmailCategory;
  label_key: TranslationKey;
  Icon: typeof InboxIcon;
}

const TAB_CONFIG: TabConfig[] = [
  { key: "primary", label_key: "mail_rules.category_primary", Icon: InboxIcon },
  {
    key: "promotions",
    label_key: "mail_rules.category_promotions",
    Icon: TagIcon,
  },
  { key: "social", label_key: "mail_rules.category_social", Icon: UsersIcon },
  { key: "updates", label_key: "mail_rules.category_updates", Icon: BellIcon },
];

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

  return (
    <div className="relative flex items-stretch gap-1 overflow-x-auto border-b border-edge-primary bg-surf-primary px-2 sm:px-3">
      {TAB_CONFIG.map(({ key, label_key, Icon }) => {
        const is_active = key === active_category;
        const bucket = counts[key];
        const new_count = bucket?.new_count ?? 0;
        const unread = bucket?.unread ?? 0;
        const show_new = !is_active && new_count > 0;

        return (
          <button
            key={key}
            aria-current={is_active ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap px-4 py-3.5 text-[13.5px] font-medium outline-none transition-colors duration-150 sm:px-5 ${
              is_active
                ? "text-blue-600 dark:text-blue-400"
                : "text-txt-secondary hover:bg-black/[0.03] hover:text-txt-primary dark:hover:bg-white/[0.04]"
            }`}
            type="button"
            onClick={() => on_change(key)}
          >
            <Icon
              className={`h-5 w-5 shrink-0 ${
                is_active
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-txt-muted group-hover:text-txt-secondary"
              }`}
            />
            <span>{t(label_key)}</span>
            {show_new ? (
              <span className="aster_badge aster_badge_blue">
                {format_count(new_count)} {t("mail.tab_new_count")}
              </span>
            ) : unread > 0 ? (
              <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 text-[11px] font-semibold leading-none tabular-nums bg-black/[0.07] text-txt-secondary dark:bg-white/[0.12] dark:text-txt-primary">
                {format_count(unread)}
              </span>
            ) : null}
            {is_active && (
              <span className="pointer-events-none absolute inset-x-2 -bottom-px h-[3px] rounded-t-full bg-blue-600 dark:bg-blue-400 sm:inset-x-3" />
            )}
          </button>
        );
      })}
    </div>
  );
}
