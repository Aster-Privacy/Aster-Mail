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
import { XMarkIcon } from "@heroicons/react/24/outline";
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
  thumbnail: React.ReactNode;
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
                className="quick_settings_row flex w-full items-center gap-3 rounded-[8px] px-1 py-[5px] text-left outline-none focus-visible:outline-none"
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
      className="quick_settings_row flex min-h-[36px] w-full items-center gap-3 rounded-[8px] px-1 text-left outline-none focus-visible:outline-none"
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

  return (
      <aside
        className="quick_settings_panel hidden h-full w-[352px] max-w-[40vw] flex-shrink-0 flex-col overflow-hidden lg:flex"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderLeft: "1px solid var(--border-secondary)",
        }}
      >
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

        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden pb-6">
          <div className="px-4 pb-3.5">
            <button
              className="quick_settings_all flex w-full items-center justify-center rounded-full px-4 py-2 text-[13.5px] font-medium outline-none transition-colors focus-visible:outline-none"
              style={{
                color: "var(--accent-color, #3b82f6)",
                boxShadow: "inset 0 0 0 1px var(--border-primary)",
              }}
              type="button"
              onClick={() => on_open_full_settings()}
            >
              {t("settings.see_all_settings")}
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
          />

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

          <QuickSection title={t("settings.quick_inbox_list")}>
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
          </QuickSection>
        </div>
      </aside>
  );
}
