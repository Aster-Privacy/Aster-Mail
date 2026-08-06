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
import type { SettingsSection } from "@/components/settings/settings_content";
import type { ColorThemeName } from "@/components/settings/appearance/theme_mockups";

import { useEffect } from "react";
import { ArrowRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { resolve_list_density } from "@/lib/list_density";
import { useTheme } from "@/contexts/theme_context";
import {
  FONT_SIZE_DEFAULT,
  normalize_font_size_scale,
  use_preferences,
} from "@/contexts/preferences_context";

interface QuickSettingsPanelProps {
  is_open: boolean;
  on_close: () => void;
  on_open_full_settings: (section?: SettingsSection) => void;
}

const THUMB_LINE = "var(--text-muted)";

function ThumbLines({ count, gap }: { count: number; gap: string }) {
  return (
    <span className={`flex h-full w-full flex-col justify-center ${gap} p-2`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-[2.5px] w-full rounded-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      ))}
    </span>
  );
}

function ThumbSplit() {
  return (
    <span className="flex h-full w-full gap-1.5 p-2">
      <span className="flex w-[42%] flex-col justify-center gap-1">
        {Array.from({ length: 3 }, (_, i) => (
          <span
            key={i}
            className="h-[2.5px] w-full rounded-full"
            style={{
              backgroundColor:
                i === 0 ? "var(--accent-color, #3b82f6)" : THUMB_LINE,
              opacity: i === 0 ? 1 : 0.45,
            }}
          />
        ))}
      </span>
      <span
        className="flex-1 rounded-[3px]"
        style={{
          border: "1px solid var(--border-primary)",
          backgroundColor: "var(--bg-primary)",
        }}
      />
    </span>
  );
}

function ThumbPopup() {
  return (
    <span className="relative block h-full w-full">
      <ThumbLines count={4} gap="gap-[3px]" />
      <span
        className="absolute left-1/2 top-1/2 h-[58%] w-[60%] -translate-x-1/2 -translate-y-1/2 rounded-[3px]"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--accent-color, #3b82f6)",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.22)",
        }}
      />
    </span>
  );
}

