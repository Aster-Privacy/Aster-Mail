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
import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Switch } from "@aster/ui";
import {
  BookOpenIcon,
  PencilSquareIcon,
  LockClosedIcon,
  ArrowUturnLeftIcon,
  QuestionMarkCircleIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { get_dev_mode, save_dev_mode } from "@/services/api/preferences";
import { get_vault_from_memory } from "@/services/crypto/memory_key_store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface ToggleSettingProps {
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
}

function ToggleSetting({
  title,
  description,
  enabled,
  on_toggle,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <Switch checked={enabled} onCheckedChange={on_toggle} />
    </div>
  );
}

interface SelectSettingProps {
  title: string;
  description: string;
  value: string;
  options: { value: string; label: string }[];
  on_change: (value: string) => void;
}

function SelectSetting({
  title,
  description,
  value,
  options,
  on_change,
}: SelectSettingProps) {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <Select value={value} onValueChange={on_change}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const UNDO_PRESET_SECONDS = [3, 5, 10, 15, 30] as const;
const UNDO_MIN_SECONDS = 1;
const UNDO_MAX_SECONDS = 30;
const UNDO_DEFAULT_SECONDS = 10;

function clamp_undo_seconds(value: number): number {
  if (!Number.isFinite(value) || value < UNDO_MIN_SECONDS) {
    return UNDO_DEFAULT_SECONDS;
  }

  return Math.min(value, UNDO_MAX_SECONDS);
}

export function BehaviorSection() {
  const { preferences, update_preference, update_preferences } =
    use_preferences();
  const { t } = use_i18n();
  const [undo_input_value, set_undo_input_value] = useState<string | null>(
    null,
  );
  const [dev_mode_enabled, set_dev_mode_enabled] = useState(false);
  const [show_grouping_dialog, set_show_grouping_dialog] = useState(false);
  const [mailto_registered, set_mailto_registered] = useState(() => {
    try {
      return localStorage.getItem("aster:mailto_handler") === "true";
    } catch {
      return false;
    }
  });
  const is_web = !Capacitor.isNativePlatform();

  useEffect(() => {
    const vault = get_vault_from_memory();

    get_dev_mode(vault).then((result) => set_dev_mode_enabled(result.data));
  }, []);

  const handle_dev_mode_toggle = async () => {
    const vault = get_vault_from_memory();

    if (!vault) return;

    const new_value = !dev_mode_enabled;

    set_dev_mode_enabled(new_value);
    await save_dev_mode(new_value, vault);
    window.dispatchEvent(
      new CustomEvent("dev-mode-changed", { detail: new_value }),
    );
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
      localStorage.setItem("aster:mailto_handler", "false");
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

        <div className="flex items-center justify-between py-4">
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.conversation_grouping")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.conversation_grouping_description")}
            </p>
          </div>
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
          <div className="flex-1 pr-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.show_message_size")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.show_message_size_description")}
            </p>
          </div>
          <Switch
            checked={preferences.show_message_size === true}
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
          description={t("settings.force_dark_mode_emails_description")}
          enabled={preferences.force_dark_mode_emails}
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
      </div>

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

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <ArrowUturnLeftIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.undo_send")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <ToggleSetting
          description={t("settings.undo_send_delay_description")}
          enabled={preferences.undo_send_enabled ?? true}
          on_toggle={() => {
            const undo_enabled = preferences.undo_send_enabled ?? true;

            if (undo_enabled) {
              update_preferences({ undo_send_enabled: false }, true);
            } else {
              const seconds = clamp_undo_seconds(
                preferences.undo_send_seconds ?? UNDO_DEFAULT_SECONDS,
              );

              update_preferences({
                undo_send_enabled: true,
                undo_send_seconds: seconds,
                undo_send_period: `${seconds} seconds`,
              }, true);
            }
          }}
          title={t("settings.enable_undo_send")}
        />

        {(preferences.undo_send_enabled ?? true) && (
          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1 pr-4">
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

                    update_preferences({
                      undo_send_seconds: clamped,
                      undo_send_period: `${clamped} seconds`,
                    }, true);
                    set_undo_input_value(null);
                  }}
                  onChange={(e) => {
                    set_undo_input_value(e.target.value);
                  }}
                  onFocus={(e) => set_undo_input_value(e.target.value)}
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
                      "px-3 py-1.5 text-xs rounded-md transition-colors",
                      current === seconds
                        ? "bg-[var(--accent-blue)] text-white"
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
                      update_preferences({
                        undo_send_seconds: seconds,
                        undo_send_period: `${seconds} seconds`,
                      }, true);
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
            <Cog6ToothIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.advanced")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        {is_web && (
          <ToggleSetting
            description={t("settings.default_email_app_description")}
            enabled={mailto_registered}
            on_toggle={handle_mailto_toggle}
            title={t("settings.default_email_app")}
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
