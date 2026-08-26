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
import type { SpamSettings } from "@/services/api/preferences";
import { commit_on_enter } from "@/lib/commit_on_enter";
import type { MemberRetentionPolicy } from "@/services/api/family_org";

import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Badge, Button, Switch } from "@aster/ui";
import {
  BookOpenIcon,
  PencilSquareIcon,
  LockClosedIcon,
  ClockIcon,
  QuestionMarkCircleIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ViewColumnsIcon,
  LanguageIcon,
} from "@heroicons/react/24/outline";

import { SettingsSaveIndicatorInline } from "../settings_save_indicator";

import {
  LanguagePicker,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_PRESET_WIDTHS,
  SelectSetting,
  ToggleSetting,
  UNDO_DEFAULT_SECONDS,
  UNDO_MAX_SECONDS,
  UNDO_MIN_SECONDS,
  UNDO_PRESET_SECONDS,
  undo_send_is_active,
  clamp_sidebar_width,
  clamp_undo_seconds,
} from "./shared";

import { use_preferences } from "@/contexts/preferences_context";
import { use_auth } from "@/contexts/auth_context";
import {
  read_dev_mode_cache,
  write_dev_mode_cache,
} from "@/lib/dev_mode_cache";
import {
  get_dev_mode,
  save_dev_mode,
  get_spam_settings,
  save_spam_settings,
} from "@/services/api/preferences";
import { apply_spam_settings_patch } from "./spam_settings_sync";
import { get_member_retention_policy } from "@/services/api/family_org";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert_dialog";
import { cn } from "@/lib/utils";
import { use_i18n } from "@/lib/i18n/context";
import { use_register_search_items } from "@/components/settings/search_context";
import { type LanguageCode } from "@/services/translation/engine_types";
import { derive_accepted_languages } from "@/services/translation/accepted_languages";
import { InfoPopover } from "@/components/ui/info_popover";
import {
  INBOX_PAGE_SIZE_OPTIONS,
  clamp_inbox_page_size,
} from "@/lib/inbox_page_size";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { ignore_error } from "@/lib/ignore_error";
import { get_close_to_tray, set_close_to_tray } from "@/native/tauri_tray";
import { show_toast } from "@/components/toast/simple_toast";

