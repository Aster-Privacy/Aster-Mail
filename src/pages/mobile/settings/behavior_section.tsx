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
import { useState } from "react";
import { CheckIcon } from "@heroicons/react/24/outline";
import { Switch } from "@aster/ui";

import {
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  OptionList,
  chip_selected_style,
} from "./shared";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import { Input } from "@/components/ui/input";
import {
  SWIPE_ACTION_OPTIONS,
  get_swipe_action,
} from "@/components/mobile/swipe_action_registry";

export function BehaviorSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const { limits } = use_plan_limits();
  const is_paid_plan = !!limits && limits.plan_code !== "free";

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

  const undo_presets = [3, 5, 10, 15, 30];
  const [undo_custom_input, set_undo_custom_input] = useState<string | null>(
    null,
  );
  const undo_custom_matches_preset = undo_presets.includes(
    preferences.undo_send_seconds,
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
            on_change={(v) => update_preference("mark_as_read_delay", v)}
            options={mark_read_options}
            value={preferences.mark_as_read_delay}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.default_reply")}>
          <OptionList
            on_change={(v) => update_preference("default_reply_behavior", v)}
            options={reply_options}
            value={preferences.default_reply_behavior}
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.images_section_title")}>
          <SettingsRow
            label={t("settings.block_remote_images_label")}
            trailing={
              <Switch
                checked={preferences.block_remote_images}
                onCheckedChange={(v) => {
                  update_preference("block_remote_images", v);
                  if (v) {
                    update_preference("load_remote_images", "never");
                  } else {
                    update_preference("load_remote_images", "always");
                  }
                }}
              />
            }
          />
          {preferences.block_remote_images && (
            <div className="px-4 py-2">
              <div className="flex flex-wrap gap-2">
                {image_loading_options.map((opt) => (
                  <button
                    key={opt.value}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                      preferences.load_remote_images === opt.value
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={
                      preferences.load_remote_images === opt.value
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      update_preference("load_remote_images", opt.value)
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
                checked={preferences.block_remote_fonts}
                onCheckedChange={(v) =>
                  update_preference("block_remote_fonts", v)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.block_remote_css_label")}
            trailing={
              <Switch
                checked={preferences.block_remote_css}
                onCheckedChange={(v) =>
                  update_preference("block_remote_css", v)
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
                  update_preference("block_external_content", v);
                  if (v) {
                    update_preference("block_tracking_pixels", true);
                  } else {
                    update_preference("block_tracking_pixels", false);
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
                      update_preference("block_tracking_pixels", v)
                    }
                  />
                }
              />
              <SettingsRow
                label={t("settings.block_tracking_links")}
                trailing={
                  <Switch checked={preferences.block_external_content} disabled />
                }
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
                  update_preference("auto_save_recent_recipients", v)
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
                checked={preferences.undo_send_enabled}
                onCheckedChange={(v) =>
                  update_preference("undo_send_enabled", v)
                }
              />
            }
          />
          {preferences.undo_send_enabled && (
            <div className="px-4 pb-3 pt-1">
              <p className="mb-1.5 text-[13px] text-[var(--text-muted)]">
                {t("settings.cancellation_period")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {undo_presets.map((sec) => (
                  <button
                    key={sec}
                    className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                      preferences.undo_send_seconds === sec
                        ? "text-white"
                        : "bg-[var(--mobile-bg-card-hover)] text-[var(--text-secondary)]"
                    }`}
                    style={
                      preferences.undo_send_seconds === sec
                        ? chip_selected_style
                        : undefined
                    }
                    type="button"
                    onClick={() => {
                      update_preference("undo_send_seconds", sec);
                      set_undo_custom_input(null);
                    }}
                  >
                    {sec}s
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    className={`w-14 text-center font-medium ${
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
                      (undo_custom_matches_preset
                        ? ""
                        : preferences.undo_send_seconds)
                    }
                    onBlur={(e) => {
                      const parsed = parseInt(e.target.value, 10);

                      if (
                        Number.isFinite(parsed) &&
                        parsed >= 1 &&
                        parsed <= 30
                      ) {
                        update_preference("undo_send_seconds", parsed);
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
            on_change={(v) => update_preference("signature_mode", v)}
            options={signature_mode_options}
            value={preferences.signature_mode}
          />
          <SettingsRow
            label={t("settings.show_aster_branding")}
            trailing={
              <Switch
                checked={preferences.show_aster_branding}
                disabled={!is_paid_plan}
                onCheckedChange={(v) => {
                  if (!is_paid_plan) return;
                  update_preference("show_aster_branding", v);
                }}
              />
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
                  update_preference("confirm_before_delete", v)
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
                  update_preference("confirm_before_archive", v)
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
                  update_preference("confirm_before_spam", v)
                }
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.haptic_feedback_title")}>
          <SettingsRow
            label={t("settings.haptic_feedback_label")}
            trailing={
              <Switch
                checked={preferences.haptic_enabled}
                onCheckedChange={(v) => update_preference("haptic_enabled", v)}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.protected_folders")}>
          <OptionList
            on_change={(v) =>
              update_preference("protected_folder_lock_mode", v)
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
            <div className="mb-3 divide-y divide-[var(--border-primary)] overflow-hidden rounded-xl bg-[var(--mobile-bg-card-hover)]">
              {SWIPE_ACTION_OPTIONS.map((id) => {
                const def = get_swipe_action(id);

                return (
                  <button
                    key={id}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)]"
                    type="button"
                    onClick={() => update_preference("swipe_left_action", id)}
                  >
                    {def && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: def.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                      {def
                        ? t(def.label_key as "mail.archive")
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
            <div className="mb-1 divide-y divide-[var(--border-primary)] overflow-hidden rounded-xl bg-[var(--mobile-bg-card-hover)]">
              {SWIPE_ACTION_OPTIONS.map((id) => {
                const def = get_swipe_action(id);

                return (
                  <button
                    key={id}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--mobile-bg-card-hover)]"
                    type="button"
                    onClick={() => update_preference("swipe_right_action", id)}
                  >
                    {def && (
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: def.color }}
                      />
                    )}
                    <span className="min-w-0 flex-1 text-[15px] text-[var(--text-primary)]">
                      {def
                        ? t(def.label_key as "mail.archive")
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
              { id: "archive", label: t("mail.archive"), group: "organize" },
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
                    checked={is_enabled}
                    disabled={is_enabled && current.length <= 1}
                    onCheckedChange={(checked) => {
                      if (!checked && current.length <= 1) return;
                      const next = checked
                        ? [...current, action.id]
                        : current.filter((a: string) => a !== action.id);

                      update_preference("mobile_toolbar_actions", next);
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
      </div>
    </div>
  );
}