function ThumbFullPage() {
  return (
    <span className="flex h-full w-full flex-col justify-center gap-[5px] p-2">
      <span
        className="h-[5px] w-[70%] rounded-[2px]"
        style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
      />
      {Array.from({ length: 2 }, (_, i) => (
        <span
          key={i}
          className="h-[2.5px] w-full rounded-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      ))}
    </span>
  );
}

function ThumbPaneBottom() {
  return (
    <span className="flex h-full w-full flex-col gap-1.5 p-2">
      <span className="flex flex-col gap-1">
        <span
          className="h-[2.5px] w-full rounded-full"
          style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
        />
        <span
          className="h-[2.5px] w-full rounded-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      </span>
      <span
        className="flex-1 rounded-[3px]"
        style={{
          border: "1px solid var(--border-primary)",
          backgroundColor: "var(--bg-primary)",
        }}
      />
    </span>
  );
}

function ThemeMini({ mode }: { mode: "light" | "dark" }) {
  const is_light = mode === "light";

  return (
    <span className="flex h-full w-full">
      <span
        className="h-full w-[26%]"
        style={{ backgroundColor: is_light ? "#e8eaed" : "#2a2c30" }}
      />
      <span
        className="flex h-full flex-1 flex-col justify-center gap-[4px] p-2"
        style={{ backgroundColor: is_light ? "#ffffff" : "#17181b" }}
      >
        {Array.from({ length: 3 }, (_, i) => (
          <span
            key={i}
            className="h-[2.5px] w-full rounded-full"
            style={{
              backgroundColor:
                i === 0
                  ? "var(--accent-color, #3b82f6)"
                  : is_light
                    ? "#c9cdd3"
                    : "#43474d",
            }}
          />
        ))}
      </span>
    </span>
  );
}

function RadioMark({ checked }: { checked: boolean }) {
  return (
    <span
      className="relative flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full transition-colors duration-150"
      style={{
        boxShadow: checked
          ? "inset 0 0 0 2px var(--accent-color, #3b82f6)"
          : "inset 0 0 0 2px var(--border-primary)",
      }}
    >
      {checked && (
        <span
          className="h-[9px] w-[9px] rounded-full"
          style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
        />
      )}
    </span>
  );
}

interface QuickOption {
  value: string;
  label: string;
  thumbnail?: React.ReactNode;
}

interface QuickSectionProps {
  title: string;
  options?: QuickOption[];
  value?: string;
  on_change?: (value: string) => void;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

function QuickSection({
  title,
  options,
  value,
  on_change,
  action,
  children,
}: QuickSectionProps) {
  return (
    <section
      className="px-4 py-3"
      style={{ borderTop: "1px solid var(--border-secondary)" }}
    >
      <header className="mb-1 flex min-h-[24px] items-center gap-2 px-1">
        <h3 className="flex-1 truncate text-[14px] text-txt-primary">
          {title}
        </h3>
        {action}
      </header>

      {options && (
        <div aria-label={title} role="radiogroup">
          {options.map((option) => {
            const is_selected = option.value === value;

            return (
              <button
                key={option.value}
                aria-checked={is_selected}
                className="quick_settings_row flex w-full items-center gap-3 rounded-[8px] px-1 py-[5px] text-left"
                role="radio"
                type="button"
                onClick={() => on_change?.(option.value)}
              >
                <RadioMark checked={is_selected} />
                <span
                  className="min-w-0 flex-1 truncate text-[14px] leading-snug"
                  style={{
                    color: is_selected
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  }}
                >
                  {option.label}
                </span>
                {option.thumbnail && (
                  <span
                    className="block h-[40px] w-[72px] flex-shrink-0 overflow-hidden rounded-[4px] transition-shadow duration-150"
                    style={{
                      backgroundColor: "var(--bg-primary)",
                      boxShadow: is_selected
                        ? "0 0 0 2px var(--accent-color, #3b82f6)"
                        : "0 0 0 1px var(--border-secondary)",
                    }}
                  >
                    {option.thumbnail}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {children}
    </section>
  );
}

function QuickToggle({
  label,
  checked,
  on_change,
}: {
  label: string;
  checked: boolean;
  on_change: (next: boolean) => void;
}) {
  return (
    <button
      className="quick_settings_row flex min-h-[36px] w-full items-center gap-3 rounded-[8px] px-1 text-left"
      type="button"
      onClick={() => on_change(!checked)}
    >
      <span className="min-w-0 flex-1 truncate text-[14px] text-txt-secondary">
        {label}
      </span>
      <Switch checked={checked} size="sm" onCheckedChange={on_change} />
    </button>
  );
}

function QuickChips({
  options,
  value,
  on_change,
}: {
  options: { value: string; label: string }[];
  value: string;
  on_change: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
      {options.map((option) => {
        const is_selected = option.value === value;

        return (
          <button
            key={option.value}
            aria-pressed={is_selected}
            className="quick_settings_chip rounded-full px-3 py-[5px] text-[13px] transition-colors"
            style={{
              backgroundColor: is_selected
                ? "color-mix(in srgb, var(--accent-color, #3b82f6) 16%, transparent)"
                : "transparent",
              boxShadow: is_selected
                ? "inset 0 0 0 1px color-mix(in srgb, var(--accent-color, #3b82f6) 45%, transparent)"
                : "inset 0 0 0 1px var(--border-secondary)",
              color: is_selected
                ? "var(--accent-color, #3b82f6)"
                : "var(--text-secondary)",
            }}
            type="button"
            onClick={() => on_change(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const COLOR_THEME_SWATCHES: { value: ColorThemeName; color: string }[] = [
  { value: "aster-blue", color: "#3b82f6" },
  { value: "purple", color: "#a855f7" },
  { value: "indigo", color: "#6366f1" },
  { value: "cyan", color: "#068fd4" },
  { value: "teal", color: "#14b88a" },
  { value: "emerald", color: "#31d926" },
  { value: "green", color: "#22c55e" },
  { value: "lime", color: "#84cc16" },
  { value: "amber", color: "#f5be0b" },
  { value: "orange", color: "#f97316" },
  { value: "rose", color: "#f43f5e" },
  { value: "pink", color: "#e0399d" },
  { value: "fuchsia", color: "#cd1fd6" },
  { value: "slate", color: "#64748b" },
  { value: "black", color: "#d4d4d8" },
];

function ColorSwatches({
  value,
  on_change,
  label_for,
}: {
  value: string;
  on_change: (next: ColorThemeName) => void;
  label_for: (name: ColorThemeName) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-1 pt-1.5">
      {COLOR_THEME_SWATCHES.map((swatch) => {
        const is_selected = swatch.value === value;
        const label = label_for(swatch.value);

        return (
          <button
            key={swatch.value}
            aria-label={label}
            aria-pressed={is_selected}
            className="quick_settings_chip h-[22px] w-[22px] rounded-full transition-transform duration-150 hover:scale-110"
            style={{
              backgroundColor: swatch.color,
              boxShadow: is_selected
                ? "0 0 0 2px var(--bg-primary), 0 0 0 4px var(--text-primary)"
                : "none",
            }}
            title={label}
            type="button"
            onClick={() => on_change(swatch.value)}
          />
        );
      })}
    </div>
  );
}

export function QuickSettingsPanel({
  is_open,
  on_close,
  on_open_full_settings,
}: QuickSettingsPanelProps) {
  const { t } = use_i18n();
  const { theme_preference, set_theme_preference } = useTheme();
  const { preferences, update_preference } = use_preferences();

  const is_default_color = (preferences.color_theme ?? "default") === "default";

  const handle_theme_select = (mode: "light" | "dark") => {
    set_theme_preference(mode);
    update_preference("theme", mode, true);
    update_preference("color_theme", "default", true);
  };

  const handle_color_theme_select = (name: ColorThemeName) => {
    set_theme_preference("dark");
    update_preference("theme", "dark", true);
    update_preference("color_theme", name, true);
  };

  const font_size = normalize_font_size_scale(preferences.font_size_scale);
  const font_size_buckets = [14, FONT_SIZE_DEFAULT, 17, 19];
  const active_font_size = font_size_buckets.reduce((best, candidate) =>
    Math.abs(candidate - font_size) < Math.abs(best - font_size)
      ? candidate
      : best,
  );

  useEffect(() => {
    if (!is_open) return;
    const handle_key = (e: KeyboardEvent) => {
      if (e.key === "Escape") on_close();
    };

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [is_open, on_close]);

  if (!is_open) return null;

  const active_theme = is_default_color ? theme_preference : "";

  return (
    <aside className="quick_settings_panel ml-1 hidden h-full w-[clamp(272px,26vw,352px)] flex-shrink-0 flex-col overflow-hidden rounded-lg bg-surf-primary md:ml-2 md:rounded-xl lg:flex">
      <div className="flex min-h-[56px] flex-shrink-0 items-center gap-3 px-4">
        <h2 className="flex-1 truncate text-[16px] font-medium text-txt-primary">
          {t("settings.quick_settings")}
        </h2>
        <Button
          aria-label={t("common.close")}
          className="h-7 w-7 text-[var(--icon-muted)]"
          size="icon"
          variant="ghost"
          onClick={on_close}
        >
          <XMarkIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="aster_scrollbar_thin flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="px-4 pb-3.5">
          <button
            className="quick_settings_all group flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-[9px] text-[13.5px] font-medium transition-colors"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--accent-color, #3b82f6) 12%, transparent)",
              color: "var(--accent-color, #3b82f6)",
            }}
            type="button"
            onClick={() => on_open_full_settings()}
          >
            {t("settings.see_all_settings")}
            <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>

        <QuickSection
          options={[
            {
              value: "comfortable",
              label: t("settings.density_comfortable"),
              thumbnail: <ThumbLines count={3} gap="gap-[7px]" />,
            },
            {
              value: "compact",
              label: t("settings.density_compact"),
              thumbnail: <ThumbLines count={5} gap="gap-[3px]" />,
            },
          ]}
          title={t("settings.density")}
          value={resolve_list_density(preferences.mail_list_density)}
          on_change={(v) => update_preference("mail_list_density", v, true)}
        />

        <QuickSection
          action={
            <button
              className="flex-shrink-0 text-[13px] outline-none focus-visible:outline-none"
              style={{ color: "var(--accent-color, #3b82f6)" }}
              type="button"
              onClick={() => on_open_full_settings("appearance")}
            >
              {t("settings.quick_more_appearance")}
            </button>
          }
          options={[
            {
              value: "light",
              label: t("settings.theme_light"),
              thumbnail: <ThemeMini mode="light" />,
            },
            {
              value: "dark",
              label: t("settings.theme_dark"),
              thumbnail: <ThemeMini mode="dark" />,
            },
          ]}
          title={t("settings.theme")}
          value={active_theme}
          on_change={(v) => handle_theme_select(v as "light" | "dark")}
        >
          <ColorSwatches
            label_for={(name) =>
              t(`settings.color_theme_${name.replace("-", "_")}` as never)
            }
            value={preferences.color_theme ?? "default"}
            on_change={handle_color_theme_select}
          />
        </QuickSection>

        <QuickSection title={t("settings.font_size")}>
          <QuickChips
            options={[
              { value: "14", label: t("settings.font_size_small") },
              {
                value: String(FONT_SIZE_DEFAULT),
                label: t("settings.font_size_default"),
              },
              { value: "17", label: t("settings.font_size_large") },
              { value: "19", label: t("settings.font_size_extra_large") },
            ]}
            value={String(active_font_size)}
            on_change={(v) =>
              update_preference("font_size_scale", Number(v), true)
            }
          />
        </QuickSection>

        <QuickSection
          options={[
            {
              value: "split",
              label: t("settings.split_view"),
              thumbnail: <ThumbSplit />,
            },
            {
              value: "popup",
              label: t("settings.popup"),
              thumbnail: <ThumbPopup />,
            },
            {
              value: "fullpage",
              label: t("settings.full_page"),
              thumbnail: <ThumbFullPage />,
            },
          ]}
          title={t("settings.email_view_mode")}
          value={preferences.email_view_mode}
          on_change={(v) =>
            update_preference(
              "email_view_mode",
              v as "popup" | "split" | "fullpage",
              true,
            )
          }
        />

        <QuickSection
          options={[
            {
              value: "right",
              label: t("settings.right_side"),
              thumbnail: <ThumbSplit />,
            },
            {
              value: "bottom",
              label: t("settings.bottom"),
              thumbnail: <ThumbPaneBottom />,
            },
            {
              value: "hidden",
              label: t("settings.hidden_click_to_open"),
              thumbnail: <ThumbLines count={4} gap="gap-[3px]" />,
            },
          ]}
          title={t("settings.reading_pane_position")}
          value={preferences.reading_pane_position}
          on_change={(v) =>
            update_preference(
              "reading_pane_position",
              v as "right" | "bottom" | "hidden",
              true,
            )
          }
        />

        <QuickSection
          options={[
            { value: "newest_first", label: t("settings.newest_first") },
            { value: "oldest_first", label: t("settings.oldest_first") },
          ]}
          title={t("mail.sort_by")}
          value={preferences.inbox_sort_order ?? "newest_first"}
          on_change={(v) =>
            update_preference(
              "inbox_sort_order",
              v as "newest_first" | "oldest_first",
              true,
            )
          }
        />

        <QuickSection
          options={[
            { value: "asc", label: t("settings.oldest_first") },
            { value: "desc", label: t("settings.newest_first") },
          ]}
          title={t("settings.conversation_order")}
          value={preferences.conversation_order ?? "asc"}
          on_change={(v) =>
            update_preference("conversation_order", v as "asc" | "desc", true)
          }
        />

        <QuickSection
          options={[
            {
              value: "Go to next message",
              label: t("settings.auto_advance_next"),
            },
            {
              value: "Go to previous message",
              label: t("settings.auto_advance_previous"),
            },
            {
              value: "Go back to message list",
              label: t("settings.auto_advance_back"),
            },
          ]}
          title={t("settings.auto_advance")}
          value={preferences.auto_advance}
          on_change={(v) => update_preference("auto_advance", v, true)}
        />

        <QuickSection title={t("settings.quick_inbox_list")}>
          <QuickToggle
            checked={preferences.conversation_grouping ?? true}
            label={t("settings.conversation_grouping")}
            on_change={(next) =>
              update_preference("conversation_grouping", next, true)
            }
          />
          <QuickToggle
            checked={preferences.inbox_categories_enabled !== false}
            label={t("settings.inbox_categories")}
            on_change={(next) =>
              update_preference("inbox_categories_enabled", next, true)
            }
          />
          <QuickToggle
            checked={preferences.show_profile_pictures ?? true}
            label={t("settings.quick_sender_pictures")}
            on_change={(next) =>
              update_preference("show_profile_pictures", next, true)
            }
          />
          <QuickToggle
            checked={preferences.show_email_preview ?? true}
            label={t("settings.quick_preview_text")}
            on_change={(next) =>
              update_preference("show_email_preview", next, true)
            }
          />
          <QuickToggle
            checked={preferences.show_message_size ?? false}
            label={t("settings.show_message_size")}
            on_change={(next) =>
              update_preference("show_message_size", next, true)
            }
          />
        </QuickSection>

        <QuickSection title={t("settings.behavior_shortcuts")}>
          <QuickToggle
            checked={preferences.keyboard_shortcuts_enabled ?? true}
            label={t("common.keyboard_shortcuts")}
            on_change={(next) =>
              update_preference("keyboard_shortcuts_enabled", next, true)
            }
          />
          <QuickToggle
            checked={preferences.undo_send_enabled ?? true}
            label={t("settings.undo_send")}
            on_change={(next) =>
              update_preference("undo_send_enabled", next, true)
            }
          />
          <QuickToggle
            checked={preferences.reduce_motion ?? false}
            label={t("settings.reduce_motion")}
            on_change={(next) => update_preference("reduce_motion", next, true)}
          />
        </QuickSection>

        <div className="h-3 flex-shrink-0" />
      </div>
    </aside>
  );
}
