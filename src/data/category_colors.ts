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
import type { CSSProperties } from "react";
import type { CustomCategoryRule } from "@/data/category_catalog";
import type { TranslationKey } from "@/lib/i18n/types";

export type CategoryColorKey =
  | "accent"
  | "blue"
  | "green"
  | "amber"
  | "violet"
  | "teal"
  | "cyan"
  | "rose"
  | "pink"
  | "slate";

export const CUSTOM_CATEGORY_COLOR_CHOICES: readonly CategoryColorKey[] = [
  "accent",
  "blue",
  "green",
  "amber",
  "violet",
  "teal",
  "cyan",
  "rose",
  "pink",
  "slate",
];

export const CATEGORY_COLOR_LABEL_KEYS: Record<
  CategoryColorKey,
  TranslationKey
> = {
  accent: "settings.category_color_accent",
  blue: "settings.category_color_blue",
  green: "settings.category_color_green",
  amber: "settings.category_color_amber",
  violet: "settings.category_color_violet",
  teal: "settings.category_color_teal",
  cyan: "settings.category_color_cyan",
  rose: "settings.category_color_rose",
  pink: "settings.category_color_pink",
  slate: "settings.category_color_slate",
};

const BUILTIN_CATEGORY_COLORS: Record<string, CategoryColorKey> = {
  primary: "accent",
  promotions: "green",
  social: "cyan",
  updates: "amber",
  forums: "violet",
  finance: "teal",
  travel: "rose",
  shopping: "pink",
};

const FALLBACK_COLORS: readonly CategoryColorKey[] = [
  "blue",
  "green",
  "amber",
  "violet",
  "teal",
  "cyan",
  "rose",
  "pink",
];

export function is_category_color(value: unknown): value is CategoryColorKey {
  return (
    typeof value === "string" &&
    (CUSTOM_CATEGORY_COLOR_CHOICES as readonly string[]).includes(value)
  );
}

function hashed_color(id: string): CategoryColorKey {
  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }

  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function category_color_key(
  id: string,
  custom_rule?: Pick<CustomCategoryRule, "color"> | null,
): CategoryColorKey {
  if (custom_rule && is_category_color(custom_rule.color)) {
    return custom_rule.color;
  }

  return BUILTIN_CATEGORY_COLORS[id] ?? hashed_color(id);
}

export function category_color_style(key: CategoryColorKey): CSSProperties {
  return {
    ["--cat-fg" as string]: `var(--cat-${key}-fg)`,
    ["--cat-soft" as string]: `var(--cat-${key}-soft)`,
    ["--cat-border" as string]: `var(--cat-${key}-border)`,
  } as CSSProperties;
}
