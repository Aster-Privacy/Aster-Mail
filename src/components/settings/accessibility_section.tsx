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
import type { UserPreferences } from "@/services/api/preferences";

import { useEffect, useMemo, useState } from "react";
import { Switch } from "@aster/ui";
import {
  AdjustmentsHorizontalIcon,
  EyeIcon,
  SwatchIcon,
  DocumentTextIcon,
  Square2StackIcon,
  CommandLineIcon,
} from "@heroicons/react/24/outline";

import { KeyboardShortcutsModal } from "@/components/modals/keyboard_shortcuts_modal";
import {
  use_preferences,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_DEFAULT,
} from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";

type ColorVisionMode = UserPreferences["color_vision_mode"];

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary">{label}</p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

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

  const commit_font_size = (n: number) => {
    const v = clamp_font_size(n);

    update_preference("font_size_scale", v, true);
  };

  const color_vision_options = useMemo(
    (): { id: ColorVisionMode; label: string; swatches: string[] }[] => [
      {
        id: "none",
        label: t("settings.colorblind_none"),
        swatches: ["#ef4444", "#22c55e", "#3b82f6"],
      },
      {
        id: "protanopia",
        label: t("settings.colorblind_protanopia"),
        swatches: ["#886622", "#aa9944", "#3b82f6"],
      },
      {
        id: "deuteranopia",
        label: t("settings.colorblind_deuteranopia"),
        swatches: ["#aa8833", "#886622", "#3b82f6"],
      },
      {
        id: "tritanopia",
        label: t("settings.colorblind_tritanopia"),
        swatches: ["#ef4444", "#22c55e", "#cc6666"],
      },
      {
        id: "achromatopsia",
        label: t("settings.colorblind_achromatopsia"),
        swatches: ["#888888", "#aaaaaa", "#777777"],
      },
    ],
    [t],
  );

  const [shortcuts_modal_open, set_shortcuts_modal_open] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <AdjustmentsHorizontalIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.font_size")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-3 text-txt-muted">
          {t("settings.font_size_description")}
        </p>
        <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
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
          <button
            className="px-3 py-1.5 rounded-[12px] text-sm font-medium text-white bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] transition-colors"
            type="button"
            onClick={() => commit_font_size(FONT_SIZE_DEFAULT)}
          >
            {t("settings.font_size_reset")}
          </button>
        </div>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <EyeIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.vision")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-1 text-txt-muted">
          {t("settings.vision_description")}
        </p>
        <SettingRow
          description={t("settings.high_contrast_description")}
          label={t("settings.high_contrast")}
        >
          <Switch
            checked={preferences.high_contrast}
            onCheckedChange={(v) => update_preference("high_contrast", v, true)}
          />
        </SettingRow>
        <SettingRow
          description={t("settings.reduce_transparency_description")}
          label={t("settings.reduce_transparency")}
        >
          <Switch
            checked={preferences.reduce_transparency}
            onCheckedChange={(v) => update_preference("reduce_transparency", v, true)}
          />
        </SettingRow>
        <SettingRow
          description={t("settings.underline_links_description")}
          label={t("settings.underline_links")}
        >
          <Switch
            checked={preferences.link_underlines}
            onCheckedChange={(v) => update_preference("link_underlines", v, true)}
          />
        </SettingRow>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <SwatchIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.color_vision")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-3 text-txt-muted">
          {t("settings.color_vision_description")}
        </p>
        <div className="grid grid-cols-5 gap-2">
          {color_vision_options.map((option) => {
            const is_selected = preferences.color_vision_mode === option.id;

            return (
              <button
                key={option.id}
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-[16px] border-2 transition-colors"
                style={{
                  borderColor: is_selected
                    ? "var(--accent-color)"
                    : "var(--border-secondary)",
                  backgroundColor: is_selected
                    ? "var(--bg-selected)"
                    : "transparent",
                }}
                type="button"
                onClick={() =>
                  update_preference("color_vision_mode", option.id, true)
                }
              >
                <div className="flex gap-0.5">
                  {option.swatches.map((color, i) => (
                    <div
                      key={i}
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span
                  className="text-xs font-medium"
                  style={{
                    color: is_selected
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <DocumentTextIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.reading")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-1 text-txt-muted">
          {t("settings.reading_description")}
        </p>
        <SettingRow
          description={t("settings.dyslexia_friendly_font_description")}
          label={t("settings.dyslexia_friendly_font")}
        >
          <Switch
            checked={preferences.dyslexia_font}
            onCheckedChange={(v) => update_preference("dyslexia_font", v, true)}
          />
        </SettingRow>
        <SettingRow
          description={t("settings.text_spacing_description")}
          label={t("settings.text_spacing")}
        >
          <Switch
            checked={preferences.text_spacing}
            onCheckedChange={(v) => update_preference("text_spacing", v, true)}
          />
        </SettingRow>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <Square2StackIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.motion_layout")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-1 text-txt-muted">
          {t("settings.motion_layout_description")}
        </p>
        <SettingRow
          description={t("settings.reduce_motion_description")}
          label={t("settings.reduce_motion")}
        >
          <Switch
            checked={preferences.reduce_motion}
            onCheckedChange={(v) => update_preference("reduce_motion", v, true)}
          />
        </SettingRow>
        <SettingRow
          description={t("settings.compact_mode_description")}
          label={t("settings.compact_mode")}
        >
          <Switch
            checked={preferences.compact_mode}
            onCheckedChange={(v) => update_preference("compact_mode", v, true)}
          />
        </SettingRow>
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <CommandLineIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("common.keyboard_shortcuts")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>
        <p className="text-sm mb-1 text-txt-muted">
          {t("settings.keyboard_shortcuts_description")}
        </p>
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3 flex-1 pr-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-txt-primary">
                {t("common.enable_shortcuts")}
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.enable_shortcuts_description")}
              </p>
            </div>
            <button
              aria-label={t("mail.view_keyboard_shortcuts")}
              className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded font-mono font-medium text-[11px] cursor-pointer transition-colors hover:bg-surf-tertiary/80 bg-surf-tertiary text-txt-muted border border-edge-secondary shadow-[0_1px_0_var(--border-secondary)]"
              type="button"
              onClick={() => set_shortcuts_modal_open(true)}
            >
              ?
            </button>
          </div>
          <div className="flex-shrink-0">
            <Switch
              checked={preferences.keyboard_shortcuts_enabled}
              onCheckedChange={(v) =>
                update_preference("keyboard_shortcuts_enabled", v, true)
              }
            />
          </div>
        </div>
      </div>

      <KeyboardShortcutsModal
        is_open={shortcuts_modal_open}
        on_close={() => set_shortcuts_modal_open(false)}
      />
    </div>
  );
}
