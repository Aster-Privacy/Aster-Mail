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
import type { MemberRetentionPolicy } from "@/services/api/family_org";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { CheckIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  OptionList,
  chip_selected_style,
} from "./shared";
import { MobileSidebarLayoutGroups } from "./sidebar_layout_groups";

import { use_preferences } from "@/contexts/preferences_context";
import { use_lockdown_active } from "@/hooks/use_lockdown_active";
import {
  displayed_remote_content_setting,
  image_mode_update,
} from "@/lib/remote_content_policy";
import { parse_bounded_int } from "@/lib/parse_bounded_int";
import { use_i18n } from "@/lib/i18n/context";
import { SkinToneSwatches } from "@/components/settings/skin_tone_swatches";
import { normalize_skin_tone } from "@/config/emoji/skin_tones";
import { show_toast } from "@/components/toast/simple_toast";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { PlanUpgradeButton } from "@/components/common/plan_locked";
import {
  get_spam_settings,
  save_spam_settings,
} from "@/services/api/preferences";
import { get_member_retention_policy } from "@/services/api/family_org";
import { Spinner } from "@/components/ui/spinner";
import {
  DEFAULT_SPAM_SETTINGS,
  behavior_section_ready,
  peek_family_policy,
  peek_spam_settings,
  remember_family_policy,
  remember_spam_settings,
} from "@/components/settings/behavior_section/behavior_load_cache";
import { ignore_error } from "@/lib/ignore_error";
import {
  UNDO_DEFAULT_SECONDS,
  UNDO_PRESET_SECONDS,
  clamp_undo_seconds,
  undo_send_is_active,
} from "@/components/settings/behavior_section/shared";
import { apply_spam_settings_patch } from "@/components/settings/behavior_section/spam_settings_sync";
import { LoadFailedNotice } from "@/components/settings/load_failed_notice";
import { ColorSwatchPicker } from "@/components/settings/appearance/color_swatch_picker";
import { FONT_SIZE_OPTIONS } from "@/components/compose/compose_toolbar/shared";
import {
  DEFAULT_COMPOSE_FONT_COLOR,
  normalize_compose_font_color,
  normalize_compose_font_size,
} from "@/lib/compose_defaults";
import {
  SWIPE_ACTION_OPTIONS,
  get_swipe_action,
} from "@/components/mobile/swipe_action_registry";

const COMPOSE_COLOR_SWATCH_PLACEHOLDER = "#3b82f6";

