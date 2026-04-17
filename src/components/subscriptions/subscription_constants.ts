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

export const CATEGORY_COLORS: Record<string, string> = {
  newsletter:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  marketing:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  social:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  transactional:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  unknown: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export const CATEGORY_TAG_VARIANT: Record<string, string> = {
  newsletter: "blue",
  marketing: "purple",
  social: "green",
  transactional: "amber",
  unknown: "neutral",
};

export const CATEGORY_KEY_MAP: Record<string, TranslationKey> = {
  newsletter: "settings.newsletter",
  marketing: "common.marketing",
  social: "common.social",
  transactional: "settings.transactional",
};

export function get_category_label(
  category: string,
  t: (key: TranslationKey) => string,
): string {
  const key = CATEGORY_KEY_MAP[category];

  if (key) return t(key);

  return t("common.other");
}
