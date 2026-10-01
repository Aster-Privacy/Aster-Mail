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

export type CategoryBadgeColor = "blue" | "purple" | "green" | "amber" | "gray";

export const CATEGORY_BADGE_COLOR: Record<string, CategoryBadgeColor> = {
  newsletter: "blue",
  marketing: "purple",
  social: "green",
  transactional: "amber",
  unknown: "gray",
};

export function get_category_badge_color(category: string): CategoryBadgeColor {
  return CATEGORY_BADGE_COLOR[category] ?? "gray";
}

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
