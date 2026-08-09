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
import type { UserPreferences } from "@/services/api/preferences";

import { DARK_ONLY_COLOR_THEMES } from "@/lib/dark_mode";

export type ThemePreferenceValue = UserPreferences["theme"];
export type ColorThemeValue = UserPreferences["color_theme"];

export interface ThemeFields {
  theme: ThemePreferenceValue;
  color_theme: ColorThemeValue;
  custom_theme_seed: string;
}

export type ThemeSyncPreferences = Pick<
  UserPreferences,
  | "theme"
  | "color_theme"
  | "custom_theme_seed"
  | "theme_sync_enabled_web"
  | "theme_web"
  | "color_theme_web"
  | "custom_theme_seed_web"
>;

const THEME_VALUES = new Set<string>(["light", "dark", "system"]);

const COLOR_THEME_VALUES = new Set<string>([
  "default",
  "custom",
  ...DARK_ONLY_COLOR_THEMES,
]);

function read_theme(value: unknown): ThemePreferenceValue | null {
  return typeof value === "string" && THEME_VALUES.has(value)
    ? (value as ThemePreferenceValue)
    : null;
}

function read_color_theme(value: unknown): ColorThemeValue | null {
  return typeof value === "string" && COLOR_THEME_VALUES.has(value)
    ? (value as ColorThemeValue)
    : null;
}

function read_seed(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function is_theme_sync_enabled(
  preferences: Pick<ThemeSyncPreferences, "theme_sync_enabled_web">,
): boolean {
  return preferences.theme_sync_enabled_web !== false;
}

export function get_effective_theme_fields(
  preferences: ThemeSyncPreferences,
): ThemeFields {
  const shared: ThemeFields = {
    theme: read_theme(preferences.theme) ?? "dark",
    color_theme: read_color_theme(preferences.color_theme) ?? "default",
    custom_theme_seed: preferences.custom_theme_seed,
  };

  if (is_theme_sync_enabled(preferences)) {
    return shared;
  }

  return {
    theme: read_theme(preferences.theme_web) ?? shared.theme,
    color_theme:
      read_color_theme(preferences.color_theme_web) ?? shared.color_theme,
    custom_theme_seed:
      read_seed(preferences.custom_theme_seed_web) ?? shared.custom_theme_seed,
  };
}

export function build_theme_fields_update(
  preferences: Pick<ThemeSyncPreferences, "theme_sync_enabled_web">,
  changes: Partial<ThemeFields>,
): Partial<UserPreferences> {
  const update: Partial<UserPreferences> = {};
  const sync_on = is_theme_sync_enabled(preferences);

  if (changes.theme !== undefined) {
    if (sync_on) {
      update.theme = changes.theme;
    } else {
      update.theme_web = changes.theme;
    }
  }

  if (changes.color_theme !== undefined) {
    if (sync_on) {
      update.color_theme = changes.color_theme;
    } else {
      update.color_theme_web = changes.color_theme;
    }
  }

  if (changes.custom_theme_seed !== undefined) {
    if (sync_on) {
      update.custom_theme_seed = changes.custom_theme_seed;
    } else {
      update.custom_theme_seed_web = changes.custom_theme_seed;
    }
  }

  return update;
}

export function build_theme_sync_toggle_update(
  preferences: ThemeSyncPreferences,
  enabled: boolean,
): Partial<UserPreferences> {
  if (enabled) {
    return { theme_sync_enabled_web: true };
  }

  const effective = get_effective_theme_fields(preferences);

  return {
    theme_web: effective.theme,
    color_theme_web: effective.color_theme,
    custom_theme_seed_web: effective.custom_theme_seed,
    theme_sync_enabled_web: false,
  };
}
