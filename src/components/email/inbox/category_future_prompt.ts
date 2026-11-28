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

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

export function future_prompt_message(
  senders: readonly string[],
  category_label: string,
  t: Translate,
): string | null {
  if (senders.length === 0) return null;
  if (senders.length === 1) {
    return t("mail.category_future_prompt_one", {
      sender: senders[0],
      category: category_label,
    });
  }

  return t("mail.category_future_prompt_many", {
    count: senders.length,
    category: category_label,
  });
}

export function future_done_message(
  senders: readonly string[],
  category_label: string,
  t: Translate,
): string {
  if (senders.length === 1) {
    return t("mail.category_future_done_one", {
      sender: senders[0],
      category: category_label,
    });
  }

  return t("mail.category_future_done_many", {
    count: senders.length,
    category: category_label,
  });
}
