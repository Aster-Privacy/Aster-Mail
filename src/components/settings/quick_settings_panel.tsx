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
import { createPortal } from "react-dom";
import {
  XMarkIcon,
  Cog6ToothIcon,
  ChevronRightIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

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

const SELECTED_TINT = "color-mix(in srgb, var(--accent-color, #3b82f6) 10%, transparent)";

function ThumbLines({ count, gap }: { count: number; gap: string }) {
  return (
    <span className={`flex h-full w-full flex-col ${gap} p-2`}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="h-[3px] w-full rounded-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      ))}
    </span>
  );
}

function ThumbSplit() {
  return (
    <span className="flex h-full w-full gap-1.5 p-2">
      <span className="flex w-[42%] flex-col gap-1">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="h-[3px] w-full rounded-full"
            style={{
              backgroundColor:
                i === 0 ? "var(--accent-color, #3b82f6)" : THUMB_LINE,
              opacity: i === 0 ? 1 : 0.45,
            }}
          />
        ))}
      </span>
      <span
        className="flex-1 rounded-[4px]"
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
      <ThumbLines count={4} gap="gap-1" />
      <span
        className="absolute left-1/2 top-1/2 h-[62%] w-[64%] -translate-x-1/2 -translate-y-1/2 rounded-[4px]"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--accent-color, #3b82f6)",
          boxShadow: "0 1px 5px rgba(0, 0, 0, 0.25)",
        }}
      />
    </span>
  );
}

