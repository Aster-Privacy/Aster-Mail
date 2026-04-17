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

import { SunIcon, MoonIcon, CheckIcon } from "@heroicons/react/24/outline";

import { SettingsGroup, SettingsHeader, OptionList } from "./shared";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { get_display_name as _get_display_name } from "@/lib/i18n/languages";
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
  const { preferences, update_preference } = use_preferences();
  const { set_language } = use_i18n();

  const theme_options: {
    value: "light" | "dark";
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
  ];

  const time_format_options: { value: "12h" | "24h"; label: string }[] = [
    { value: "12h", label: "12-hour (1:30 PM)" },
    { value: "24h", label: "24-hour (13:30)" },
  ];

  const date_format_options: { value: string; label: string }[] = [
    { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
    { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
    { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  ];

  const language_entries: { code: LanguageCode; display: string }[] = [
    { code: "en", display: get_display_name("en") },
    { code: "es", display: get_display_name("es") },
    { code: "fr", display: get_display_name("fr") },
    { code: "de", display: get_display_name("de") },
    { code: "pt", display: get_display_name("pt") },
    { code: "ja", display: get_display_name("ja") },
    { code: "ko", display: get_display_name("ko") },
    { code: "zh-CN", display: get_display_name("zh-CN" as LanguageCode) },
    { code: "ar", display: get_display_name("ar") },
  ];

  const language_options = language_entries.map((l) => ({
    value: l.display,
    label: l.display,
  }));

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
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)]"
                type="button"
                onClick={() => {
                  set_theme_preference(opt.value);
                  update_preference("theme", opt.value);
                }}
              >
                <span className="flex h-5 w-5 items-center justify-center text-[var(--text-muted)]">
                  {opt.icon}
                </span>
                <span className="flex-1 text-[15px] text-[var(--text-primary)]">
                  {opt.label}
                </span>
                {(theme_preference ?? preferences.theme) === opt.value && (
                  <CheckIcon className="h-5 w-5 text-[var(--accent-color,#3b82f6)]" />
                )}
              </button>
            ))}
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.language")}>
          <OptionList
            on_change={(v) => {
              update_preference("language", v);
              const entry = language_entries.find((l) => l.display === v);

              if (entry) set_language(entry.code as never);
            }}
            options={language_options}
            value={preferences.language}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.time_format")}>
          <OptionList
            on_change={(v) => update_preference("time_format", v)}
            options={time_format_options}
            value={preferences.time_format}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.date_format")}>
          <OptionList
            on_change={(v) => update_preference("date_format", v)}
            options={date_format_options}
            value={preferences.date_format}
          />
        </SettingsGroup>
      </div>
    </div>
  );
}
