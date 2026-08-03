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
import type { CategoryColorKey } from "@/data/category_colors";

import { is_category_color } from "@/data/category_colors";

export type CategoryIconKey =
  | "inbox"
  | "tag"
  | "users"
  | "bell"
  | "chat"
  | "credit_card"
  | "plane"
  | "shopping_bag"
  | "star"
  | "heart"
  | "briefcase"
  | "home"
  | "globe"
  | "academic_cap"
  | "megaphone"
  | "gift"
  | "folder"
  | "sparkles";

export const CUSTOM_CATEGORY_ICON_CHOICES: readonly CategoryIconKey[] = [
  "tag",
  "star",
  "heart",
  "briefcase",
  "home",
  "globe",
  "shopping_bag",
  "credit_card",
  "plane",
  "academic_cap",
  "megaphone",
  "gift",
  "folder",
  "sparkles",
  "inbox",
  "users",
  "bell",
  "chat",
];

export interface BuiltinCategoryDef {
  id: string;
  icon: CategoryIconKey;
  label_key: TranslationKey;
  info_key: TranslationKey;
  default_enabled: boolean;
  removable: boolean;
  fold_target: string;
}

export const BUILTIN_CATEGORIES: readonly BuiltinCategoryDef[] = [
  {
    id: "primary",
    icon: "inbox",
    label_key: "mail_rules.category_primary",
    info_key: "settings.category_info_primary",
    default_enabled: true,
    removable: false,
    fold_target: "primary",
  },
  {
    id: "promotions",
    icon: "tag",
    label_key: "mail_rules.category_promotions",
    info_key: "settings.category_info_promotions",
    default_enabled: true,
    removable: true,
    fold_target: "primary",
  },
  {
    id: "social",
    icon: "users",
    label_key: "mail_rules.category_social",
    info_key: "settings.category_info_social",
    default_enabled: true,
    removable: true,
    fold_target: "primary",
  },
  {
    id: "updates",
    icon: "bell",
    label_key: "mail_rules.category_updates",
    info_key: "settings.category_info_updates",
    default_enabled: true,
    removable: true,
    fold_target: "primary",
  },
  {
    id: "forums",
    icon: "chat",
    label_key: "settings.category_forums",
    info_key: "settings.category_info_forums",
    default_enabled: false,
    removable: true,
    fold_target: "updates",
  },
  {
    id: "finance",
    icon: "credit_card",
    label_key: "settings.category_finance",
    info_key: "settings.category_info_finance",
    default_enabled: false,
    removable: true,
    fold_target: "updates",
  },
  {
    id: "travel",
    icon: "plane",
    label_key: "settings.category_travel",
    info_key: "settings.category_info_travel",
    default_enabled: false,
    removable: true,
    fold_target: "updates",
  },
  {
    id: "shopping",
    icon: "shopping_bag",
    label_key: "settings.category_shopping",
    info_key: "settings.category_info_shopping",
    default_enabled: false,
    removable: true,
    fold_target: "promotions",
  },
];

export const BUILTIN_CATEGORY_IDS: readonly string[] = BUILTIN_CATEGORIES.map(
  (c) => c.id,
);

export const DEFAULT_ENABLED_CATEGORIES: readonly string[] =
  BUILTIN_CATEGORIES.filter((c) => c.default_enabled && c.id !== "primary").map(
    (c) => c.id,
  );

export function builtin_category_def(
  id: string,
): BuiltinCategoryDef | undefined {
  return BUILTIN_CATEGORIES.find((c) => c.id === id);
}

export function fold_builtin(id: string): string {
  return builtin_category_def(id)?.fold_target ?? "primary";
}

export const CUSTOM_CATEGORY_PREFIX = "custom:";

export function is_custom_category_id(id: string): boolean {
  return id.startsWith(CUSTOM_CATEGORY_PREFIX);
}

export function make_custom_category_id(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${CUSTOM_CATEGORY_PREFIX}${random}`;
}

export interface CustomCategoryRule {
  id: string;
  name: string;
  icon: CategoryIconKey;
  color?: CategoryColorKey;
  match_domains: string[];
  match_keywords: string[];
  enabled: boolean;
}

const MAX_CUSTOM_CATEGORY_NAME = 40;
const MAX_CUSTOM_CATEGORY_RULES = 10;
const MAX_MATCH_TERMS = 25;
const MAX_MATCH_TERM_LENGTH = 100;

const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const KEYWORD_PATTERN = /^[\p{L}\p{N} '&._-]+$/u;

export function is_valid_match_domain(value: string): boolean {
  return DOMAIN_PATTERN.test(value.trim());
}

export function is_valid_match_keyword(value: string): boolean {
  return KEYWORD_PATTERN.test(value.trim());
}

function clean_terms(
  values: string[],
  is_valid: (value: string) => boolean,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of values) {
    const value = raw.trim().toLowerCase().slice(0, MAX_MATCH_TERM_LENGTH);

    if (!value || seen.has(value) || !is_valid(value)) continue;
    seen.add(value);
    result.push(value);

    if (result.length >= MAX_MATCH_TERMS) break;
  }

  return result;
}

export function sanitize_custom_category(
  raw: Partial<CustomCategoryRule>,
): CustomCategoryRule | null {
  const name = (raw.name ?? "").trim().slice(0, MAX_CUSTOM_CATEGORY_NAME);

  if (!name) return null;

  const icon = CUSTOM_CATEGORY_ICON_CHOICES.includes(
    raw.icon as CategoryIconKey,
  )
    ? (raw.icon as CategoryIconKey)
    : "tag";

  return {
    id: raw.id && is_custom_category_id(raw.id)
      ? raw.id
      : make_custom_category_id(),
    name,
    icon,
    ...(is_category_color(raw.color) ? { color: raw.color } : {}),
    match_domains: clean_terms(raw.match_domains ?? [], is_valid_match_domain),
    match_keywords: clean_terms(
      raw.match_keywords ?? [],
      is_valid_match_keyword,
    ),
    enabled: raw.enabled !== false,
  };
}

export function sanitize_custom_categories(
  raw: unknown,
): CustomCategoryRule[] {
  if (!Array.isArray(raw)) return [];

  const result: CustomCategoryRule[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const sanitized = sanitize_custom_category(
      entry as Partial<CustomCategoryRule>,
    );

    if (sanitized) result.push(sanitized);
    if (result.length >= MAX_CUSTOM_CATEGORY_RULES) break;
  }

  return result;
}

export function allowed_custom_categories(
  custom_categories: readonly CustomCategoryRule[],
  limit: number,
): CustomCategoryRule[] {
  if (limit < 0) return [...custom_categories];

  return custom_categories.slice(0, limit);
}

export { MAX_CUSTOM_CATEGORY_NAME, MAX_CUSTOM_CATEGORY_RULES, MAX_MATCH_TERMS };
