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
import type { EmailCategory, InboxEmail } from "@/types/email";
import type { TranslationKey } from "@/lib/i18n/types";
import type { CustomCategoryRule } from "@/data/category_catalog";

import { useCallback, useRef } from "react";

import { move_items_to_category } from "@/components/email/inbox/category_move";

type UpdateEmail = (id: string, updates: Partial<InboxEmail>) => void;

interface UseCategoryDropOptions {
  emails: InboxEmail[];
  update_email: UpdateEmail;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  custom_categories?: readonly CustomCategoryRule[];
}

export function use_category_drop({
  emails,
  update_email,
  t,
  custom_categories,
}: UseCategoryDropOptions): (
  category: EmailCategory,
  email_ids: string[],
) => Promise<void> {
  const emails_ref = useRef(emails);

  emails_ref.current = emails;

  return useCallback(
    (category: EmailCategory, email_ids: string[]): Promise<void> => {
      const id_set = new Set(email_ids);
      const targets = emails_ref.current.filter((email) =>
        id_set.has(email.id),
      );

      return move_items_to_category(targets, category, {
        t,
        update_email,
        custom_categories,
      });
    },
    [update_email, t, custom_categories],
  );
}
