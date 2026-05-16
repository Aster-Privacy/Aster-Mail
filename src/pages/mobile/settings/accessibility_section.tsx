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
import { useEffect, useState } from "react";
import { Switch } from "@aster/ui";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  OptionList,
} from "./shared";

import {
  use_preferences,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_DEFAULT,
} from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";

export function AccessibilitySection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const font_size = preferences.font_size_scale;
  const [font_size_input, set_font_size_input] = useState<string>(
    String(font_size),
  );

  useEffect(() => {
    set_font_size_input(String(font_size));
  }, [font_size]);

  const clamp_font_size = (n: number) =>
    Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(n)));

  const commit_font_size = (n: number) => {
    update_preference("font_size_scale", clamp_font_size(n), true);
  };

  const color_vision_options: {
    value:
      | "none"
      | "protanopia"
      | "deuteranopia"
      | "tritanopia"
      | "achromatopsia";
    label: string;
  }[] = [
    { value: "none", label: t("settings.colorblind_none") },
    { value: "protanopia", label: t("settings.colorblind_protanopia") },
    { value: "deuteranopia", label: t("settings.colorblind_deuteranopia") },
    { value: "tritanopia", label: t("settings.colorblind_tritanopia") },
    { value: "achromatopsia", label: t("settings.colorblind_achromatopsia") },
  ];

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.accessibility")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <SettingsGroup title={t("settings.font_size")}>
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <input
                aria-label={t("settings.font_size")}
                className="flex-1 accent-[var(--accent-color)]"
                max={FONT_SIZE_MAX}
                min={FONT_SIZE_MIN}
                step={1}
                type="range"
                value={font_size}
                onChange={(e) => commit_font_size(Number(e.target.value))}
              />
              <input
                aria-label={t("settings.font_size")}
                className="w-16 h-9 px-2 rounded-md border bg-surf-secondary border-edge-secondary text-sm text-txt-primary text-center focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                inputMode="numeric"
                maxLength={3}
                type="text"
                value={font_size_input}
                onBlur={() => {
                  const trimmed = font_size_input.trim();

                  if (trimmed === "") {
                    set_font_size_input(String(font_size));

                    return;
                  }
                  const parsed = Number(trimmed);

                  if (!Number.isFinite(parsed)) {
                    set_font_size_input(String(font_size));

                    return;
                  }
                  commit_font_size(parsed);
                }}
                onChange={(e) => set_font_size_input(e.target.value)}
              />
              <span className="text-xs text-txt-muted">px</span>
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-txt-muted">
              <span>{FONT_SIZE_MIN}px</span>
              <span>{FONT_SIZE_MAX}px</span>
            </div>
            <div className="mt-3 flex">
              <button
                className="px-3 py-1.5 rounded-[12px] text-sm font-medium text-white bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] transition-colors"
                type="button"
                onClick={() => commit_font_size(FONT_SIZE_DEFAULT)}
              >
                {t("settings.font_size_reset")}
              </button>
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.vision")}>
          <SettingsRow
            label={t("settings.high_contrast")}
            trailing={
              <Switch
                checked={preferences.high_contrast}
                onCheckedChange={(v) => update_preference("high_contrast", v, true)}
              />
            }
          />
          <SettingsRow
            label={t("settings.reduce_transparency")}
            trailing={
              <Switch
                checked={preferences.reduce_transparency}
                onCheckedChange={(v) =>
                  update_preference("reduce_transparency", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.underline_links")}
            trailing={
              <Switch
                checked={preferences.link_underlines}
                onCheckedChange={(v) => update_preference("link_underlines", v, true)}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.color_vision")}>
          <OptionList
            on_change={(v) => update_preference("color_vision_mode", v, true)}
            options={color_vision_options}
            value={preferences.color_vision_mode}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.reading")}>
          <SettingsRow
            label={t("settings.dyslexia_friendly_font")}
            trailing={
              <Switch
                checked={preferences.dyslexia_font}
                onCheckedChange={(v) => update_preference("dyslexia_font", v, true)}
              />
            }
          />
          <SettingsRow
            label={t("settings.text_spacing")}
            trailing={
              <Switch
                checked={preferences.text_spacing}
                onCheckedChange={(v) => update_preference("text_spacing", v, true)}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.motion_layout")}>
          <SettingsRow
            label={t("settings.reduce_motion")}
            trailing={
              <Switch
                checked={preferences.reduce_motion}
                onCheckedChange={(v) => update_preference("reduce_motion", v, true)}
              />
            }
          />
          <SettingsRow
            label={t("settings.compact_mode")}
            trailing={
              <Switch
                checked={preferences.compact_mode}
                onCheckedChange={(v) => update_preference("compact_mode", v, true)}
              />
            }
          />
        </SettingsGroup>
      </div>
    </div>
  );
}
