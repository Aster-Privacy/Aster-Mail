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
import { useEffect, useMemo, useState } from "react";

import type { LanguageCode, SettingsTranslations } from "@/lib/i18n/types";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  GlobeAltIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  ViewColumnsIcon,
} from "@heroicons/react/24/outline";
import { UpgradeBtn } from "@aster/ui";

import { useTheme } from "@/contexts/theme_context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_supported_languages,
  get_display_name,
} from "@/lib/i18n/languages";
import { ThemeCard } from "@/components/settings/appearance/theme_card";
import { ViewModeCard } from "@/components/settings/appearance/view_mode_card";
import { ComposeModeCard } from "@/components/settings/appearance/compose_mode_card";
import { SettingRow } from "@/components/settings/appearance/setting_row";
import { ColorSwatchPicker } from "@/components/settings/appearance/color_swatch_picker";
import { TimeZonePicker } from "@/components/settings/appearance/time_zone_picker";
import { get_supported_time_zones } from "@/lib/time_zones";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { go_to_billing } from "@/components/settings/aliases/feature_lock";
import {
  FONT_OPTIONS,
  DEFAULT_FONT_ID,
  EMAIL_FONT_MATCH_APP_ID,
} from "@/lib/font_options";
import {
  is_valid_hex_color,
  generate_material_theme,
  CUSTOM_THEME_ROLE_KEYS,
  type MaterialThemeVars,
} from "@/lib/material_theme";

const CUSTOM_THEME_ROLE_LABEL_KEYS: Record<
  string,
  keyof SettingsTranslations
> = {
  "--accent-color": "custom_theme_role_accent",
  "--accent-color-hover": "custom_theme_role_accent_hover",
  "--bg-primary": "custom_theme_role_background",
  "--bg-secondary": "custom_theme_role_background_secondary",
  "--text-primary": "custom_theme_role_text",
  "--text-secondary": "custom_theme_role_text_secondary",
  "--border-primary": "custom_theme_role_border",
};

const LANGUAGES = get_supported_languages();

