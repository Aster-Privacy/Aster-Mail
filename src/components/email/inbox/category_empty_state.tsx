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
import type { TranslationKey } from "@/lib/i18n/types";

import { SparklesIcon } from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  builtin_category_def,
  is_custom_category_id,
} from "@/data/category_catalog";
import { category_icon } from "@/data/category_icons";

const EMPTY_COPY: Readonly<Record<string, [TranslationKey, TranslationKey]>> = {
  primary: [
    "mail.category_empty_primary_title",
    "mail.category_empty_primary_desc",
  ],
  promotions: [
    "mail.category_empty_promotions_title",
    "mail.category_empty_promotions_desc",
  ],
  newsletters: [
    "mail.category_empty_newsletters_title",
    "mail.category_empty_newsletters_desc",
  ],
  social: [
    "mail.category_empty_social_title",
    "mail.category_empty_social_desc",
  ],
  updates: [
    "mail.category_empty_updates_title",
    "mail.category_empty_updates_desc",
  ],
  transactions: [
    "mail.category_empty_transactions_title",
    "mail.category_empty_transactions_desc",
  ],
  forums: [
    "mail.category_empty_forums_title",
    "mail.category_empty_forums_desc",
  ],
  finance: [
    "mail.category_empty_finance_title",
    "mail.category_empty_finance_desc",
  ],
  travel: [
    "mail.category_empty_travel_title",
    "mail.category_empty_travel_desc",
  ],
  shopping: [
    "mail.category_empty_shopping_title",
    "mail.category_empty_shopping_desc",
  ],
};

interface CategoryEmptyStateProps {
  category: EmailCategory;
}

export function CategoryEmptyState({
  category,
}: CategoryEmptyStateProps): React.ReactElement {
  const { t } = use_i18n();
  const { preferences } = use_preferences();

  if (is_custom_category_id(category)) {
    const rule = (preferences.custom_categories ?? []).find(
      (r) => r.id === category,
    );
    const Icon = rule ? category_icon(rule.icon) : SparklesIcon;

    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <Icon className="mb-4 h-12 w-12 text-txt-muted" strokeWidth={1.25} />
        <h3 className="text-base font-semibold text-txt-primary">
          {rule ? rule.name : t("mail.category_empty_primary_title")}
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-txt-secondary">
          {t("mail.category_empty_custom_desc")}
        </p>
      </div>
    );
  }

  const def = builtin_category_def(category) ?? builtin_category_def("primary");
  const [title_key, desc_key] = EMPTY_COPY[def?.id ?? "primary"];
  const Icon = category_icon(def?.icon ?? "inbox");

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <Icon className="mb-4 h-12 w-12 text-txt-muted" strokeWidth={1.25} />
      <h3 className="text-base font-semibold text-txt-primary">
        {t(title_key)}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-txt-secondary">
        {t(desc_key)}
      </p>
    </div>
  );
}
