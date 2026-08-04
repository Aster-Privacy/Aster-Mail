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

import { useEffect } from "react";
import { XMarkIcon, Cog6ToothIcon } from "@heroicons/react/24/outline";
import { Button, Radio } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";
import { resolve_list_density } from "@/lib/list_density";
import { useTheme } from "@/contexts/theme_context";
import { use_preferences } from "@/contexts/preferences_context";

interface QuickSettingsPanelProps {
  is_open: boolean;
  on_close: () => void;
  on_open_full_settings: (section?: SettingsSection) => void;
}

const THUMB_LINE = "var(--text-muted)";

function MiniThumb({
  is_selected,
  children,
}: {
  is_selected: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className="w-[58px] h-[38px] rounded-[6px] overflow-hidden flex-shrink-0 block transition-all duration-150"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: is_selected
          ? "1.5px solid var(--accent-color, #3b82f6)"
          : "1px solid var(--border-primary)",
        boxShadow: is_selected
          ? "0 0 0 2px color-mix(in srgb, var(--accent-color, #3b82f6) 18%, transparent)"
          : undefined,
      }}
    >
      {children}
    </span>
  );
}

function ThumbLines({ count, gap }: { count: number; gap: string }) {
  return (
    <span className={`flex flex-col ${gap} p-1.5 w-full h-full`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-[3px] rounded-full w-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      ))}
    </span>
  );
}

function ThumbSplit() {
  return (
    <span className="flex gap-1 p-1.5 w-full h-full">
      <span className="flex flex-col gap-1 w-[45%]">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="h-[3px] rounded-full w-full"
            style={{
              backgroundColor: i === 0 ? "var(--accent-color, #3b82f6)" : THUMB_LINE,
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
    <span className="relative block w-full h-full">
      <ThumbLines count={4} gap="gap-1" />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[62%] rounded-[3px]"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--accent-color, #3b82f6)",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
        }}
      />
    </span>
  );
}

function ThumbFullPage() {
  return (
    <span className="flex flex-col gap-1 p-1.5 w-full h-full">
      <span
        className="h-[5px] rounded-[2px] w-[70%]"
        style={{ backgroundColor: "var(--accent-color, #3b82f6)", opacity: 0.9 }}
      />
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className="h-[3px] rounded-full w-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      ))}
    </span>
  );
}

function ThumbPaneBottom() {
  return (
    <span className="flex flex-col gap-1 p-1.5 w-full h-full">
      <span className="flex flex-col gap-1 h-[45%]">
        <span className="h-[3px] rounded-full w-full" style={{ backgroundColor: "var(--accent-color, #3b82f6)" }} />
        <span className="h-[3px] rounded-full w-full" style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }} />
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

function ThumbComfortable() {
  return <ThumbLines count={3} gap="gap-[7px]" />;
}