export function BehaviorSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const lockdown_active = use_lockdown_active();
  const remote_content = displayed_remote_content_setting(
    preferences,
    lockdown_active,
  );
  const remote_content_locked = remote_content.locked_by !== null;
  const remote_content_lock_note =
    remote_content.locked_by === "lockdown"
      ? t("settings.lockdown_content_blocked_note")
      : remote_content.locked_by === "low_network"
        ? t("settings.low_network_mode_active_banner")
        : undefined;
  const { limits, plan_code } = use_plan_limits();
  const is_paid_plan = limits
    ? limits.plan_code !== "free"
    : !!plan_code && plan_code !== "free";

  const [spam_settings, set_spam_settings] = useState<SpamSettings>(
    () => peek_spam_settings() ?? DEFAULT_SPAM_SETTINGS,
  );
  const [spam_settled, set_spam_settled] = useState(
    () => peek_spam_settings() !== null,
  );
  const spam_loaded_ref = useRef(peek_spam_settings() !== null);
  const [spam_load_failed, set_spam_load_failed] = useState(false);
  const spam_generation_ref = useRef(0);
  const [family_policy, set_family_policy] =
    useState<MemberRetentionPolicy | null>(
      () => peek_family_policy()?.value ?? null,
    );
  const [family_policy_settled, set_family_policy_settled] = useState(
    () => peek_family_policy() !== null,
  );
  const is_web = !Capacitor.isNativePlatform();
  const [mailto_registered, set_mailto_registered] = useState(() => {
    try {
      return localStorage.getItem("aster:mailto_handler") === "true";
    } catch {
      return false;
    }
  });

  const handle_mailto_toggle = () => {
    if (!mailto_registered) {
      try {
        navigator.registerProtocolHandler(
          "mailto",
          `${window.location.origin}/?compose=true&to=%s`,
        );
        set_mailto_registered(true);
        localStorage.setItem("aster:mailto_handler", "true");
      } catch {
        set_mailto_registered(false);
      }
    } else {
      set_mailto_registered(false);
      try {
        localStorage.setItem("aster:mailto_handler", "false");
      } catch (caught) {
        ignore_error("settings/behavior_section:handle_mailto_toggle", caught);
      }
    }
  };

  const load_spam_settings = () => {
    const generation = ++spam_generation_ref.current;

    get_spam_settings()
      .then((result) => {
        if (generation !== spam_generation_ref.current) return;

        if (result.data) {
          spam_loaded_ref.current = true;
          remember_spam_settings(result.data);
          set_spam_settings(result.data);
          set_spam_load_failed(false);

          return;
        }
        set_spam_load_failed(true);
      })
      .catch((caught) => {
        if (generation === spam_generation_ref.current) {
          set_spam_load_failed(true);
        }
        ignore_error(
          "pages/mobile/settings/behavior_section:get_spam_settings",
          caught,
        );
      })
      .finally(() => set_spam_settled(true));
  };

  useEffect(() => {
    load_spam_settings();
    get_member_retention_policy()
      .then((result) => {
        remember_family_policy(result.data ?? null);
        if (result.data) set_family_policy(result.data);
      })
      .catch((caught) =>
        ignore_error(
          "pages/mobile/settings/behavior_section:get_member_retention_policy",
          caught,
        ),
      )
      .finally(() => set_family_policy_settled(true));
  }, []);

  useEffect(() => {
    if (spam_loaded_ref.current) remember_spam_settings(spam_settings);
  }, [spam_settings]);

  const update_spam_settings = (patch: Partial<SpamSettings>) => {
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

  const conversation_order_options: { value: "asc" | "desc"; label: string }[] =
    [
      { value: "asc", label: t("settings.oldest_first") },
      { value: "desc", label: t("settings.newest_first") },
    ];

  const spam_sensitivity_options: { value: string; label: string }[] = [
    { value: "low", label: t("settings.spam_low") },
    { value: "medium", label: t("settings.spam_medium") },
    { value: "high", label: t("settings.spam_high") },
  ];

  const spam_retention_options: { value: string; label: string }[] = [
    { value: "7", label: t("settings.retention_7_days") },
    { value: "14", label: t("settings.retention_14_days") },
    { value: "30", label: t("settings.retention_30_days") },
    { value: "60", label: t("settings.retention_60_days") },
    { value: "90", label: t("settings.retention_90_days") },
    { value: "180", label: t("settings.retention_180_days") },
    { value: "365", label: t("settings.retention_365_days") },
    { value: "never", label: t("settings.retention_never") },
  ];

  const build_retention_options = (current: string) =>
    spam_retention_options.some((option) => option.value === current)
      ? spam_retention_options
      : [
          ...spam_retention_options,
          {
            value: current,
            label: t("settings.retention_days_count", { days: current }),
          },
        ];

  const compose_font_size_options = FONT_SIZE_OPTIONS.map((option) => ({
    value: option.value,
    label: t(option.label_key),
  }));
  const compose_font_size = normalize_compose_font_size(
    preferences.compose_font_size,
  );
  const compose_font_color = normalize_compose_font_color(
    preferences.compose_font_color,
  );
  const has_compose_font_color =
    compose_font_color !== DEFAULT_COMPOSE_FONT_COLOR;

  const commit_compose_font_color = (value: string) => {
    update_preference(
      "compose_font_color",
      normalize_compose_font_color(value),
      true,
    );
  };

  const mark_read_options: {
    value: "immediate" | "1_second" | "3_seconds" | "never";
    label: string;
  }[] = [
    { value: "immediate", label: t("settings.immediately") },
    { value: "1_second", label: t("settings.after_1_second") },
    { value: "3_seconds", label: t("settings.after_3_seconds") },
    { value: "never", label: t("settings.never_manual") },
  ];

  const reply_options: { value: "reply" | "reply_all"; label: string }[] = [
    { value: "reply", label: t("settings.reply_to_sender") },
    { value: "reply_all", label: t("settings.reply_to_all") },
  ];

  const image_loading_options: {
    value: "never" | "ask" | "always";
    label: string;
  }[] = [
    { value: "never", label: t("settings.remote_images_never") },
    { value: "ask", label: t("settings.remote_images_ask") },
    { value: "always", label: t("settings.remote_images_always") },
  ];

  const auto_advance_options = [
    { value: "Go to next message", label: t("settings.auto_advance_next") },
    {
      value: "Go to previous message",
      label: t("settings.auto_advance_previous"),
    },
    {
      value: "Go back to message list",
      label: t("settings.auto_advance_back"),
    },
  ];

  const undo_presets = UNDO_PRESET_SECONDS;
  const [undo_custom_input, set_undo_custom_input] = useState<string | null>(
    null,
  );
  const undo_send_active = undo_send_is_active(
    preferences.undo_send_enabled,
    preferences.undo_send_seconds,
  );
  const undo_current_seconds = clamp_undo_seconds(
    preferences.undo_send_seconds ?? UNDO_DEFAULT_SECONDS,
  );
  const undo_custom_matches_preset = undo_presets.includes(
    undo_current_seconds as (typeof undo_presets)[number],
  );

  const signature_mode_options: {
    value: "disabled" | "auto" | "manual";
    label: string;
  }[] = [
    { value: "disabled", label: t("settings.signature_off") },
    { value: "auto", label: t("settings.signature_auto") },
    { value: "manual", label: t("settings.signature_manual") },
  ];

  const lock_mode_options: { value: "session" | "on_leave"; label: string }[] =
    [
      { value: "session", label: t("settings.lock_mode_session") },
      { value: "on_leave", label: t("settings.lock_mode_on_leave") },
    ];

  if (!behavior_section_ready({ spam_settled, family_policy_settled })) {
    return (
      <div className="flex h-full flex-col">
        <SettingsHeader
          on_back={on_back}
          on_close={on_close}
          title={t("settings.behavior")}
        />
        <div className="flex flex-1 items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.behavior")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <SettingsGroup title={t("settings.mark_as_read")}>
          <OptionList
            on_change={(v) => update_preference("mark_as_read_delay", v, true)}
            options={mark_read_options}
            value={preferences.mark_as_read_delay}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.auto_advance")}>
          <OptionList
            on_change={(v) => update_preference("auto_advance", v, true)}
            options={auto_advance_options}
            value={preferences.auto_advance}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.default_reply")}>
          <OptionList
            on_change={(v) =>
              update_preference("default_reply_behavior", v, true)
            }
            options={reply_options}
            value={preferences.default_reply_behavior}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.composing_and_replies")}>
          <SettingsRow
            description={t("settings.compose_from_selected_alias_description")}
            label={t("settings.compose_from_selected_alias")}
            trailing={
              <Switch
                checked={preferences.compose_from_selected_alias === true}
                onCheckedChange={(v) =>
                  update_preference("compose_from_selected_alias", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.compose_defaults_title")}>
          <OptionList
            on_change={(v) =>
              update_preference(
                "compose_font_size",
                normalize_compose_font_size(v),
                true,
              )
            }
            options={compose_font_size_options}
            value={compose_font_size}
          />
          <SettingsRow
            label={t("settings.compose_default_font_color")}
            trailing={
              <div className="flex items-center gap-3">
                <ColorSwatchPicker
                  label={t("settings.compose_default_font_color_picker_label")}
                  size="sm"
                  value={
                    has_compose_font_color
                      ? compose_font_color
                      : COMPOSE_COLOR_SWATCH_PLACEHOLDER
                  }
                  onChange={commit_compose_font_color}
                />
                <button
                  className="rounded-[var(--aster-radius-control)] border border-[var(--border-primary)] px-3 py-1.5 text-[13px] text-[var(--text-primary)] disabled:opacity-50"
                  disabled={!has_compose_font_color}
                  type="button"
                  onClick={() =>
                    commit_compose_font_color(DEFAULT_COMPOSE_FONT_COLOR)
                  }
                >
                  {t("settings.compose_default_font_color_reset")}
                </button>
              </div>
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.reply_defaults_title")}>
          <SettingsRow
            description={t("settings.reply_include_quoted_description")}
            label={t("settings.reply_include_quoted")}
            trailing={
              <Switch
                checked={preferences.reply_include_quoted !== false}
                onCheckedChange={() =>
                  update_preference(
                    "reply_include_quoted",
                    preferences.reply_include_quoted === false,
                    true,
                  )
                }
              />
            }
          />
          <SettingsRow
            description={t("settings.reply_prefix_subject_description")}
            label={t("settings.reply_prefix_subject")}
            trailing={
              <Switch
                checked={preferences.reply_prefix_subject !== false}
                onCheckedChange={() =>
                  update_preference(
                    "reply_prefix_subject",
                    preferences.reply_prefix_subject === false,
                    true,
                  )
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.reading_and_conversations")}>
          <SettingsRow
            label={t("settings.conversation_grouping")}
            trailing={
              <Switch
                checked={preferences.conversation_grouping !== false}
                onCheckedChange={() =>
                  update_preference(
                    "conversation_grouping",
                    preferences.conversation_grouping === false,
                    true,
                  )
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.quick_preview_text")}
            trailing={
              <Switch
                checked={preferences.show_email_preview !== false}
                onCheckedChange={(v) =>
                  update_preference("show_email_preview", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.sender_pictures")}
            trailing={
              <Switch
                checked={preferences.show_profile_pictures !== false}
                onCheckedChange={(v) =>
                  update_preference("show_profile_pictures", v, true)
                }
              />
            }
          />
          <SettingsRow
            description={t("settings.sender_logos_description")}
            label={t("settings.sender_logos")}
            trailing={
              <Switch
                checked={preferences.hide_sender_logos !== true}
                onCheckedChange={(v) =>
                  update_preference("hide_sender_logos", !v, true)
                }
              />
            }
          />
          <SettingsRow
            description={t("settings.relative_dates_description")}
            label={t("settings.relative_dates")}
            trailing={
              <Switch
                checked={preferences.relative_dates !== false}
                onCheckedChange={(v) =>
                  update_preference("relative_dates", v, true)
                }
              />
            }
          />
          <div className="px-4 py-3.5">
            <span className="block text-[15px] text-[var(--text-primary)]">
              {t("settings.emoji_skin_tone")}
            </span>
            <span className="mt-0.5 block text-[13px] text-[var(--text-muted)]">
              {t("settings.emoji_skin_tone_description")}
            </span>
            <div className="mt-2.5">
              <SkinToneSwatches
                label={t("settings.emoji_skin_tone")}
                value={normalize_skin_tone(preferences.emoji_skin_tone)}
                on_change={(tone) =>
                  update_preference("emoji_skin_tone", tone, true)
                }
              />
            </div>
          </div>
          <SettingsRow
            label={t("settings.show_alias_indicators")}
            trailing={
              <Switch
                checked={preferences.show_alias_indicators !== false}
                onCheckedChange={(v) =>
                  update_preference("show_alias_indicators", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.force_dark_mode_emails")}
            trailing={
              <Switch
                checked={preferences.force_dark_mode_emails}
                onCheckedChange={(v) =>
                  update_preference("force_dark_mode_emails", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.conversation_order")}>
          <OptionList
            on_change={(v) => update_preference("conversation_order", v, true)}
            options={conversation_order_options}
            value={preferences.conversation_order ?? "asc"}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.html_content_section_title")}>
          <SettingsRow
            description={t("settings.prefer_plain_text_description")}
            label={t("settings.prefer_plain_text_label")}
            trailing={
              <Switch
                checked={preferences.prefer_plain_text}
                onCheckedChange={(v) =>
                  update_preference("prefer_plain_text", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.html_rendering_mode_label")}
            trailing={
              <Switch
                checked={preferences.html_rendering_mode === "plain_text"}
                onCheckedChange={() =>
                  update_preference(
                    "html_rendering_mode",
                    preferences.html_rendering_mode === "plain_text"
                      ? "html"
                      : "plain_text",
                    true,
                  )
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.images_section_title")}>
          <SettingsRow
            description={remote_content_lock_note}
            label={t("settings.block_remote_images_label")}
            trailing={
              <Switch
                checked={remote_content.blocks_images}
                disabled={remote_content_locked}
                onCheckedChange={(v) => {
                  update_preferences(
                    image_mode_update(v ? "never" : "always"),
                    true,
                  );
                }}
              />
            }
          />
          {remote_content.blocks_images && (
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-2">
                {image_loading_options.map((opt) => (
                  <button
                    key={opt.value}
                    aria-pressed={remote_content.image_mode === opt.value}
                    className={`rounded-[var(--aster-radius-control)] px-3 py-1.5 text-[13px] font-medium ${
                      remote_content.image_mode === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    disabled={remote_content_locked}
                    style={
                      remote_content.image_mode === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      update_preferences(image_mode_update(opt.value), true)
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <SettingsRow
            label={t("settings.block_remote_fonts_label")}
            trailing={
              <Switch
                checked={remote_content.blocks_fonts}
                disabled={remote_content_locked}
                onCheckedChange={(v) =>
                  update_preference("block_remote_fonts", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.block_remote_css_label")}
            trailing={
              <Switch
                checked={remote_content.blocks_css}
                disabled={remote_content_locked}
                onCheckedChange={(v) =>
                  update_preference("block_remote_css", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.tracking_protection_title")}>
          <SettingsRow
            label={t("settings.tracking_protection_enabled")}
            trailing={
              <Switch
                checked={preferences.block_external_content}
                onCheckedChange={(v) => {
                  update_preference("block_external_content", v, true);
                  if (v) {
                    update_preference("block_tracking_pixels", true, true);
                  } else {
                    update_preference("block_tracking_pixels", false, true);
                  }
                }}
              />
            }
          />
          {preferences.block_external_content && (
            <>
              <SettingsRow
                label={t("settings.block_spy_pixels")}
                trailing={
                  <Switch
                    checked={preferences.block_tracking_pixels}
                    onCheckedChange={(v) =>
                      update_preference("block_tracking_pixels", v, true)
                    }
                  />
                }
              />
              <SettingsRow
                label={t("settings.block_tracking_links")}
                value={t("common.active")}
              />
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("settings.auto_save_recipients_to_contacts")}>
          <SettingsRow
            label={t("settings.auto_save_recipients_to_contacts")}
            trailing={
              <Switch
                checked={preferences.auto_save_recent_recipients}
                onCheckedChange={(v) =>
                  update_preference("auto_save_recent_recipients", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.reactions_enabled")}>
          <SettingsRow
            label={t("settings.reactions_enabled")}
            trailing={
              <Switch
                checked={preferences.reactions_enabled !== false}
                onCheckedChange={(v) =>
                  update_preference("reactions_enabled", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.undo_send")}>
          <SettingsRow
            label={t("settings.undo_send")}
            trailing={
              <Switch
                checked={undo_send_active}
                onCheckedChange={(v) => {
                  if (!v) {
                    update_preference("undo_send_enabled", false, true);

                    return;
                  }

                  const seconds = clamp_undo_seconds(
                    preferences.undo_send_seconds,
                  );

                  update_preferences(
                    {
                      undo_send_enabled: true,
                      undo_send_seconds: seconds,
                      undo_send_period: `${seconds} seconds`,
                    },
                    true,
                  );
                }}
              />
            }
          />
          {undo_send_active && (
            <div className="px-4 pb-3 pt-1">
              <p className="mb-1.5 text-[13px] text-[var(--text-muted)]">
                {t("settings.cancellation_period")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {undo_presets.map((sec) => (
                  <button
                    key={sec}
                    className={`rounded-[var(--aster-radius-control)] px-3 py-1.5 text-[13px] font-medium ${
                      undo_current_seconds === sec
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={
                      undo_current_seconds === sec
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() => {
                      update_preferences(
                        {
                          undo_send_seconds: sec,
                          undo_send_period: `${sec} seconds`,
                        },
                        true,
                      );
                      set_undo_custom_input(null);
                    }}
                  >
                    {sec}s
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    aria-label={t("common.custom")}
                    className={`h-[30px] w-[4.5rem] rounded-[var(--aster-radius-control)] px-2 text-center text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)] placeholder:text-[var(--text-muted)] ${
                      !undo_custom_matches_preset
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    inputMode="numeric"
                    max={30}
                    min={1}
                    placeholder={t("common.custom")}
                    style={
                      !undo_custom_matches_preset
                        ? chip_selected_style
                        : undefined
                    }
                    type="number"
                    value={
                      undo_custom_input ??
                      (undo_custom_matches_preset ? "" : undo_current_seconds)
                    }
                    onBlur={(e) => {
                      const parsed = parse_bounded_int(e.target.value, 1, 30);

                      if (parsed !== null) {
                        update_preferences(
                          {
                            undo_send_seconds: parsed,
                            undo_send_period: `${parsed} seconds`,
                          },
                          true,
                        );
                      }
                      set_undo_custom_input(null);
                    }}
                    onChange={(e) => set_undo_custom_input(e.target.value)}
                    onFocus={(e) => set_undo_custom_input(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <span className="text-[13px] text-[var(--text-muted)]">
                    s
                  </span>
                </div>
              </div>
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("settings.signature")}>
          <OptionList
            on_change={(v) => update_preference("signature_mode", v, true)}
            options={signature_mode_options}
            value={preferences.signature_mode}
          />
          <SettingsRow
            label={t("settings.show_aster_branding")}
            trailing={
              is_paid_plan ? (
                <Switch
                  checked={preferences.show_aster_branding}
                  onCheckedChange={(v) =>
                    update_preference("show_aster_branding", v, true)
                  }
                />
              ) : (
                <PlanUpgradeButton
                  feature="has_remove_branding"
                  message={t("settings.feature_requires_upgrade")}
                />
              )
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.confirmations")}>
          <SettingsRow
            label={t("settings.confirm_delete")}
            trailing={
              <Switch
                checked={preferences.confirm_before_delete}
                onCheckedChange={(v) =>
                  update_preference("confirm_before_delete", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.confirm_permanent_delete")}
            trailing={
              <Switch
                checked={preferences.confirm_before_permanent_delete !== false}
                onCheckedChange={(v) =>
                  update_preference("confirm_before_permanent_delete", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.confirm_archive")}
            trailing={
              <Switch
                checked={preferences.confirm_before_archive}
                onCheckedChange={(v) =>
                  update_preference("confirm_before_archive", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.confirm_spam")}
            trailing={
              <Switch
                checked={preferences.confirm_before_spam}
                onCheckedChange={(v) =>
                  update_preference("confirm_before_spam", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.spam_filtering_title")}>
          {spam_load_failed && (
            <div className="px-4 py-3">
              <LoadFailedNotice on_retry={load_spam_settings} />
            </div>
          )}
          {!spam_load_failed && (
            <>
              <SettingsRow
                label={t("settings.spam_filter_enabled")}
                trailing={
                  <Switch
                    checked={spam_settings.spam_filter_enabled}
                    onCheckedChange={() =>
                      update_spam_settings({
                        spam_filter_enabled: !spam_settings.spam_filter_enabled,
                      })
                    }
                  />
                }
              />
              {spam_settings.spam_filter_enabled && (
                <>
                  <div className="px-4 py-2">
                    <p className="mb-2 text-[13px] text-[var(--text-muted)]">
                      {t("settings.spam_sensitivity")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {spam_sensitivity_options.map((opt) => (
                        <button
                          key={opt.value}
                          className={`rounded-[var(--aster-radius-control)] px-3 py-1.5 text-[13px] font-medium ${
                            spam_settings.spam_sensitivity === opt.value
                              ? "text-white"
                              : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                          }`}
                          style={
                            spam_settings.spam_sensitivity === opt.value
                              ? chip_selected_style
                              : undefined
                          }
                          type="button"
                          onClick={() =>
                            update_spam_settings({
                              spam_sensitivity: opt.value,
                            })
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-4 py-2">
                    <p className="mb-2 text-[13px] text-[var(--text-muted)]">
                      {t("settings.auto_delete_spam_after")}
                    </p>
                    {(() => {
                      const spam_locked =
                        !!family_policy?.enforce_on_members &&
                        family_policy.spam_retention_days != null;
                      const spam_enforced = spam_locked;
                      const effective_value = spam_locked
                        ? family_policy!.spam_retention_days === 0
                          ? "never"
                          : String(family_policy!.spam_retention_days)
                        : spam_settings.spam_retention_days === 0
                          ? "never"
                          : String(spam_settings.spam_retention_days);

                      return (
                        <>
                          {spam_locked && (
                            <p className="mb-2 flex items-center gap-1 text-[12px] text-amber-500">
                              <LockClosedIcon className="h-3 w-3 flex-shrink-0" />
                              {t("settings.controlled_by_family_admin")}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {build_retention_options(effective_value).map(
                              (opt) => (
                                <button
                                  key={opt.value}
                                  className={`rounded-[var(--aster-radius-control)] px-3 py-1.5 text-[13px] font-medium ${
                                    effective_value === opt.value
                                      ? "text-white"
                                      : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                                  } ${spam_enforced ? "opacity-60 cursor-not-allowed" : ""}`}
                                  disabled={spam_enforced}
                                  style={
                                    effective_value === opt.value
                                      ? chip_selected_style
                                      : undefined
                                  }
                                  type="button"
                                  onClick={() => {
                                    if (spam_enforced) return;
                                    update_spam_settings({
                                      spam_retention_days:
                                        opt.value === "never"
                                          ? 0
                                          : parseInt(opt.value, 10),
                                    });
                                  }}
                                >
                                  {opt.label}
                                </button>
                              ),
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("mail.trash")}>
          {!spam_load_failed && (
            <div className="px-4 py-2">
              <p className="text-[13px] text-[var(--text-muted)]">
                {t("settings.auto_delete_trash_after")}
              </p>
              <p className="mb-2 text-[12px] text-[var(--text-muted)]">
                {t("settings.auto_delete_trash_description")}
              </p>
              {(() => {
                const trash_locked =
                  !!family_policy?.enforce_on_members &&
                  family_policy.trash_retention_days != null;
                const effective_value = trash_locked
                  ? family_policy!.trash_retention_days === 0
                    ? "never"
                    : String(family_policy!.trash_retention_days)
                  : spam_settings.trash_retention_days === 0
                    ? "never"
                    : String(spam_settings.trash_retention_days);

                return (
                  <>
                    {trash_locked && (
                      <p className="mb-2 flex items-center gap-1 text-[12px] text-amber-500">
                        <LockClosedIcon className="h-3 w-3 flex-shrink-0" />
                        {t("settings.controlled_by_family_admin")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {build_retention_options(effective_value).map((opt) => (
                        <button
                          key={opt.value}
                          className={`rounded-[var(--aster-radius-control)] px-3 py-1.5 text-[13px] font-medium ${
                            effective_value === opt.value
                              ? "text-white"
                              : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                          } ${trash_locked ? "opacity-60 cursor-not-allowed" : ""}`}
                          disabled={trash_locked}
                          style={
                            effective_value === opt.value
                              ? chip_selected_style
                              : undefined
                          }
                          type="button"
                          onClick={() => {
                            if (trash_locked) return;
                            update_spam_settings({
                              trash_retention_days:
                                opt.value === "never"
                                  ? 0
                                  : parseInt(opt.value, 10),
                            });
                          }}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title={t("settings.haptic_feedback_title")}>
          <SettingsRow
            label={t("settings.haptic_feedback_label")}
            trailing={
              <Switch
                checked={preferences.haptic_enabled}
                onCheckedChange={(v) =>
                  update_preference("haptic_enabled", v, true)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.protected_folders")}>
          <OptionList
            on_change={(v) =>
              update_preference("protected_folder_lock_mode", v, true)
            }
            options={lock_mode_options}
            value={preferences.protected_folder_lock_mode}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.swipe_actions")}>
          <div className="px-4 py-2">
            <p className="mb-3 text-[12px] text-[var(--text-muted)]">
              {t("settings.swipe_actions_description")}
            </p>
            <p className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">
              {t("settings.swipe_left")}
            </p>
            <div className="mb-3 overflow-hidden rounded-xl bg-[var(--mobile-bg-card-hover)]">
              {SWIPE_ACTION_OPTIONS.map((id) => {
                const def = get_swipe_action(id);

                return (
                  <button
                    key={id}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-[var(--mobile-bg-card-hover)]"
                    type="button"
                    onClick={() =>
                      update_preference("swipe_left_action", id, true)
                    }
                  >
                    {def && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: def.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                      {def
                        ? t(
                            (def.settings_label_key ??
                              def.label_key) as "mail.archive",
                          )
                        : t("settings.swipe_none")}
                    </span>
                    {preferences.swipe_left_action === id && (
                      <CheckIcon className="h-5 w-5 shrink-0 text-[var(--accent-color,#3b82f6)]" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mb-2 text-[13px] font-medium text-[var(--text-primary)]">
              {t("settings.swipe_right")}
            </p>
            <div className="mb-1 overflow-hidden rounded-xl bg-[var(--mobile-bg-card-hover)]">
              {SWIPE_ACTION_OPTIONS.map((id) => {
                const def = get_swipe_action(id);

                return (
                  <button
                    key={id}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start active:bg-[var(--mobile-bg-card-hover)]"
                    type="button"
                    onClick={() =>
                      update_preference("swipe_right_action", id, true)
                    }
                  >
                    {def && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: def.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                      {def
                        ? t(
                            (def.settings_label_key ??
                              def.label_key) as "mail.archive",
                          )
                        : t("settings.swipe_none")}
                    </span>
                    {preferences.swipe_right_action === id && (
                      <CheckIcon className="h-5 w-5 shrink-0 text-[var(--accent-color,#3b82f6)]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </SettingsGroup>

        <SettingsGroup title={t("settings.customize_toolbar")}>
          <div className="px-4 py-2">
            <p className="mb-3 text-[12px] text-[var(--text-muted)]">
              {t("settings.customize_toolbar_description")}
            </p>
            {[
              { id: "star", label: t("mail.star"), group: "quick" },
              { id: "mark_read", label: t("mail.mark_read"), group: "quick" },
              { id: "print", label: t("mail.print"), group: "quick" },
              {
                id: "archive",
                label: t("mail.archive_action"),
                group: "organize",
              },
              { id: "spam", label: t("mail.report_spam"), group: "organize" },
              {
                id: "trash",
                label: t("mail.move_to_trash"),
                group: "organize",
              },
            ].map((action) => {
              const current = preferences.mobile_toolbar_actions ?? [
                "trash",
                "star",
              ];
              const is_enabled = current.includes(action.id);

              return (
                <div
                  key={action.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-[14px] text-[var(--text-primary)]">
                    {action.label}
                  </span>
                  <Switch
                    aria-label={action.label}
                    checked={is_enabled}
                    disabled={is_enabled && current.length <= 1}
                    onCheckedChange={(checked) => {
                      if (!checked && current.length <= 1) return;
                      const next = checked
                        ? [...current, action.id]
                        : current.filter((a: string) => a !== action.id);

                      update_preference("mobile_toolbar_actions", next, true);
                    }}
                  />
                </div>
              );
            })}
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              {t("settings.toolbar_dots_hint")}
            </p>
          </div>
        </SettingsGroup>

        <MobileSidebarLayoutGroups />

        {is_web && (
          <SettingsGroup title={t("settings.advanced")}>
            <SettingsRow
              label={t("settings.default_email_app")}
              trailing={
                <Switch
                  checked={mailto_registered}
                  onCheckedChange={handle_mailto_toggle}
                />
              }
            />
          </SettingsGroup>
        )}
      </div>
    </div>
  );
}