function ThumbFullPage() {
  return (
    <span className="flex h-full w-full flex-col gap-1.5 p-2">
      <span
        className="h-[6px] w-[70%] rounded-[3px]"
        style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
      />
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className="h-[3px] w-full rounded-full"
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
          className="h-[3px] w-full rounded-full"
          style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
        />
        <span
          className="h-[3px] w-full rounded-full"
          style={{ backgroundColor: THUMB_LINE, opacity: 0.45 }}
        />
      </span>
      <span
        className="flex-1 rounded-[4px]"
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
        className="flex h-full flex-1 flex-col gap-[4px] p-2"
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

function SelectedCheck() {
  return (
    <span
      className="absolute right-1.5 top-1.5 flex h-[15px] w-[15px] items-center justify-center rounded-full"
      style={{ backgroundColor: "var(--accent-color, #3b82f6)" }}
    >
      <CheckIcon className="h-[10px] w-[10px] text-white" strokeWidth={3} />
    </span>
  );
}

interface QuickTileOption {
  value: string;
  label: string;
  thumbnail: React.ReactNode;
}

interface QuickTilesProps {
  options: QuickTileOption[];
  value: string;
  on_change: (value: string) => void;
}

function QuickTiles({ options, value, on_change }: QuickTilesProps) {
  return (
    <div className="flex gap-2" role="radiogroup">
      {options.map((option) => {
        const is_selected = option.value === value;

        return (
          <button
            key={option.value}
            aria-checked={is_selected}
            className="group flex min-w-0 flex-1 flex-col items-center gap-1.5 outline-none focus:outline-none"
            role="radio"
            type="button"
            onClick={() => on_change(option.value)}
          >
            <span
              className="relative block h-[52px] w-full overflow-hidden rounded-[10px] transition-all duration-150"
              style={{
                backgroundColor: is_selected
                  ? SELECTED_TINT
                  : "var(--bg-secondary, var(--bg-primary))",
                boxShadow: is_selected
                  ? "0 0 0 2px var(--accent-color, #3b82f6)"
                  : "0 0 0 1px var(--border-secondary)",
              }}
            >
              {option.thumbnail}
              {is_selected && <SelectedCheck />}
            </span>
            <span
              className="block w-full truncate text-center text-[11.5px] leading-tight"
              style={{
                color: is_selected
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                fontWeight: is_selected ? 600 : 400,
              }}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function QuickCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[14px] px-3.5 pb-3.5 pt-3"
      style={{
        backgroundColor: "var(--bg-primary)",
        boxShadow: "0 0 0 1px var(--border-secondary)",
      }}
    >
      <header className="mb-2.5 flex items-center gap-2">
        <h3 className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-txt-muted">
          {title}
        </h3>
        {action}
      </header>
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
    <div className="flex min-h-[32px] items-center gap-3">
      <span className="flex-1 truncate text-[13px] text-txt-primary">
        {label}
      </span>
      <Switch checked={checked} size="sm" onCheckedChange={on_change} />
    </div>
  );
}

function QuickSubLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[12px] text-txt-secondary">
      {children}
    </span>
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

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[95]"
        onMouseDown={on_close}
      />
      <aside
        className="quick_settings_panel fixed bottom-0 right-0 top-0 z-[96] hidden w-[352px] max-w-[92vw] flex-col overflow-hidden lg:flex"
        style={{
          backgroundColor: "var(--bg-secondary, var(--bg-primary))",
          borderLeft: "1px solid var(--border-secondary)",
          boxShadow: "-16px 0 44px -20px rgba(0, 0, 0, 0.55)",
        }}
      >
        <div
          className="flex min-h-[52px] flex-shrink-0 items-center gap-3 px-4"
          style={{ borderBottom: "1px solid var(--border-secondary)" }}
        >
          <h2 className="flex-1 truncate text-[15px] font-semibold text-txt-primary">
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

        <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto overflow-x-hidden p-3">
          <button
            className="flex w-full items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-left outline-none transition-colors focus:outline-none"
            style={{
              backgroundColor: SELECTED_TINT,
              color: "var(--accent-color, #3b82f6)",
            }}
            type="button"
            onClick={() => on_open_full_settings()}
          >
            <Cog6ToothIcon className="h-[18px] w-[18px] flex-shrink-0" />
            <span className="flex-1 truncate text-[13.5px] font-semibold">
              {t("settings.see_all_settings")}
            </span>
            <ChevronRightIcon className="h-4 w-4 flex-shrink-0" />
          </button>

          <QuickCard
            action={
              <button
                className="flex-shrink-0 rounded-[6px] text-[11.5px] font-medium outline-none focus:outline-none"
                style={{ color: "var(--accent-color, #3b82f6)" }}
                type="button"
                onClick={() => on_open_full_settings("appearance")}
              >
                {t("settings.quick_more_appearance")}
              </button>
            }
            title={t("settings.theme")}
          >
            <QuickTiles
              on_change={(v) => handle_theme_select(v as "light" | "dark")}
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
              value={active_theme}
            />
          </QuickCard>

          <QuickCard title={t("settings.quick_layout")}>
            <QuickSubLabel>{t("settings.email_view_mode")}</QuickSubLabel>
            <QuickTiles
              on_change={(v) =>
                update_preference(
                  "email_view_mode",
                  v as "popup" | "split" | "fullpage",
                  true,
                )
              }
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
              value={preferences.email_view_mode}
            />

            <div className="mt-3.5">
              <QuickSubLabel>
                {t("settings.reading_pane_position")}
              </QuickSubLabel>
              <QuickTiles
                on_change={(v) =>
                  update_preference(
                    "reading_pane_position",
                    v as "right" | "bottom" | "hidden",
                    true,
                  )
                }
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
                    thumbnail: <ThumbLines count={4} gap="gap-1" />,
                  },
                ]}
                value={preferences.reading_pane_position}
              />
            </div>
          </QuickCard>

          <QuickCard title={t("settings.quick_inbox_list")}>
            <QuickSubLabel>{t("settings.density")}</QuickSubLabel>
            <QuickTiles
              on_change={(v) => update_preference("mail_list_density", v, true)}
              options={[
                {
                  value: "comfortable",
                  label: t("settings.density_comfortable"),
                  thumbnail: <ThumbLines count={3} gap="gap-[9px]" />,
                },
                {
                  value: "compact",
                  label: t("settings.density_compact"),
                  thumbnail: <ThumbLines count={5} gap="gap-[4px]" />,
                },
              ]}
              value={resolve_list_density(preferences.mail_list_density)}
            />

            <div
              className="mt-3 flex flex-col pt-1"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              <QuickToggle
                checked={preferences.conversation_grouping ?? true}
                label={t("settings.conversation_grouping")}
                on_change={(next) =>
                  update_preference("conversation_grouping", next, true)
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
            </div>
          </QuickCard>
        </div>
      </aside>
    </>,
    document.body,
  );
}
