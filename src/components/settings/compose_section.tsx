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
import { PaintBrushIcon } from "@heroicons/react/24/outline";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_register_search_items } from "@/components/settings/search_context";
import { ColorSwatchPicker } from "@/components/settings/appearance/color_swatch_picker";
import { SelectSetting } from "@/components/settings/behavior_section/shared";
import { FONT_SIZE_OPTIONS } from "@/components/compose/compose_toolbar/shared";
import {
  DEFAULT_COMPOSE_FONT_COLOR,
  normalize_compose_font_color,
  normalize_compose_font_size,
} from "@/lib/compose_defaults";

const COLOR_SWATCH_PLACEHOLDER = "#3b82f6";

export function ComposeSection() {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const breadcrumb = `${t("settings.compose")} > ${t("settings.compose_defaults_title")}`;

  use_register_search_items("compose", [
    {
      label: t("settings.compose_default_font_size"),
      breadcrumb,
      keywords: ["font size", "text size", "compose", "default font"],
    },
    {
      label: t("settings.compose_default_font_color"),
      breadcrumb,
      keywords: ["font color", "text color", "compose", "default color"],
    },
  ]);

  const font_size = normalize_compose_font_size(preferences.compose_font_size);
  const font_color = normalize_compose_font_color(
    preferences.compose_font_color,
  );
  const has_font_color = font_color !== DEFAULT_COMPOSE_FONT_COLOR;

  const expand_short_hex = (value: string) => {
    const trimmed = value.trim();
    const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);

    return short
      ? `#${short[1]
          .split("")
          .map((c) => c + c)
          .join("")}`
      : trimmed;
  };

  const commit_font_color = (value: string) => {
    const expanded = expand_short_hex(value);
    const normalized = normalize_compose_font_color(expanded);

    if (
      normalized === DEFAULT_COMPOSE_FONT_COLOR &&
      expanded !== DEFAULT_COMPOSE_FONT_COLOR
    ) {
      return;
    }

    update_preference("compose_font_color", normalized, true);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PaintBrushIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.compose_defaults_title")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-1 text-txt-muted">
          {t("settings.compose_defaults_description")}
        </p>

        <SelectSetting
          description={t("settings.compose_default_font_size_description")}
          on_change={(value) =>
            update_preference(
              "compose_font_size",
              normalize_compose_font_size(value),
              true,
            )
          }
          options={FONT_SIZE_OPTIONS.map((option) => ({
            value: option.value,
            label: t(option.label_key),
          }))}
          title={t("settings.compose_default_font_size")}
          value={font_size}
        />

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.compose_default_font_color")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.compose_default_font_color_description")}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <span className="text-xs font-mono text-txt-muted">
              {has_font_color
                ? font_color
                : t("settings.compose_default_font_color_theme")}
            </span>
            <ColorSwatchPicker
              label={t("settings.compose_default_font_color_picker_label")}
              size="sm"
              value={has_font_color ? font_color : COLOR_SWATCH_PLACEHOLDER}
              onChange={commit_font_color}
            />
            <button
              className="px-3 py-1.5 rounded-[12px] text-sm font-medium border border-edge-secondary text-txt-primary transition-colors hover:bg-surf-hover disabled:opacity-50"
              disabled={!has_font_color}
              type="button"
              onClick={() => commit_font_color(DEFAULT_COMPOSE_FONT_COLOR)}
            >
              {t("settings.compose_default_font_color_reset")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
