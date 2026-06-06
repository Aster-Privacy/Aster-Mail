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

import {
  InboxIcon,
  TagIcon,
  UsersIcon,
  BellIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

interface EmptyConfig {
  Icon: typeof InboxIcon;
  title_key: TranslationKey;
  desc_key: TranslationKey;
}

const EMPTY_CONFIG: Record<string, EmptyConfig> = {
  primary: {
    Icon: InboxIcon,
    title_key: "mail.category_empty_primary_title",
    desc_key: "mail.category_empty_primary_desc",
  },
  promotions: {
    Icon: TagIcon,
    title_key: "mail.category_empty_promotions_title",
    desc_key: "mail.category_empty_promotions_desc",
  },
  social: {
    Icon: UsersIcon,
    title_key: "mail.category_empty_social_title",
    desc_key: "mail.category_empty_social_desc",
  },
  updates: {
    Icon: BellIcon,
    title_key: "mail.category_empty_updates_title",
    desc_key: "mail.category_empty_updates_desc",
  },
};

interface CategoryEmptyStateProps {
  category: EmailCategory;
}

export function CategoryEmptyState({
  category,
}: CategoryEmptyStateProps): React.ReactElement {
  const { t } = use_i18n();
  const config = EMPTY_CONFIG[category] ?? EMPTY_CONFIG.primary;
  const { Icon } = config;

  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <Icon className="mb-4 h-12 w-12 text-txt-muted" strokeWidth={1.25} />
      <h3 className="text-base font-semibold text-txt-primary">
        {t(config.title_key)}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-txt-secondary">
        {t(config.desc_key)}
      </p>
    </div>
  );
}
