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

import { PaintBrushIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";

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
import { SettingRow } from "@/components/settings/appearance/setting_row";

const LANGUAGES = get_supported_languages();

export function AppearanceSection() {
  const { theme, theme_preference, set_theme_preference } = useTheme();
  const { preferences, update_preference } = use_preferences();
  const { t, set_language } = use_i18n();

  const handle_theme_select = (mode: "light" | "dark") => {
    set_theme_preference(mode);
    update_preference("theme", mode, true);
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
        <div className="flex gap-4">
          <ThemeCard
            is_selected={theme_preference === "light"}
            label={t("settings.theme_light")}
            mode="light"
            on_select={() => handle_theme_select("light")}
          />
          <ThemeCard
            is_selected={theme_preference === "dark"}
            label={t("settings.theme_dark")}
            mode="dark"
            on_select={() => handle_theme_select("dark")}
          />
        </div>
      </div>

      <div className="pt-3">
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
    </div>
  );
}
