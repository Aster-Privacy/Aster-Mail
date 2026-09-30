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
import {
  IslandRow,
  IslandSection,
  IslandSections,
  PillButton,
} from "@aster/ui";
import {
  ArrowUturnLeftIcon,
  AtSymbolIcon,
  PaintBrushIcon,
} from "@heroicons/react/24/outline";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_register_search_items } from "@/components/settings/search_context";
import { ColorSwatchPicker } from "@/components/settings/appearance/color_swatch_picker";
import { DefaultSenderSetting } from "@/components/settings/default_sender_setting";
import {
  SelectSetting,
  ToggleSetting,
} from "@/components/settings/behavior_section/shared";
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
  const reply_breadcrumb = `${t("settings.compose")} > ${t("settings.reply_defaults_title")}`;

  use_register_search_items("compose", [
    {
      label: t("settings.default_sender_title"),
      breadcrumb: `${t("settings.compose")} > ${t("settings.default_sender_group")}`,
      keywords: [
        "default sender",
        "from address",
        "send as",
        "alias",
        "identity",
      ],
    },
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
    {
      label: t("settings.reply_include_quoted"),
      breadcrumb: reply_breadcrumb,
      keywords: ["reply", "quote", "quoted text", "original message"],
    },
    {
      label: t("settings.reply_prefix_subject"),
      breadcrumb: reply_breadcrumb,
      keywords: ["reply", "subject", "prefix", "re"],
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
    <IslandSections>
      <IslandSection
        description={t("settings.default_sender_group_description")}
        icon={<AtSymbolIcon />}
        title={t("settings.default_sender_group")}
      >
        <DefaultSenderSetting />
      </IslandSection>

      <IslandSection
        description={t("settings.compose_defaults_description")}
        icon={<PaintBrushIcon />}
        title={t("settings.compose_defaults_title")}
      >
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

        <IslandRow
          description={t("settings.compose_default_font_color_description")}
          label={t("settings.compose_default_font_color")}
          layout="stacked"
          trailing={
            <div className="flex flex-wrap items-center gap-3">
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
              <PillButton
                disabled={!has_font_color}
                size="sm"
                variant="neutral"
                onClick={() => commit_font_color(DEFAULT_COMPOSE_FONT_COLOR)}
              >
                {t("settings.compose_default_font_color_reset")}
              </PillButton>
            </div>
          }
        />
      </IslandSection>

      <IslandSection
        description={t("settings.reply_defaults_description")}
        icon={<ArrowUturnLeftIcon />}
        title={t("settings.reply_defaults_title")}
      >
        <ToggleSetting
          description={t("settings.reply_include_quoted_description")}
          enabled={preferences.reply_include_quoted}
          on_toggle={() =>
            update_preference(
              "reply_include_quoted",
              !preferences.reply_include_quoted,
              true,
            )
          }
          title={t("settings.reply_include_quoted")}
        />

        <ToggleSetting
          description={t("settings.reply_prefix_subject_description")}
          enabled={preferences.reply_prefix_subject}
          on_toggle={() =>
            update_preference(
              "reply_prefix_subject",
              !preferences.reply_prefix_subject,
              true,
            )
          }
          title={t("settings.reply_prefix_subject")}
        />
      </IslandSection>
    </IslandSections>
  );
}
