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
import { Switch } from "@aster/ui";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  OptionList,
} from "./shared";

import { use_preferences } from "@/contexts/preferences_context";
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

  const font_size_options: {
    value: "small" | "default" | "large" | "extra_large";
    label: string;
  }[] = [
    { value: "small", label: t("settings.font_size_small") },
    { value: "default", label: t("settings.font_size_default") },
    { value: "large", label: t("settings.font_size_large") },
    { value: "extra_large", label: t("settings.font_size_extra_large") },
  ];

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
          <OptionList
            on_change={(v) => update_preference("font_size_scale", v)}
            options={font_size_options}
            value={preferences.font_size_scale}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.vision")}>
          <SettingsRow
            label={t("settings.high_contrast")}
            trailing={
              <Switch
                checked={preferences.high_contrast}
                onCheckedChange={(v) => update_preference("high_contrast", v)}
              />
            }
          />
          <SettingsRow
            label={t("settings.reduce_transparency")}
            trailing={
              <Switch
                checked={preferences.reduce_transparency}
                onCheckedChange={(v) =>
                  update_preference("reduce_transparency", v)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.underline_links")}
            trailing={
              <Switch
                checked={preferences.link_underlines}
                onCheckedChange={(v) => update_preference("link_underlines", v)}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.color_vision")}>
          <OptionList
            on_change={(v) => update_preference("color_vision_mode", v)}
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
                onCheckedChange={(v) => update_preference("dyslexia_font", v)}
              />
            }
          />
          <SettingsRow
            label={t("settings.text_spacing")}
            trailing={
              <Switch
                checked={preferences.text_spacing}
                onCheckedChange={(v) => update_preference("text_spacing", v)}
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
                onCheckedChange={(v) => update_preference("reduce_motion", v)}
              />
            }
          />
          <SettingsRow
            label={t("settings.compact_mode")}
            trailing={
              <Switch
                checked={preferences.compact_mode}
                onCheckedChange={(v) => update_preference("compact_mode", v)}
              />
            }
          />
        </SettingsGroup>
      </div>
    </div>
  );
}