function ThumbCompact() {
  return <ThumbLines count={5} gap="gap-[3px]" />;
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
        className="flex h-full flex-1 flex-col gap-[3px] p-1.5"
        style={{ backgroundColor: is_light ? "#ffffff" : "#17181b" }}
      >
        {Array.from({ length: 3 }, (_, i) => (
          <span
            key={i}
            className="h-[3px] w-full rounded-full"
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

function ThemeQuickCard({
  label,
  mode,
  is_selected,
  on_select,
}: {
  label: string;
  mode: "light" | "dark";
  is_selected: boolean;
  on_select: () => void;
}) {
  return (
    <button
      aria-checked={is_selected}
      className="flex-1 rounded-[12px] p-1.5 outline-none transition-all duration-150 focus:outline-none"
      role="radio"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: is_selected
          ? "1.5px solid var(--accent-color, #3b82f6)"
          : "1px solid var(--border-primary)",
        boxShadow: is_selected
          ? "0 0 0 2px color-mix(in srgb, var(--accent-color, #3b82f6) 18%, transparent)"
          : undefined,
      }}
      type="button"
      onClick={on_select}
    >
      <span className="block h-[50px] w-full overflow-hidden rounded-[8px]">
        <ThemeMini mode={mode} />
      </span>
      <span
        className={`mt-1.5 block text-[12px] ${is_selected ? "font-medium" : ""}`}
        style={{
          color: is_selected ? "var(--text-primary)" : "var(--text-secondary)",
        }}
      >
        {label}
      </span>
    </button>
  );
}

interface QuickRadioOption {
  value: string;
  label: string;
  thumbnail?: React.ReactNode;
}

interface QuickRadioGroupProps {
  options: QuickRadioOption[];
  value: string;
  on_change: (value: string) => void;
}

function QuickRadioGroup({ options, value, on_change }: QuickRadioGroupProps) {
  return (
    <div className="flex flex-col" role="radiogroup">
      {options.map((option) => {
        const is_selected = option.value === value;

        return (
          <button
            key={option.value}
            aria-checked={is_selected}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-[10px] text-[13px] transition-colors duration-150 outline-none focus:outline-none hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
            role="radio"
            style={{
              color: is_selected
                ? "var(--text-primary)"
                : "var(--text-secondary)",
            }}
            type="button"
            onClick={() => on_change(option.value)}
          >
            <span className="pointer-events-none flex-shrink-0">
              <Radio readOnly checked={is_selected} />
            </span>
            <span
              className={`truncate flex-1 text-left ${is_selected ? "font-medium" : ""}`}
            >
              {option.label}
            </span>
            {option.thumbnail && (
              <MiniThumb is_selected={is_selected}>{option.thumbnail}</MiniThumb>
            )}
          </button>
        );
      })}
    </div>
  );
}

function QuickGroup({
  title,
  on_more,
  more_label,
  children,
}: {
  title: string;
  on_more?: () => void;
  more_label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-3 mt-3 border-t border-t-edge-secondary">
      <div className="flex items-center justify-between px-2.5 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-txt-muted">
          {title}
        </span>
        {on_more && more_label && (
          <button
            className="text-[11px] text-txt-muted hover:text-txt-primary transition-colors outline-none focus:outline-none"
            type="button"
            onClick={on_more}
          >
            {more_label}
          </button>
        )}
      </div>
      {children}
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

  useEffect(() => {
    if (!is_open) return;
    const handle_key = (e: KeyboardEvent) => {
      if (e.key === "Escape") on_close();
    };

    document.addEventListener("keydown", handle_key);

    return () => document.removeEventListener("keydown", handle_key);
  }, [is_open, on_close]);

  if (!is_open) return null;

  return (
    <aside
      className="hidden lg:flex flex-col absolute top-0 right-0 bottom-0 w-[300px] z-40 overflow-hidden rounded-r-lg md:rounded-r-xl"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderLeft: "1px solid var(--border-secondary)",
        boxShadow: "-8px 0 24px -12px rgba(0, 0, 0, 0.22)",
      }}
    >
      <div
        className="flex items-center gap-3 px-4 flex-shrink-0 min-h-[44px] py-1"
        style={{ borderBottom: "1px solid var(--border-secondary)" }}
      >
        <h2 className="text-[15px] font-semibold text-txt-primary flex-1 truncate">
          {t("settings.quick_settings")}
        </h2>
        <Button
          aria-label={t("common.close")}
          className="h-7 w-7 text-[var(--icon-muted)]"
          size="icon"
          variant="ghost"
          onClick={on_close}
        >
          <XMarkIcon className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col">
            <div className="px-4 pt-3">
              <button
                className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-[13px] font-medium outline-none transition-colors hover:bg-black/[0.04] focus:outline-none dark:hover:bg-white/[0.05]"
                style={{
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
                type="button"
                onClick={() => on_open_full_settings()}
              >
                <Cog6ToothIcon className="h-[15px] w-[15px]" />
                <span>{t("settings.see_all_settings")}</span>
              </button>
            </div>

            <QuickGroup
              more_label={t("settings.appearance")}
              on_more={() => on_open_full_settings("appearance")}
              title={t("settings.theme")}
            >
              <div className="flex gap-2 px-0.5" role="radiogroup">
                <ThemeQuickCard
                  is_selected={theme_preference === "light"}
                  label={t("settings.theme_light")}
                  mode="light"
                  on_select={() => {
                    set_theme_preference("light");
                    update_preference("theme", "light", true);
                  }}
                />
                <ThemeQuickCard
                  is_selected={theme_preference === "dark"}
                  label={t("settings.theme_dark")}
                  mode="dark"
                  on_select={() => {
                    set_theme_preference("dark");
                    update_preference("theme", "dark", true);
                  }}
                />
              </div>
            </QuickGroup>

            <QuickGroup
              more_label={t("settings.appearance")}
              on_more={() => on_open_full_settings("appearance")}
              title={t("settings.density")}
            >
              <QuickRadioGroup
                on_change={(v) =>
                  update_preference("mail_list_density", v, true)
                }
                options={[
                  { value: "comfortable", label: t("settings.density_comfortable"), thumbnail: <ThumbComfortable /> },
                  { value: "compact", label: t("settings.density_compact"), thumbnail: <ThumbCompact /> },
                ]}
                value={resolve_list_density(preferences.mail_list_density)}
              />
            </QuickGroup>

            <QuickGroup
              more_label={t("settings.appearance")}
              on_more={() => on_open_full_settings("appearance")}
              title={t("settings.email_view_mode")}
            >
              <QuickRadioGroup
                on_change={(v) =>
                  update_preference(
                    "email_view_mode",
                    v as "popup" | "split" | "fullpage",
                    true,
                  )
                }
                options={[
                  { value: "split", label: t("settings.split_view"), thumbnail: <ThumbSplit /> },
                  { value: "popup", label: t("settings.popup"), thumbnail: <ThumbPopup /> },
                  { value: "fullpage", label: t("settings.full_page"), thumbnail: <ThumbFullPage /> },
                ]}
                value={preferences.email_view_mode}
              />
            </QuickGroup>

            <QuickGroup
              more_label={t("settings.behavior")}
              on_more={() => on_open_full_settings("behavior")}
              title={t("settings.reading_pane_position")}
            >
              <QuickRadioGroup
                on_change={(v) =>
                  update_preference(
                    "reading_pane_position",
                    v as "right" | "bottom" | "hidden",
                    true,
                  )
                }
                options={[
                  { value: "right", label: t("settings.right_side"), thumbnail: <ThumbSplit /> },
                  { value: "bottom", label: t("settings.bottom"), thumbnail: <ThumbPaneBottom /> },
                  { value: "hidden", label: t("settings.hidden_click_to_open"), thumbnail: <ThumbLines count={4} gap="gap-1" /> },
                ]}
                value={preferences.reading_pane_position}
              />
            </QuickGroup>

            <div className="pb-4" />
      </div>
    </aside>
  );
}