export function AppearanceSection() {
  const { theme, theme_preference, set_theme_preference } = useTheme();
  const { preferences, update_preference } = use_preferences();
  const { t, set_language } = use_i18n();
  const [show_more_themes, set_show_more_themes] = useState(false);
  const { limits } = use_plan_limits();
  const is_paid_plan = !!limits && limits.plan_code !== "free";

  useEffect(() => {
    if (!limits || is_paid_plan) return;
    if (preferences.color_theme !== "custom") return;

    update_preference("color_theme", "default", true);
    update_preference("custom_theme_overrides", {}, true);
  }, [limits, is_paid_plan, preferences.color_theme]);

  const handle_theme_select = (mode: "light" | "dark" | "system") => {
    set_theme_preference(mode);
    update_preference("theme", mode, true);
    update_preference("color_theme", "default", true);
  };

  const handle_color_theme_select = (
    value:
      | "purple"
      | "green"
      | "rose"
      | "orange"
      | "teal"
      | "indigo"
      | "amber"
      | "cyan"
      | "slate"
      | "aster-blue"
      | "lime"
      | "fuchsia"
      | "emerald"
      | "pink"
      | "black",
  ) => {
    set_theme_preference("dark");
    update_preference("theme", "dark", true);
    update_preference("color_theme", value, true);
  };

  const is_default_color = (preferences.color_theme ?? "default") === "default";

  const handle_custom_color_change = (hex: string, immediate: boolean) => {
    if (!is_valid_hex_color(hex)) return;

    update_preference("custom_theme_seed", hex, immediate);
    update_preference("color_theme", "custom", immediate);
  };

  const handle_font_change = (value: string) => {
    update_preference("font_choice", value, true);
  };

  const handle_email_font_change = (value: string) => {
    update_preference("email_font_choice", value, true);
  };

  const custom_theme_base = generate_material_theme(
    is_valid_hex_color(preferences.custom_theme_seed)
      ? preferences.custom_theme_seed
      : "#3b82f6",
    theme === "dark",
  );

  const handle_role_override_change = (
    key: keyof MaterialThemeVars,
    hex: string,
    immediate: boolean,
  ) => {
    if (!is_valid_hex_color(hex)) return;

    update_preference(
      "custom_theme_overrides",
      { ...preferences.custom_theme_overrides, [key]: hex },
      immediate,
    );
    update_preference("color_theme", "custom", immediate);
  };

  const handle_role_override_reset = (key: keyof MaterialThemeVars) => {
    const next = { ...preferences.custom_theme_overrides };

    delete next[key];
    update_preference("custom_theme_overrides", next, true);
  };

  const handle_reset_all_overrides = () => {
    update_preference("custom_theme_overrides", {}, true);
  };

  const handle_language_change = (code: string) => {
    const display_name = get_display_name(code as LanguageCode);

    update_preference("language", display_name, true);
    set_language(code as LanguageCode);
  };

  const current_language_code =
    LANGUAGES.find(
      (lang) => get_display_name(lang.code) === preferences.language,
    )?.code || "en";

  const handle_date_format_change = (value: string) => {
    update_preference("date_format", value, true);
  };

  const handle_time_format_change = (value: string) => {
    update_preference("time_format", value as "12h" | "24h", true);
  };

  const time_format_display =
    preferences.time_format === "24h"
      ? t("settings.twenty_four_hours")
      : t("settings.twelve_hours");

  const available_time_zones = useMemo<string[]>(
    () => get_supported_time_zones(),
    [],
  );

  const time_zone_value =
    preferences.time_zone && available_time_zones.includes(preferences.time_zone)
      ? preferences.time_zone
      : "auto";

  const handle_time_zone_change = (value: string) => {
    update_preference("time_zone", value, true);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PaintBrushIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.theme")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.change_appearance")}
        </p>
        <div
          className={
            show_more_themes
              ? "flex gap-4 flex-wrap"
              : "grid grid-cols-2 sm:grid-cols-4 gap-4"
          }
        >
          <ThemeCard
            is_selected={theme_preference === "system" && is_default_color}
            label={t("settings.theme_system")}
            mode="system"
            full_width={!show_more_themes}
            on_select={() => handle_theme_select("system")}
          />
          <ThemeCard
            is_selected={theme_preference === "light" && is_default_color}
            label={t("settings.theme_light")}
            mode="light"
            full_width={!show_more_themes}
            on_select={() => handle_theme_select("light")}
          />
          <ThemeCard
            is_selected={theme_preference === "dark" && is_default_color}
            label={t("settings.theme_dark")}
            mode="dark"
            full_width={!show_more_themes}
            on_select={() => handle_theme_select("dark")}
          />
          <ThemeCard
            is_selected={preferences.color_theme === "aster-blue"}
            label={t("settings.color_theme_aster_blue")}
            mode="aster-blue"
            full_width={!show_more_themes}
            on_select={() => handle_color_theme_select("aster-blue")}
          />
          {show_more_themes && (
            <>
              <ThemeCard
                is_selected={preferences.color_theme === "purple"}
                label={t("settings.color_theme_purple")}
                mode="purple"
                on_select={() => handle_color_theme_select("purple")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "green"}
                label={t("settings.color_theme_green")}
                mode="green"
                on_select={() => handle_color_theme_select("green")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "rose"}
                label={t("settings.color_theme_rose")}
                mode="rose"
                on_select={() => handle_color_theme_select("rose")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "orange"}
                label={t("settings.color_theme_orange")}
                mode="orange"
                on_select={() => handle_color_theme_select("orange")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "teal"}
                label={t("settings.color_theme_teal")}
                mode="teal"
                on_select={() => handle_color_theme_select("teal")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "indigo"}
                label={t("settings.color_theme_indigo")}
                mode="indigo"
                on_select={() => handle_color_theme_select("indigo")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "amber"}
                label={t("settings.color_theme_amber")}
                mode="amber"
                on_select={() => handle_color_theme_select("amber")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "cyan"}
                label={t("settings.color_theme_cyan")}
                mode="cyan"
                on_select={() => handle_color_theme_select("cyan")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "slate"}
                label={t("settings.color_theme_slate")}
                mode="slate"
                on_select={() => handle_color_theme_select("slate")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "lime"}
                label={t("settings.color_theme_lime")}
                mode="lime"
                on_select={() => handle_color_theme_select("lime")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "fuchsia"}
                label={t("settings.color_theme_fuchsia")}
                mode="fuchsia"
                on_select={() => handle_color_theme_select("fuchsia")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "black"}
                label={t("settings.color_theme_black")}
                mode="black"
                on_select={() => handle_color_theme_select("black")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "emerald"}
                label={t("settings.color_theme_emerald")}
                mode="emerald"
                on_select={() => handle_color_theme_select("emerald")}
              />
              <ThemeCard
                is_selected={preferences.color_theme === "pink"}
                label={t("settings.color_theme_pink")}
                mode="pink"
                on_select={() => handle_color_theme_select("pink")}
              />
            </>
          )}
        </div>
        <button
          type="button"
          className="mt-3 flex items-center gap-1 text-sm font-medium text-txt-secondary hover:text-txt-primary transition-colors cursor-pointer"
          onClick={() => set_show_more_themes((prev) => !prev)}
        >
          {show_more_themes ? (
            <>
              {t("common.show_less")}
              <ChevronUpIcon className="w-4 h-4" />
            </>
          ) : (
            <>
              {t("common.show_more")}
              <ChevronDownIcon className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PaintBrushIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.custom_theme_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-4 text-txt-muted">
          {t("settings.custom_theme_description")}
        </p>
        <SettingRow
          description={t("settings.font_choice_description")}
          label={t("settings.font_choice_title")}
        >
          <Select
            value={preferences.font_choice ?? DEFAULT_FONT_ID}
            onValueChange={handle_font_change}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.id === "default"
                    ? t("settings.font_option_default")
                    : font.id === "system"
                      ? t("settings.font_option_system")
                      : font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          description={t("settings.email_font_choice_description")}
          label={t("settings.email_font_choice_title")}
        >
          <Select
            value={preferences.email_font_choice ?? EMAIL_FONT_MATCH_APP_ID}
            onValueChange={handle_email_font_change}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMAIL_FONT_MATCH_APP_ID}>
                {t("settings.email_font_option_match_app")}
              </SelectItem>
              {FONT_OPTIONS.map((font) => (
                <SelectItem key={font.id} value={font.id}>
                  {font.id === "default"
                    ? t("settings.font_option_default")
                    : font.id === "system"
                      ? t("settings.font_option_system")
                      : font.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <div className="mt-6">
          {is_paid_plan ? (
            <>
              <p className="text-sm font-semibold text-txt-primary mb-4">
                {t("settings.custom_theme_colors_title")}
              </p>

              <div className="flex items-center gap-3 mb-4">
                <ColorSwatchPicker
                  label={t("settings.custom_theme_color_label")}
                  value={
                    is_valid_hex_color(preferences.custom_theme_seed)
                      ? preferences.custom_theme_seed
                      : "#3b82f6"
                  }
                  onChange={(hex) => handle_custom_color_change(hex, false)}
                  onCommit={(hex) => handle_custom_color_change(hex, true)}
                />
                <div className="flex-1">
                  <p className="text-sm text-txt-primary">
                    {t("settings.custom_theme_color_label")}
                  </p>
                  <p className="text-xs text-txt-muted">
                    {preferences.color_theme === "custom"
                      ? t("settings.custom_theme_active")
                      : t("settings.custom_theme_inactive")}
                  </p>
                </div>
                {Object.keys(preferences.custom_theme_overrides ?? {}).length >
                  0 && (
                  <button
                    className="text-xs text-txt-muted hover:text-txt-primary flex-shrink-0"
                    type="button"
                    onClick={handle_reset_all_overrides}
                  >
                    {t("settings.custom_theme_reset_all")}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CUSTOM_THEME_ROLE_KEYS.map((key) => {
                  const override = preferences.custom_theme_overrides?.[key];
                  const value = override ?? custom_theme_base[key];

                  const role_label = t(
                    `settings.${CUSTOM_THEME_ROLE_LABEL_KEYS[key]}`,
                  );

                  return (
                    <div className="flex items-center gap-2" key={key}>
                      <ColorSwatchPicker
                        label={role_label}
                        size="sm"
                        value={value}
                        onChange={(hex) =>
                          handle_role_override_change(key, hex, false)
                        }
                        onCommit={(hex) =>
                          handle_role_override_change(key, hex, true)
                        }
                      />
                      <span className="text-xs text-txt-secondary flex-1 truncate">
                        {role_label}
                      </span>
                      {override && (
                        <button
                          aria-label={t("settings.custom_theme_reset_role")}
                          className="text-txt-muted hover:text-txt-primary flex-shrink-0 text-xs"
                          title={t("settings.custom_theme_reset_role")}
                          type="button"
                          onClick={() => handle_role_override_reset(key)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <UpgradeBtn size="sm" onClick={go_to_billing}>
              {t("settings.upgrade_to_unlock")}
            </UpgradeBtn>
          )}
        </div>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <GlobeAltIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.language_format_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <SettingRow
          description={t("settings.language_description")}
          label={t("settings.language")}
        >
          <Select
            value={current_language_code}
            onValueChange={handle_language_change}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.native_name}
                  {lang.region ? ` (${lang.region})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          description={t("settings.time_format_description")}
          label={t("settings.time_format")}
        >
          <Select
            value={preferences.time_format}
            onValueChange={handle_time_format_change}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue>{time_format_display}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">{t("settings.twelve_hours")}</SelectItem>
              <SelectItem value="24h">
                {t("settings.twenty_four_hours")}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          description={t("settings.date_format_description")}
          label={t("settings.date_format")}
        >
          <Select
            value={preferences.date_format}
            onValueChange={handle_date_format_change}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          description={t("settings.time_zone_description")}
          label={t("settings.time_zone")}
        >
          <TimeZonePicker
            value={time_zone_value}
            on_change={handle_time_zone_change}
            use_24h={preferences.time_format === "24h"}
          />
        </SettingRow>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ViewColumnsIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.email_view_mode")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-2 text-txt-muted">
          {t("settings.email_view_description")}
        </p>
        <div className="flex gap-4">
          <ViewModeCard
            is_selected={preferences.email_view_mode === "popup"}
            label={t("settings.popup")}
            mode="popup"
            on_select={() =>
              update_preference("email_view_mode", "popup", true)
            }
            theme={theme}
          />
          <ViewModeCard
            is_selected={preferences.email_view_mode === "split"}
            label={t("settings.split_view")}
            mode="split"
            on_select={() =>
              update_preference("email_view_mode", "split", true)
            }
            theme={theme}
          />
          <ViewModeCard
            is_selected={preferences.email_view_mode === "fullpage"}
            label={t("settings.full_page")}
            mode="fullpage"
            on_select={() =>
              update_preference("email_view_mode", "fullpage", true)
            }
            theme={theme}
          />
        </div>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PencilSquareIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.compose_window_mode")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-2 text-txt-muted">
          {t("settings.compose_window_mode_description")}
        </p>
        <div className="flex gap-4">
          <ComposeModeCard
            is_selected={(preferences.compose_window_mode ?? "default") === "default"}
            label={t("settings.compose_mode_default")}
            mode="default"
            on_select={() =>
              update_preference("compose_window_mode", "default", true)
            }
            theme={theme}
          />
          <ComposeModeCard
            is_selected={(preferences.compose_window_mode ?? "default") === "fullscreen"}
            label={t("settings.compose_mode_fullscreen")}
            mode="fullscreen"
            on_select={() =>
              update_preference("compose_window_mode", "fullscreen", true)
            }
            theme={theme}
          />
          <ComposeModeCard
            is_selected={(preferences.compose_window_mode ?? "default") === "minimized"}
            label={t("settings.compose_mode_minimized")}
            mode="minimized"
            on_select={() =>
              update_preference("compose_window_mode", "minimized", true)
            }
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}
