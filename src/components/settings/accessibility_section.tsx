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
import {
  IslandRow,
  IslandSection,
  IslandSections,
  PillButton,
  SettingToggleRow,
} from "@aster/ui";
import {
  AdjustmentsHorizontalIcon,
  EyeIcon,
  DocumentTextIcon,
  Square2StackIcon,
  CommandLineIcon,
  WifiIcon,
} from "@heroicons/react/24/outline";

import { InfoPopover } from "@/components/ui/info_popover";
import { Slider } from "@/components/ui/slider";
import { KeyboardShortcutsModal } from "@/components/modals/keyboard_shortcuts_modal";
import {
  use_preferences,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_DEFAULT,
} from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { is_composing } from "@/utils/ime";

export function AccessibilitySection() {
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

  const commit_font_size = (n: number, immediate = true) => {
    const v = clamp_font_size(n);

    set_font_size_input(String(v));
    update_preference("font_size_scale", v, immediate);
  };

  const [shortcuts_modal_open, set_shortcuts_modal_open] = useState(false);

  return (
    <IslandSections>
      <IslandSection
        description={t("settings.font_size_description")}
        icon={<AdjustmentsHorizontalIcon />}
        padding="md"
        title={t("settings.font_size")}
      >
        <div className="flex items-center gap-4">
          <Slider
            ariaLabel={t("settings.font_size")}
            className="flex-1"
            format_tooltip={(v) => `${v}px`}
            max={FONT_SIZE_MAX}
            min={FONT_SIZE_MIN}
            value={font_size}
            onChange={(v) => commit_font_size(v, false)}
          />
          <div className="flex items-center gap-2">
            <input
              aria-label={t("settings.font_size")}
              className="w-16 h-9 px-2 rounded-[var(--aster-radius-control)] border bg-surf-secondary border-edge-secondary text-sm text-txt-primary text-center focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && !is_composing(e)) {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <span className="text-xs text-txt-muted">px</span>
          </div>
        </div>
        <div className="flex justify-between items-center mt-2">
          <div className="flex justify-between flex-1 text-[10px] text-txt-muted">
            <span>{FONT_SIZE_MIN}px</span>
            <span>{FONT_SIZE_MAX}px</span>
          </div>
        </div>
        <div className="mt-3 flex">
          <PillButton
            size="sm"
            onClick={() => commit_font_size(FONT_SIZE_DEFAULT)}
          >
            {t("settings.font_size_reset")}
          </PillButton>
        </div>
      </IslandSection>

      <IslandSection
        description={t("settings.vision_description")}
        icon={<EyeIcon />}
        title={t("settings.vision")}
      >
        <SettingToggleRow
          checked={preferences.high_contrast}
          description={t("settings.high_contrast_description")}
          label={t("settings.high_contrast")}
          on_change={(v) => update_preference("high_contrast", v, true)}
        />
        <SettingToggleRow
          checked={preferences.reduce_transparency}
          description={t("settings.reduce_transparency_description")}
          label={t("settings.reduce_transparency")}
          on_change={(v) => update_preference("reduce_transparency", v, true)}
        />
        <SettingToggleRow
          checked={preferences.link_underlines}
          description={t("settings.underline_links_description")}
          label={t("settings.underline_links")}
          on_change={(v) => update_preference("link_underlines", v, true)}
        />
      </IslandSection>

      <IslandSection
        description={t("settings.reading_description")}
        icon={<DocumentTextIcon />}
        title={t("settings.reading")}
      >
        <SettingToggleRow
          checked={preferences.dyslexia_font}
          description={t("settings.dyslexia_friendly_font_description")}
          label={t("settings.dyslexia_friendly_font")}
          on_change={(v) => update_preference("dyslexia_font", v, true)}
        />
        <SettingToggleRow
          checked={preferences.text_spacing}
          description={t("settings.text_spacing_description")}
          label={t("settings.text_spacing")}
          on_change={(v) => update_preference("text_spacing", v, true)}
        />
      </IslandSection>

      <IslandSection
        description={t("settings.motion_layout_description")}
        icon={<Square2StackIcon />}
        title={t("settings.motion_layout")}
      >
        <SettingToggleRow
          checked={preferences.reduce_motion}
          description={t("settings.reduce_motion_description")}
          label={t("settings.reduce_motion")}
          on_change={(v) => update_preference("reduce_motion", v, true)}
        />
        <SettingToggleRow
          checked={preferences.compact_mode}
          description={t("settings.compact_mode_description")}
          label={t("settings.compact_mode")}
          on_change={(v) => update_preference("compact_mode", v, true)}
        />
      </IslandSection>

      <IslandSection
        description={t("settings.keyboard_shortcuts_description")}
        icon={<CommandLineIcon />}
        title={t("common.keyboard_shortcuts")}
      >
        <IslandRow
          description={t("settings.enable_shortcuts_description")}
          label={t("common.enable_shortcuts")}
          toggle={{
            checked: preferences.keyboard_shortcuts_enabled,
            on_change: (v) =>
              update_preference("keyboard_shortcuts_enabled", v, true),
            size: "lg",
            aria_label: t("common.enable_shortcuts"),
          }}
          trailing={
            <button
              aria-label={t("mail.view_keyboard_shortcuts")}
              className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded bg-surf-tertiary px-1.5 font-mono text-[11px] font-medium text-txt-muted transition-colors hover:bg-surf-tertiary/80"
              type="button"
              onClick={() => set_shortcuts_modal_open(true)}
            >
              ?
            </button>
          }
        />
      </IslandSection>

      <IslandSection
        icon={<WifiIcon />}
        title={t("settings.low_network_mode_section_title")}
      >
        <SettingToggleRow
          checked={preferences.low_network_mode}
          description={t("settings.low_network_mode_description")}
          info={
            <InfoPopover
              description={t("settings.info_low_network_mode_description")}
              title={t("settings.info_low_network_mode_title")}
            />
          }
          label={t("settings.low_network_mode_label")}
          on_change={(v) => update_preference("low_network_mode", v, true)}
        />
      </IslandSection>

      <KeyboardShortcutsModal
        is_open={shortcuts_modal_open}
        on_close={() => set_shortcuts_modal_open(false)}
      />
    </IslandSections>
  );
}