export function BehaviorSection() {
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const { t, language } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const { current_account_id } = use_auth();

  use_register_search_items("behavior", [
    {
      label: t("settings.emails_per_page"),
      breadcrumb: `${t("settings.behavior")} > ${t("settings.reading_and_conversations")}`,
      keywords: [
        "page size",
        "per page",
        "pagination",
        "results",
        "emails per page",
      ],
    },
    {
      label: t("settings.sender_pictures"),
      breadcrumb: `${t("settings.behavior")} > ${t("settings.reading_and_conversations")}`,
      keywords: ["avatar", "picture", "photo", "sender", "profile"],
    },
    {
      label: t("settings.show_alias_indicators"),
      breadcrumb: `${t("settings.behavior")} > ${t("settings.reading_and_conversations")}`,
      keywords: ["alias", "indicator", "badge", "delivered to"],
    },
    {
      label: t("settings.translate_incoming"),
      breadcrumb: `${t("settings.behavior")} > ${t("settings.translation")}`,
      keywords: ["translate", "translation", "language"],
    },
    {
      label: t("settings.translate_my_languages"),
      breadcrumb: `${t("settings.behavior")} > ${t("settings.translation")}`,
      keywords: ["translate", "language"],
    },
    {
      label: t("settings.translate_never_languages"),
      breadcrumb: `${t("settings.behavior")} > ${t("settings.translation")}`,
      keywords: ["translate", "language"],
    },
  ]);

  const navigator_languages =
    typeof navigator !== "undefined" ? (navigator.languages ?? []) : [];
  const read_languages_auto = preferences.translate_languages.length === 0;
  const read_languages = derive_accepted_languages(
    preferences.translate_languages,
    language,
    navigator_languages,
  );

  const add_read_language = (code: string) => {
    if (read_languages.includes(code as LanguageCode)) return;

    update_preference("translate_languages", [...read_languages, code], true);
  };

  const remove_read_language = (code: string) => {
    const remaining = read_languages.filter((c) => c !== code);

    if (remaining.length === 0) {
      show_toast(t("settings.translate_languages_keep_one"), "error");

      return;
    }

    update_preference("translate_languages", remaining, true);
  };

  const add_never_language = (code: string) => {
    const current = preferences.translate_never_languages;

    if (current.includes(code)) return;

    update_preference("translate_never_languages", [...current, code], true);
  };

  const remove_never_language = (code: string) => {
    update_preference(
      "translate_never_languages",
      preferences.translate_never_languages.filter((c) => c !== code),
      true,
    );
  };
  const [sidebar_width_input, set_sidebar_width_input] = useState<
    string | null
  >(null);
  const [undo_input_value, set_undo_input_value] = useState<string | null>(
    null,
  );
  const undo_send_active = undo_send_is_active(
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,
  );
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(
    () => read_dev_mode_cache(current_account_id) ?? false,
  );
  const [is_dragging_sidebar_width, set_is_dragging_sidebar_width] =
    useState(false);
  const commit_sidebar_width = useCallback(() => {
    update_preference(
      "sidebar_width",
      clamp_sidebar_width(preferences.sidebar_width ?? SIDEBAR_DEFAULT_WIDTH),
      true,
    );
  }, [preferences.sidebar_width, update_preference]);
  const [spam_settings, set_spam_settings] = useState<SpamSettings>({
    spam_retention_days: 30,
    spam_sensitivity: "medium",
    spam_filter_enabled: true,
  });
  const dev_mode_generation_ref = useRef(0);
  const spam_generation_ref = useRef(0);
  const spam_loaded_ref = useRef(false);
  const [spam_load_failed, set_spam_load_failed] = useState(false);
  const [family_policy, set_family_policy] =
    useState<MemberRetentionPolicy | null>(null);
  const [show_grouping_dialog, set_show_grouping_dialog] = useState(false);
  const [mailto_registered, set_mailto_registered] = useState(() => {
    try {
      return localStorage.getItem("aster:mailto_handler") === "true";
    } catch {
      return false;
    }
  });
  const is_web =
    !Capacitor.isNativePlatform() && !("__TAURI_INTERNALS__" in window);
  const is_desktop_app = "__TAURI_INTERNALS__" in window;
  const [close_to_tray, set_close_to_tray_state] = useState(() =>
    get_close_to_tray(),
  );

  const handle_close_to_tray_toggle = async () => {
    const previous = close_to_tray;
    const next = !previous;

    set_close_to_tray_state(next);
    const applied = await set_close_to_tray(next);

    if (!applied) {
      set_close_to_tray_state(previous);
      show_toast(t("common.something_went_wrong_try_again"), "error");
    }
  };

  useEffect(() => {
    const vault = get_vault_from_memory();
    const dev_mode_generation = ++dev_mode_generation_ref.current;
    const spam_generation = ++spam_generation_ref.current;

    get_dev_mode(vault).then((result) => {
      if (dev_mode_generation !== dev_mode_generation_ref.current) return;
      if (result.data === null) return;

      set_dev_mode_enabled(result.data);
      write_dev_mode_cache(current_account_id, result.data);
    });
    get_spam_settings().then((result) => {
      if (spam_generation !== spam_generation_ref.current) return;

      if (result.data) {
        spam_loaded_ref.current = true;
        set_spam_settings(result.data);
        set_spam_load_failed(false);

        return;
      }
      set_spam_load_failed(true);
    });
    get_member_retention_policy()
      .then((result) => {
        if (result.data) {
          set_family_policy(result.data);
        }
      })
      .catch((caught) =>
        ignore_error(
          "components/settings/behavior_section/behavior_section:remove_never_language",
          caught,
        ),
      );
  }, [current_account_id]);

  const handle_dev_mode_toggle = async () => {
    const vault = get_vault_from_memory();

    if (!vault) {
      show_toast(t("settings.dev_mode_needs_unlock"), "error");

      return;
    }

    const new_value = !dev_mode_enabled;

    dev_mode_generation_ref.current += 1;
    set_dev_mode_enabled(new_value);
    write_dev_mode_cache(current_account_id, new_value);

    const saved = await save_dev_mode(new_value, vault);

    if (!saved.data.success) {
      set_dev_mode_enabled(!new_value);
      write_dev_mode_cache(current_account_id, !new_value);
      show_toast(t("common.something_went_wrong_try_again"), "error");

      return;
    }
    window.dispatchEvent(
      new CustomEvent("dev-mode-changed", { detail: new_value }),
    );
  };

  const reload_spam_settings = () => {
    const generation = ++spam_generation_ref.current;

    void get_spam_settings().then((result) => {
      if (generation !== spam_generation_ref.current) return;

      if (result.data) {
        spam_loaded_ref.current = true;
        set_spam_settings(result.data);
        set_spam_load_failed(false);

        return;
      }
      set_spam_load_failed(true);
    });
  };

  const apply_spam_settings = (patch: Partial<SpamSettings>) => {
    const generation = ++spam_generation_ref.current;

    if (spam_loaded_ref.current) {
      set_spam_settings((current) => ({ ...current, ...patch }));
    }

    apply_spam_settings_patch({
      loaded: spam_loaded_ref.current,
      current: spam_settings,
      patch,
      load: get_spam_settings,
      save: save_spam_settings,
    }).then((result) => {
      if (generation !== spam_generation_ref.current) return;

      spam_loaded_ref.current = result.loaded;
      set_spam_settings(result.next);
      set_spam_load_failed(!result.loaded);

      if (!result.saved) {
        show_toast(t("settings.failed_save_setting"), "error");
      }
    });
  };

  const handle_mailto_toggle = () => {
    if (!mailto_registered) {
      try {
        navigator.registerProtocolHandler(
          "mailto",
          `${window.location.origin}/compose?to=%s`,
        );
        set_mailto_registered(true);
        localStorage.setItem("aster:mailto_handler", "true");
      } catch {
        set_mailto_registered(false);
      }
    } else {
      set_mailto_registered(false);
      try {
        const unregister = (
          navigator as Navigator & {
            unregisterProtocolHandler?: (scheme: string, url: string) => void;
          }
        ).unregisterProtocolHandler;

        unregister?.call(
          navigator,
          "mailto",
          `${window.location.origin}/compose?to=%s`,
        );
        localStorage.setItem("aster:mailto_handler", "false");
      } catch (caught) {
        ignore_error("settings/behavior_section:handle_mailto_toggle", caught);
      }
    }
  };

  return (
    <div className="space-y-4">
      <SettingsSaveIndicatorInline />

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <BookOpenIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.reading_and_conversations")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <SelectSetting
          description={t("settings.mark_as_read_description")}
          info={{
            title: t("settings.mark_as_read"),
            description: t("settings.mark_as_read_description"),
          }}
          on_change={(v) =>
            update_preference(
              "mark_as_read_delay",
              v as "immediate" | "1_second" | "3_seconds" | "never",
              true,
            )
          }
          options={[
            { value: "immediate", label: t("settings.immediately") },
            { value: "1_second", label: t("settings.after_1_second") },
            { value: "3_seconds", label: t("settings.after_3_seconds") },
            { value: "never", label: t("settings.never_manual") },
          ]}
          title={t("settings.mark_as_read")}
          value={preferences.mark_as_read_delay}
        />

        <SelectSetting
          description={t("settings.emails_per_page_description")}
          info={{
            title: t("settings.emails_per_page"),
            description: t("settings.emails_per_page_description"),
          }}
          on_change={(v) =>
            update_preference(
              "inbox_page_size",
              clamp_inbox_page_size(parseInt(v, 10)),
              true,
            )
          }
          options={INBOX_PAGE_SIZE_OPTIONS.map((size) => ({
            value: String(size),
            label: String(size),
          }))}
          title={t("settings.emails_per_page")}
          value={String(clamp_inbox_page_size(preferences.inbox_page_size))}
        />

        <SelectSetting
          description={t("settings.auto_advance_description")}
          on_change={(v) => update_preference("auto_advance", v, true)}
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
        />

        <SelectSetting
          description={t("settings.reading_pane_description")}
          on_change={(v) =>
            update_preference(
              "reading_pane_position",
              v as "right" | "bottom" | "hidden",
              true,
            )
          }
          options={[
            { value: "right", label: t("settings.right_side") },
            { value: "bottom", label: t("settings.bottom") },
            { value: "hidden", label: t("settings.hidden_click_to_open") },
          ]}
          title={t("settings.reading_pane_position")}
          value={preferences.reading_pane_position}
        />

        <SelectSetting
          description={t("settings.thread_count_position_description")}
          on_change={(v) =>
            update_preference(
              "thread_count_position",
              v as "left" | "right",
              true,
            )
          }
          options={[
            { value: "left", label: t("settings.thread_count_left") },
            { value: "right", label: t("settings.thread_count_right") },
          ]}
          title={t("settings.thread_count_position")}
          value={preferences.thread_count_position ?? "left"}
        />

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-txt-primary">
              {t("settings.conversation_grouping")}
              <InfoPopover
                description={t("settings.conversation_grouping_description")}
                title={t("settings.conversation_grouping")}
              />
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.conversation_grouping_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.conversation_grouping")}
            checked={preferences.conversation_grouping !== false}
            size="lg"
            onCheckedChange={(checked) => {
              if (!checked) {
                set_show_grouping_dialog(true);

                return;
              }
              update_preference("conversation_grouping", true, true);
            }}
          />
        </div>

        <SelectSetting
          description={t("settings.conversation_order_description")}
          on_change={(v) =>
            update_preference("conversation_order", v as "asc" | "desc", true)
          }
          options={[
            { value: "asc", label: t("settings.oldest_first") },
            { value: "desc", label: t("settings.newest_first") },
          ]}
          title={t("settings.conversation_order")}
          value={preferences.conversation_order ?? "asc"}
        />

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.show_message_size")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.show_message_size_description")}
            </p>
          </div>
          <Switch
            aria-label={t("settings.show_message_size")}
            checked={preferences.show_message_size === true}
            size="lg"
            onCheckedChange={() =>
              update_preference(
                "show_message_size",
                !preferences.show_message_size,
                true,
              )
            }
          />
        </div>

        <ToggleSetting
          description={t("settings.show_alias_indicators_description")}
          enabled={preferences.show_alias_indicators !== false}
          info={{
            title: t("settings.show_alias_indicators"),
            description: t("settings.show_alias_indicators_description"),
          }}
          on_toggle={() =>
            update_preference(
              "show_alias_indicators",
              preferences.show_alias_indicators === false,
              true,
            )
          }
          title={t("settings.show_alias_indicators")}
        />

        <ToggleSetting
          description={t("settings.sender_pictures_description")}
          enabled={preferences.show_profile_pictures !== false}
          info={{
            title: t("settings.sender_pictures"),
            description: t("settings.sender_pictures_description"),
          }}
          on_toggle={() =>
            update_preference(
              "show_profile_pictures",
              preferences.show_profile_pictures === false,
              true,
            )
          }
          title={t("settings.sender_pictures")}
        />

        <ToggleSetting
          description={t("settings.force_dark_mode_emails_description")}
          enabled={preferences.force_dark_mode_emails}
          info={{
            title: t("settings.force_dark_mode_emails"),
            description: t("settings.force_dark_mode_emails_description"),
          }}
          on_toggle={() =>
            update_preference(
              "force_dark_mode_emails",
              !preferences.force_dark_mode_emails,
              true,
            )
          }
          title={t("settings.force_dark_mode_emails")}
        />
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <LanguageIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.translation")}
            <Badge color="purple">{t("common.beta")}</Badge>
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <SelectSetting
          description={t("settings.translate_incoming_description")}
          info={{
            title: t("settings.translate_incoming"),
            description: t("settings.translate_incoming_info"),
          }}
          on_change={(v) =>
            update_preference(
              "translate_incoming",
              v as "off" | "ask" | "always",
              true,
            )
          }
          options={[
            { value: "off", label: t("settings.translate_off") },
            { value: "ask", label: t("settings.translate_ask") },
            { value: "always", label: t("settings.translate_always") },
          ]}
          title={t("settings.translate_incoming")}
          value={preferences.translate_incoming}
        />

        {preferences.translate_incoming !== "off" && (
          <>
            <LanguagePicker
              add_label={t("settings.translate_add_language")}
              auto_label={t("settings.translate_auto_detected")}
              description={t("settings.translate_my_languages_description")}
              is_auto={read_languages_auto}
              on_add={add_read_language}
              on_remove={remove_read_language}
              selected={read_languages}
              title={t("settings.translate_my_languages")}
              ui_locale={language}
            />

            <LanguagePicker
              add_label={t("settings.translate_add_language")}
              auto_label={t("settings.translate_auto_detected")}
              description={t("settings.translate_never_languages_description")}
              is_auto={false}
              on_add={add_never_language}
              on_remove={remove_never_language}
              selected={preferences.translate_never_languages}
              title={t("settings.translate_never_languages")}
              ui_locale={language}
            />
          </>
        )}
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ViewColumnsIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.navigation_panel")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <div className="py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 pe-4">
              <p className="text-sm font-medium text-txt-primary">
                {t("settings.sidebar_width")}
              </p>
              <p className="text-sm mt-0.5 text-txt-muted">
                {t("settings.sidebar_width_description")
                  .replace("{{min}}", String(SIDEBAR_MIN_WIDTH))
                  .replace("{{max}}", String(SIDEBAR_MAX_WIDTH))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                aria-label={t("settings.sidebar_width")}
                className="w-20 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                max={SIDEBAR_MAX_WIDTH}
                min={SIDEBAR_MIN_WIDTH}
                size="md"
                type="number"
                value={
                  sidebar_width_input ??
                  clamp_sidebar_width(
                    preferences.sidebar_width ?? SIDEBAR_DEFAULT_WIDTH,
                  )
                }
                onBlur={(e) => {
                  const parsed = parseInt(e.target.value, 10);

                  update_preference(
                    "sidebar_width",
                    clamp_sidebar_width(
                      Number.isFinite(parsed) ? parsed : SIDEBAR_DEFAULT_WIDTH,
                    ),
                    true,
                  );
                  set_sidebar_width_input(null);
                }}
                onChange={(e) => set_sidebar_width_input(e.target.value)}
                onFocus={(e) => set_sidebar_width_input(e.target.value)}
                onKeyDown={commit_on_enter}
              />
              <span className="text-sm text-txt-secondary">px</span>
            </div>
          </div>

          {(() => {
            const current_width = clamp_sidebar_width(
              preferences.sidebar_width ?? SIDEBAR_DEFAULT_WIDTH,
            );
            const percent =
              ((current_width - SIDEBAR_MIN_WIDTH) /
                (SIDEBAR_MAX_WIDTH - SIDEBAR_MIN_WIDTH)) *
              100;

            return (
              <div className="relative py-2 group/slider">
                <div
                  aria-hidden="true"
                  className="absolute start-0 end-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-edge-secondary pointer-events-none"
                />
                <div
                  aria-hidden="true"
                  className="absolute start-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full pointer-events-none transition-[width] duration-100 ease-out"
                  style={{
                    width: `${percent}%`,
                    background:
                      "linear-gradient(90deg, var(--accent-alpha-75, rgba(59, 130, 246, 0.75)), var(--accent-blue))",
                  }}
                />
                {is_dragging_sidebar_width && (
                  <div
                    className="absolute -top-8 -translate-x-1/2 px-2 py-1 rounded-md text-xs font-medium text-[var(--accent-fg,#ffffff)] bg-[var(--accent-blue)] shadow-lg pointer-events-none whitespace-nowrap transition-[left] duration-75 ease-out"
                    style={{ left: `${percent}%` }}
                  >
                    {current_width}px
                  </div>
                )}
                <input
                  aria-label={t("settings.sidebar_width")}
                  className="relative z-10 w-full h-4 appearance-none bg-transparent outline-none cursor-pointer active:cursor-grabbing [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.4)] [&::-webkit-slider-thumb]:bg-[var(--accent-blue)] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-[transform,box-shadow] [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:hover:shadow-[0_2px_8px_rgba(0,0,0,0.45)] [&::-webkit-slider-thumb]:active:scale-110 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.4)] [&::-moz-range-thumb]:bg-[var(--accent-blue)] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-[transform,box-shadow] [&::-moz-range-thumb]:duration-150 [&::-moz-range-thumb]:hover:scale-125 [&::-moz-range-thumb]:hover:shadow-[0_2px_8px_rgba(0,0,0,0.45)] [&::-moz-range-thumb]:active:scale-110 focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-[var(--accent-blue)]/30 focus-visible:[&::-moz-range-thumb]:ring-4 focus-visible:[&::-moz-range-thumb]:ring-[var(--accent-blue)]/30"
                  max={SIDEBAR_MAX_WIDTH}
                  min={SIDEBAR_MIN_WIDTH}
                  step={4}
                  type="range"
                  value={current_width}
                  onBlur={() => {
                    set_is_dragging_sidebar_width(false);
                    commit_sidebar_width();
                  }}
                  onChange={(e) => {
                    update_preference(
                      "sidebar_width",
                      clamp_sidebar_width(parseInt(e.target.value, 10)),
                    );
                  }}
                  onKeyUp={commit_sidebar_width}
                  onLostPointerCapture={() => {
                    set_is_dragging_sidebar_width(false);
                    commit_sidebar_width();
                  }}
                  onPointerDown={() => set_is_dragging_sidebar_width(true)}
                  onPointerUp={() => {
                    set_is_dragging_sidebar_width(false);
                    commit_sidebar_width();
                  }}
                />
              </div>
            );
          })()}

          <div className="flex items-center gap-2 mt-3">
            {SIDEBAR_PRESET_WIDTHS.map((width) => {
              const current = clamp_sidebar_width(
                preferences.sidebar_width ?? SIDEBAR_DEFAULT_WIDTH,
              );

              return (
                <button
                  key={width}
                  className={cn(
                    "px-3 py-1.5 text-xs rounded-[12px] border-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]",
                    current === width
                      ? "bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)]"
                      : "bg-surf-secondary hover:bg-surf-hover",
                  )}
                  style={{
                    color:
                      current === width ? undefined : "var(--text-secondary)",
                  }}
                  type="button"
                  onClick={() =>
                    update_preference("sidebar_width", width, true)
                  }
                >
                  {width}px
                </button>
              );
            })}
          </div>
        </div>

        <ToggleSetting
          description={t("settings.minimize_sidebar_description")}
          enabled={preferences.sidebar_minimized}
          on_toggle={() =>
            update_preference(
              "sidebar_minimized",
              !preferences.sidebar_minimized,
              true,
            )
          }
          title={t("settings.minimize_sidebar")}
        />
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <PencilSquareIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.composing_and_replies")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <SelectSetting
          description={t("settings.default_reply_description")}
          on_change={(v) =>
            update_preference(
              "default_reply_behavior",
              v as "reply" | "reply_all",
              true,
            )
          }
          options={[
            { value: "reply", label: t("settings.reply_to_sender") },
            { value: "reply_all", label: t("settings.reply_to_all") },
          ]}
          title={t("settings.default_reply")}
          value={preferences.default_reply_behavior}
        />

        <ToggleSetting
          description={t(
            "settings.auto_save_recipients_to_contacts_description",
          )}
          enabled={preferences.auto_save_recent_recipients}
          on_toggle={() => {
            update_preference(
              "auto_save_recent_recipients",
              !preferences.auto_save_recent_recipients,
              true,
            );
          }}
          title={t("settings.auto_save_recipients_to_contacts")}
        />

        <ToggleSetting
          description={t("settings.reactions_enabled_description")}
          enabled={preferences.reactions_enabled !== false}
          on_toggle={() =>
            update_preference(
              "reactions_enabled",
              preferences.reactions_enabled === false,
              true,
            )
          }
          title={t("settings.reactions_enabled")}
        />

        <ToggleSetting
          description={t("settings.purge_locked_folder_on_delete_description")}
          enabled={preferences.purge_locked_folder_on_delete === true}
          on_toggle={() =>
            update_preference(
              "purge_locked_folder_on_delete",
              preferences.purge_locked_folder_on_delete !== true,
              true,
            )
          }
          title={t("settings.purge_locked_folder_on_delete")}
        />
      </div>

      <UpgradeGate
        description={t("settings.protected_folders_description")}
        feature_name={t("settings.feature_password_protected_folders")}
        is_locked={is_feature_locked("has_password_protected_folders")}
        min_plan="Nova"
      >
        <div>
          <div className="mb-4">
            <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
              <LockClosedIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
              {t("settings.protected_folders")}
            </h3>
            <div className="mt-2 h-px bg-edge-secondary" />
          </div>

          <SelectSetting
            description={t("settings.folder_lock_mode_description")}
            info={{
              title: t("settings.info_folder_lock_mode_title"),
              description: t("settings.info_folder_lock_mode_description"),
            }}
            on_change={(v) =>
              update_preference(
                "protected_folder_lock_mode",
                v as "session" | "on_leave",
                true,
              )
            }
            options={[
              { value: "session", label: t("settings.lock_mode_session") },
              { value: "on_leave", label: t("settings.lock_mode_on_leave") },
            ]}
            title={t("settings.folder_lock_mode")}
            value={preferences.protected_folder_lock_mode ?? "session"}
          />
        </div>
      </UpgradeGate>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ClockIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.undo_send")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <ToggleSetting
          description={t("settings.undo_send_delay_description")}
          enabled={undo_send_active}
          on_toggle={() => {
            const undo_enabled = undo_send_active;

            if (undo_enabled) {
              update_preferences({ undo_send_enabled: false }, true);
            } else {
              const seconds = clamp_undo_seconds(
                preferences.undo_send_seconds ?? UNDO_DEFAULT_SECONDS,
              );

              update_preferences(
                {
                  undo_send_enabled: true,
                  undo_send_seconds: seconds,
                  undo_send_period: `${seconds} seconds`,
                },
                true,
              );
            }
          }}
          title={t("settings.enable_undo_send")}
        />

        {undo_send_active && (
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1 pe-4">
                <p className="text-sm font-medium text-txt-primary">
                  {t("settings.cancellation_period")}
                </p>
                <p className="text-sm mt-0.5 text-txt-muted">
                  {t("settings.cancellation_period_description")
                    .replace("{{min}}", String(UNDO_MIN_SECONDS))
                    .replace("{{max}}", String(UNDO_MAX_SECONDS))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-20 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  max={UNDO_MAX_SECONDS}
                  min={UNDO_MIN_SECONDS}
                  size="md"
                  type="number"
                  value={
                    undo_input_value ??
                    clamp_undo_seconds(
                      preferences.undo_send_seconds ?? UNDO_DEFAULT_SECONDS,
                    )
                  }
                  onBlur={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    const clamped = clamp_undo_seconds(
                      Number.isFinite(parsed) ? parsed : UNDO_DEFAULT_SECONDS,
                    );

                    update_preferences(
                      {
                        undo_send_seconds: clamped,
                        undo_send_period: `${clamped} seconds`,
                      },
                      true,
                    );
                    set_undo_input_value(null);
                  }}
                  onChange={(e) => {
                    set_undo_input_value(e.target.value);
                  }}
                  onFocus={(e) => set_undo_input_value(e.target.value)}
                  onKeyDown={commit_on_enter}
                />
                <span className="text-sm text-txt-secondary">
                  {t("common.seconds")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {UNDO_PRESET_SECONDS.map((seconds) => {
                const current = clamp_undo_seconds(
                  preferences.undo_send_seconds ?? UNDO_DEFAULT_SECONDS,
                );

                return (
                  <button
                    key={seconds}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-[12px] transition-colors",
                      current === seconds
                        ? "bg-[var(--accent-blue)] text-[var(--accent-fg,#ffffff)]"
                        : "bg-surf-secondary hover:bg-surf-hover",
                    )}
                    style={{
                      color:
                        current === seconds
                          ? undefined
                          : "var(--text-secondary)",
                    }}
                    type="button"
                    onClick={() => {
                      set_undo_input_value(null);
                      update_preferences(
                        {
                          undo_send_seconds: seconds,
                          undo_send_period: `${seconds} seconds`,
                        },
                        true,
                      );
                    }}
                  >
                    {seconds}s
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <QuestionMarkCircleIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.confirmations")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <ToggleSetting
          description={t("settings.confirm_delete_description")}
          enabled={preferences.confirm_before_delete}
          on_toggle={() =>
            update_preference(
              "confirm_before_delete",
              !preferences.confirm_before_delete,
              true,
            )
          }
          title={t("settings.confirm_delete")}
        />

        <ToggleSetting
          description={t("settings.confirm_archive_description")}
          enabled={preferences.confirm_before_archive}
          on_toggle={() =>
            update_preference(
              "confirm_before_archive",
              !preferences.confirm_before_archive,
              true,
            )
          }
          title={t("settings.confirm_archive")}
        />

        <ToggleSetting
          description={t("settings.confirm_spam_description")}
          enabled={preferences.confirm_before_spam}
          on_toggle={() =>
            update_preference(
              "confirm_before_spam",
              !preferences.confirm_before_spam,
              true,
            )
          }
          title={t("settings.confirm_spam")}
        />
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ShieldCheckIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.spam_filtering_title")}
          </h3>
          <p className="text-sm text-txt-muted mt-1">
            {t("settings.spam_filtering_description")}
          </p>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        {spam_load_failed && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-edge-secondary p-3">
            <p className="text-xs text-txt-muted">
              {t("settings.spam_settings_load_failed")}
            </p>
            <Button size="sm" variant="outline" onClick={reload_spam_settings}>
              {t("common.retry")}
            </Button>
          </div>
        )}

        {!spam_load_failed && (
          <>
            <ToggleSetting
              description={t("settings.spam_filter_enabled_description")}
              enabled={spam_settings.spam_filter_enabled}
              on_toggle={() => {
                apply_spam_settings({
                  spam_filter_enabled: !spam_settings.spam_filter_enabled,
                });
              }}
              title={t("settings.spam_filter_enabled")}
            />

            <SelectSetting
              description={t("settings.spam_sensitivity_description")}
              info={{
                title: t("settings.info_spam_sensitivity_title"),
                description: t("settings.info_spam_sensitivity_description"),
              }}
              on_change={(value) => {
                apply_spam_settings({ spam_sensitivity: value });
              }}
              options={[
                { value: "low", label: t("settings.spam_low") },
                { value: "medium", label: t("settings.spam_medium") },
                { value: "high", label: t("settings.spam_high") },
              ]}
              title={t("settings.spam_sensitivity")}
              value={spam_settings.spam_sensitivity}
            />

            <SelectSetting
              description={t("settings.auto_delete_spam_description")}
              disabled={
                !!family_policy?.enforce_on_members &&
                family_policy.spam_retention_days != null
              }
              disabled_note={t("settings.controlled_by_family_admin")}
              on_change={(value) => {
                const days = value === "never" ? 0 : parseInt(value, 10);

                apply_spam_settings({
                  spam_retention_days: days,
                });
              }}
              options={[
                { value: "7", label: t("settings.retention_7_days") },
                { value: "14", label: t("settings.retention_14_days") },
                { value: "30", label: t("settings.retention_30_days") },
                { value: "never", label: t("settings.retention_never") },
              ]}
              title={t("settings.auto_delete_spam_after")}
              value={
                family_policy?.enforce_on_members &&
                family_policy.spam_retention_days != null
                  ? family_policy.spam_retention_days === 0
                    ? "never"
                    : String(family_policy.spam_retention_days)
                  : spam_settings.spam_retention_days === 0
                    ? "never"
                    : String(spam_settings.spam_retention_days)
              }
            />
          </>
        )}
      </div>

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <Cog6ToothIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.advanced")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <SelectSetting
          description={t("settings.settings_view_mode_description")}
          on_change={(v) =>
            update_preference(
              "settings_view_mode",
              v as "fullpage" | "popup",
              true,
            )
          }
          options={[
            { value: "fullpage", label: t("settings.full_page") },
            { value: "popup", label: t("settings.popup") },
          ]}
          title={t("settings.settings_view_mode")}
          value={preferences.settings_view_mode ?? "fullpage"}
        />
        {is_web && (
          <ToggleSetting
            description={t("settings.default_email_app_description")}
            enabled={mailto_registered}
            on_toggle={handle_mailto_toggle}
            title={t("settings.default_email_app")}
          />
        )}
        {is_desktop_app && (
          <ToggleSetting
            description={t("settings.close_to_tray_description")}
            enabled={close_to_tray}
            info={{
              title: t("settings.close_to_tray"),
              description: t("settings.close_to_tray_description"),
            }}
            on_toggle={handle_close_to_tray_toggle}
            title={t("settings.close_to_tray")}
          />
        )}
        <ToggleSetting
          description={t("settings.developer_mode_description")}
          enabled={dev_mode_enabled}
          on_toggle={handle_dev_mode_toggle}
          title={t("settings.developer_mode")}
        />
      </div>

      <AlertDialog
        open={show_grouping_dialog}
        onOpenChange={set_show_grouping_dialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.conversation_grouping_confirm_title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.conversation_grouping_confirm_description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:flex-row max-sm:gap-3">
            <AlertDialogCancel className="max-sm:flex-1">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="max-sm:flex-1"
              onClick={() => {
                update_preference("conversation_grouping", false, true);
                set_show_grouping_dialog(false);
              }}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
