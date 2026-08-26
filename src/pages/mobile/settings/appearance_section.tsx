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
import type { LanguageCode as _LanguageCode } from "@/lib/i18n/types";
import type { ReactNode } from "react";

import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader, OptionList } from "./shared";
import { TimeZonePicker } from "@/components/settings/appearance/time_zone_picker";
import { get_supported_time_zones } from "@/lib/time_zones";

import {
  label_to_language_code,
  use_preferences,
} from "@/contexts/preferences_context";
import {
  build_theme_mode_update,
  get_effective_theme_fields,
} from "@/lib/theme_sync";
import { use_i18n } from "@/lib/i18n/context";
import {
  get_display_name as _get_display_name,
  get_supported_languages,
} from "@/lib/i18n/languages";
import { useTheme } from "@/contexts/theme_context";

type LanguageCode = _LanguageCode;
const get_display_name = _get_display_name;

export function AppearanceSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { theme_preference, set_theme_preference } = useTheme();
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const { set_language } = use_i18n();

  const theme_options: {
    value: "light" | "dark" | "system";
    label: string;
    icon: ReactNode;
  }[] = [
    {
      value: "light",
      label: t("settings.theme_light"),
      icon: <SunIcon className="h-5 w-5" />,
    },
    {
      value: "dark",
      label: t("settings.theme_dark"),
      icon: <MoonIcon className="h-5 w-5" />,
    },
    {
      value: "system",
      label: t("settings.theme_system"),
      icon: <ComputerDesktopIcon className="h-5 w-5" />,
    },
  ];

  const time_format_options: { value: "12h" | "24h"; label: string }[] = [
    { value: "12h", label: t("settings.time_format_12h") },
    { value: "24h", label: t("settings.time_format_24h") },
  ];

  const time_zone_value =
    preferences.time_zone &&
    get_supported_time_zones().includes(preferences.time_zone)
      ? preferences.time_zone
      : "auto";

  const date_format_options: { value: string; label: string }[] = [
    { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
    { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
    { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  ];

  const language_entries: { code: LanguageCode; display: string }[] =
    get_supported_languages().map((lang) => ({
      code: lang.code as LanguageCode,
      display: get_display_name(lang.code as LanguageCode),
    }));

  const language_options = language_entries.map((l) => ({
    value: l.display,
    label: l.display,
  }));

  const current_language_code = label_to_language_code(
    preferences.language ?? "",
  );
  const current_language_display = current_language_code
    ? get_display_name(current_language_code)
    : preferences.language;

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.appearance")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <SettingsGroup title={t("settings.theme")}>
          <div className="divide-y divide-[var(--border-primary)]">
            {theme_options.map((opt) => (
              <button
                key={opt.value}
                className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-[var(--mobile-bg-card-hover)]"
                type="button"
                onClick={() => {
                  set_theme_preference(opt.value);
                  update_preferences(
                    build_theme_mode_update(preferences, opt.value),
                    true,
                  );
                }}
              >
                <span className="flex h-5 w-5 items-center justify-center text-[var(--text-muted)]">
                  {opt.icon}
                </span>
                <span className="flex-1 text-[15px] text-[var(--text-primary)]">
                  {opt.label}
                </span>
                {(theme_preference ??
                  get_effective_theme_fields(preferences).theme) ===
                  opt.value && (
                  <CheckIcon className="h-5 w-5 text-[var(--accent-color,#3b82f6)]" />
                )}
              </button>
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.language")}>
          <OptionList
            on_change={(v) => {
              update_preference("language", v, true);
              const entry = language_entries.find((l) => l.display === v);

              if (entry) set_language(entry.code as never);
            }}
            options={language_options}
            value={current_language_display}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.time_format")}>
          <OptionList
            on_change={(v) => update_preference("time_format", v, true)}
            options={time_format_options}
            value={preferences.time_format}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.date_format")}>
          <OptionList
            on_change={(v) => update_preference("date_format", v, true)}
            options={date_format_options}
            value={preferences.date_format}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.time_zone")}>
          <div className="px-4 py-3">
            <TimeZonePicker
              on_change={(v) => update_preference("time_zone", v, true)}
              use_24h={preferences.time_format === "24h"}
              value={time_zone_value}
            />
          </div>
        </SettingsGroup>
      </div>
    </div>
  );
}
