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

import { useMemo } from "react";
import type { InboxIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  BUILTIN_CATEGORIES,
  allowed_custom_categories,
} from "@/data/category_catalog";
import { category_icon } from "@/data/category_icons";

export interface CategoryMenuOption {
  key: EmailCategory;
  label: string;
  Icon: typeof InboxIcon;
}

export function use_category_menu_options(): CategoryMenuOption[] {
  const { t } = use_i18n();
  const { preferences } = use_preferences();
  const { limits } = use_plan_limits();

  const category_limit = limits
    ? (limits.limits["max_custom_categories"]?.limit ?? -1)
    : -1;

  return useMemo<CategoryMenuOption[]>(() => {
    const enabled_ids = new Set(preferences.enabled_categories ?? []);
    const list: CategoryMenuOption[] = [];

    for (const cat of BUILTIN_CATEGORIES) {
      if (cat.id !== "primary" && !enabled_ids.has(cat.id)) continue;

      list.push({
        key: cat.id,
        label: t(cat.label_key),
        Icon: category_icon(cat.icon),
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
      });
    }

    return list;
  }, [preferences.enabled_categories, preferences.custom_categories, category_limit, t]);
}
