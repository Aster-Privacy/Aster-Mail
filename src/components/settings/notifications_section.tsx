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
import { BellIcon, BellAlertIcon, MoonIcon } from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  subscribe_to_push,
  unsubscribe_from_push,
} from "@/services/push_subscription";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function format_hour_label(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;

  return `${display} ${period}`;
}

function parse_time_value(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");

  return { hour: parseInt(h, 10) || 0, minute: parseInt(m, 10) || 0 };
}

function build_time_value(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function QuietHoursTimeSelect({
  label,
  value,
  on_change,
}: {
  label: string;
  value: string;
  on_change: (value: string) => void;
}) {
  const { hour, minute } = parse_time_value(value);

  return (
    <div className="flex-1">
      <span className="text-xs font-medium block mb-1.5 text-txt-muted">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="flex-1 justify-start font-normal"
              size="md"
              variant="outline"
            >
              {format_hour_label(hour)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-[70] max-h-60 overflow-y-auto">
            {HOURS.map((h) => (
              <DropdownMenuItem
                key={h}
                onClick={() => on_change(build_time_value(h, minute))}
              >
                {format_hour_label(h)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-sm text-txt-muted">:</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="w-14 font-normal" size="md" variant="outline">
              {minute.toString().padStart(2, "0")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-[70] max-h-60 overflow-y-auto">
            {MINUTES.map((m) => (
              <DropdownMenuItem
                key={m}
                onClick={() => on_change(build_time_value(hour, m))}
              >
                {m.toString().padStart(2, "0")}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface ToggleSettingProps {
  title: string;
  description: string;
  enabled: boolean;
  on_toggle: () => void;
  action?: React.ReactNode;
}

function ToggleSetting({
  title,
  description,
  enabled,
  on_toggle,
  action,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {action}
        <Switch checked={enabled} onCheckedChange={on_toggle} />
      </div>
    </div>
  );
}

type PermissionState = "granted" | "denied" | "default" | "unsupported";

function get_permission_state(): PermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function NotificationsSection() {
  const { preferences, update_preference } = use_preferences();
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const [permission_state, set_permission_state] =
    useState<PermissionState>(get_permission_state);

  const handle_desktop_toggle = async () => {
    const new_value = !preferences.desktop_notifications;

    if (new_value) {
      if ("__TAURI_INTERNALS__" in window) {
        try {
          const { isPermissionGranted, requestPermission } = await import(
            "@tauri-apps/plugin-notification"
          );

          let permitted = await isPermissionGranted();

          if (!permitted) {
            const result = await requestPermission();

            permitted = result === "granted";
          }

          if (permitted) {
            set_permission_state("granted");
            update_preference("desktop_notifications", true, true);
            subscribe_to_push();
          } else {
            set_permission_state("denied");
          }
        } catch {
          set_permission_state("denied");
        }

        return;
      }

      if (!("Notification" in window)) {
        set_permission_state("unsupported");

        return;
      }

      const current = Notification.permission;

      if (current === "denied") {
        set_permission_state("denied");

        return;
      }

      if (current === "default") {
        const result = await Notification.requestPermission();

        set_permission_state(
          result === "granted"
            ? "granted"
            : result === "denied"
              ? "denied"
              : "default",
        );

        if (result !== "granted") {
          return;
        }
      }

      update_preference("desktop_notifications", true, true);
      set_permission_state("granted");
      subscribe_to_push();

      return;
    }

    update_preference("desktop_notifications", false, true);
    unsubscribe_from_push();
  };

  const desktop_description =
    permission_state === "denied"
      ? t("settings.blocked_by_browser")
      : permission_state === "unsupported"
        ? t("settings.notifications_not_supported")
        : t("settings.show_desktop_notifications");

  return (
    <div className="space-y-4">
      <SettingsSaveIndicatorInline />

      <div>
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <BellIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.notifications")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <ToggleSetting
          description={desktop_description}
          enabled={preferences.desktop_notifications}
          on_toggle={handle_desktop_toggle}
          title={t("settings.desktop")}
        />
        <ToggleSetting
          description={t("settings.sound_new_notifications")}
          enabled={preferences.sound}
          on_toggle={() => update_preference("sound", !preferences.sound)}
          title={t("settings.sound")}
        />
        <ToggleSetting
          description={t("settings.push_notifications_description")}
          enabled={preferences.push_notifications}
          on_toggle={() =>
            update_preference(
              "push_notifications",
              !preferences.push_notifications,
            )
          }
          title={t("settings.push")}
        />
      </div>

      <div className="pt-3">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
            <BellAlertIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
            {t("settings.events")}
          </h3>
          <div className="mt-2 h-px bg-edge-secondary" />
        </div>

        <ToggleSetting
          description={t("settings.new_email_description")}
          enabled={preferences.notify_new_email}
          on_toggle={() =>
            update_preference("notify_new_email", !preferences.notify_new_email)
          }
          title={t("settings.new_emails")}
        />
        <ToggleSetting
          description={t("settings.replies_description")}
          enabled={preferences.notify_replies}
          on_toggle={() =>
            update_preference("notify_replies", !preferences.notify_replies)
          }
          title={t("settings.replies")}
        />
        <ToggleSetting
          description={t("settings.mentions_description")}
          enabled={preferences.notify_mentions}
          on_toggle={() =>
            update_preference("notify_mentions", !preferences.notify_mentions)
          }
          title={t("settings.mentions")}
        />
      </div>

      <div className="pt-3">
        <UpgradeGate
          description={t("settings.quiet_hours_locked")}
          feature_name={t("settings.quiet_hours")}
          is_locked={is_feature_locked("has_quiet_hours")}
          min_plan="Star"
        >
          <div>
            <div className="mb-4">
              <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
                <MoonIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
                {t("settings.quiet_hours")}
              </h3>
              <div className="mt-2 h-px bg-edge-secondary" />
            </div>

            <ToggleSetting
              description={t("settings.mute_notifications_description")}
              enabled={preferences.quiet_hours_enabled}
              on_toggle={() =>
                update_preference(
                  "quiet_hours_enabled",
                  !preferences.quiet_hours_enabled,
                )
              }
              title={t("settings.enable_quiet_hours")}
            />
            {preferences.quiet_hours_enabled && (
              <div className="py-4">
                <div className="mb-4">
                  <p className="text-sm font-medium text-txt-primary">
                    {t("settings.quiet_hours_schedule")}
                  </p>
                  <p className="text-sm mt-0.5 text-txt-muted">
                    {t("settings.quiet_hours_schedule_description")}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <QuietHoursTimeSelect
                    label={t("settings.from")}
                    on_change={(v) => update_preference("quiet_hours_start", v)}
                    value={preferences.quiet_hours_start}
                  />
                  <QuietHoursTimeSelect
                    label={t("settings.to")}
                    on_change={(v) => update_preference("quiet_hours_end", v)}
                    value={preferences.quiet_hours_end}
                  />
                </div>
              </div>
            )}
          </div>
        </UpgradeGate>
      </div>
    </div>
  );
}
