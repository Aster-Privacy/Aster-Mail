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
import type { LanguageCode } from "@/lib/i18n/types";

import {
  createContext,
  ReactNode,
} from "react";

import {
  type UserPreferences,
} from "@/services/api/preferences";
import {
  get_supported_languages,
  get_display_name,
} from "@/lib/i18n/languages";
import {
  ACCENT_DERIVED_KEYS,
  apply_custom_theme,
  clear_material_theme,
  derive_accent_vars,
  is_valid_hex_color,
  type CustomThemeOverrides,
} from "@/lib/material_theme";
import { refresh_resolved_accent } from "@/lib/resolved_accent";
import {
  is_dark_only_color_theme,
  set_palette_forces_dark,
} from "@/lib/dark_mode";


export const LANGUAGE_OPTIONS = get_supported_languages().map((lang) => ({
  code: lang.code,
  label: get_display_name(lang.code),
}));

export const COLOR_THEME_CLASSES = [
  "theme-purple",
  "theme-green",
  "theme-rose",
  "theme-orange",
  "theme-teal",
  "theme-indigo",
  "theme-amber",
  "theme-cyan",
  "theme-slate",
  "theme-aster-blue",
  "theme-lime",
  "theme-fuchsia",
  "theme-emerald",
  "theme-pink",
  "theme-black",
];

export function apply_color_theme_class(
  color_theme: UserPreferences["color_theme"],
  accent_color: string,
  accent_color_hover: string,
  custom_theme_seed: string,
  is_dark: boolean,
  custom_theme_overrides?: CustomThemeOverrides,
) {
  const root = document.documentElement;

  root.style.removeProperty("--bg-secondary");
  root.style.removeProperty("--border-secondary");
  root.style.removeProperty("--text-tertiary");

  for (const cls of COLOR_THEME_CLASSES) {
    root.classList.remove(cls);
  }

  set_palette_forces_dark(is_dark_only_color_theme(color_theme));

  const set_inline_accent = () => {
    root.style.setProperty("--accent-color", accent_color);
    root.style.setProperty("--accent-color-hover", accent_color_hover);

    if (is_valid_hex_color(accent_color)) {
      for (const [key, value] of Object.entries(
        derive_accent_vars(accent_color),
      )) {
        root.style.setProperty(key, value);
      }
    }
  };

  if (color_theme === "custom") {
    if (is_valid_hex_color(custom_theme_seed)) {
      apply_custom_theme(custom_theme_seed, is_dark, custom_theme_overrides);
    } else {
      clear_material_theme();
      set_inline_accent();
    }
  } else {
    clear_material_theme();

    if (color_theme !== "default") {
      root.classList.add(`theme-${color_theme}`);
      root.style.removeProperty("--accent-color");
      root.style.removeProperty("--accent-color-hover");

      for (const key of ACCENT_DERIVED_KEYS) {
        root.style.removeProperty(key);
      }
    } else {
      set_inline_accent();
    }
  }

  sync_accent_derived_appearance();
  sync_meta_theme_color();
}

export function sync_accent_derived_appearance() {
  const root = document.documentElement;
  const { accent_fg } = refresh_resolved_accent();

  root.style.setProperty("--accent-fg", accent_fg);
}

export function sync_meta_theme_color() {
  const meta = document.querySelector('meta[name="theme-color"]');

  if (!meta) return;

  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--bg-secondary")
    .trim();

  if (bg) meta.setAttribute("content", bg);
}

export function label_to_language_code(label: string): LanguageCode | null {
  const match = LANGUAGE_OPTIONS.find((l) => l.label === label);

  return match ? (match.code as LanguageCode) : null;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface PreferencesContextType {
  preferences: UserPreferences;
  update_preference: <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    immediate?: boolean,
  ) => void;
  update_preferences: (
    updates: Partial<UserPreferences>,
    immediate?: boolean,
  ) => void;
  reset_to_defaults: () => void;
  reset_section: (keys: (keyof UserPreferences)[]) => void;
  save_now: () => Promise<void>;
  reload_preferences: () => Promise<void>;
  is_loading: boolean;
  has_loaded_from_server: boolean;
  save_status: SaveStatus;
  has_unsaved_changes: boolean;
}

export const PreferencesContext = createContext<PreferencesContextType | null>(null);

export const CROSS_DEVICE_REFRESH_POLL_MS = 20_000;
export const CROSS_DEVICE_REFRESH_MIN_INTERVAL_MS = 10_000;

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 22;
export const FONT_SIZE_DEFAULT = 15;

export const LEGACY_FONT_SIZE_MAP: Record<string, number> = {
  small: 14,
  default: 15,
  large: 17,
  extra_large: 19,
};

export function normalize_font_size_scale(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)));
  }
  if (typeof value === "string" && value in LEGACY_FONT_SIZE_MAP) {
    return LEGACY_FONT_SIZE_MAP[value];
  }

  return FONT_SIZE_DEFAULT;
}

export function read_connection(): { saveData?: boolean } | undefined {
  return (navigator as unknown as { connection?: { saveData?: boolean } })
    .connection;
}

export function should_auto_enable_low_network(): boolean {
  return read_connection()?.saveData === true;
}

export function reconcile_low_network_mode(prefs: UserPreferences): UserPreferences {
  if (prefs.low_network_mode_user_set) return prefs;

  const should_enable = should_auto_enable_low_network();

  if (should_enable === prefs.low_network_mode) return prefs;

  return { ...prefs, low_network_mode: should_enable };
}

export function normalize_preferences(prefs: UserPreferences): UserPreferences {
  const scale = normalize_font_size_scale(prefs.font_size_scale);

  if (scale === prefs.font_size_scale) {
    return prefs;
  }

  return { ...prefs, font_size_scale: scale };
}

export function apply_pending_preferences(
  incoming: UserPreferences,
  local: UserPreferences,
  pending_keys: Set<keyof UserPreferences>,
): UserPreferences {
  if (pending_keys.size === 0) return incoming;

  const result = { ...incoming };

  for (const key of pending_keys) {
    (result as unknown as Record<string, unknown>)[key] = local[key] as unknown;
  }

  return result;
}

export interface PreferencesProviderProps {
  children: ReactNode;
}

