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
import { Switch } from "@aster/ui";

import { SettingsGroup, SettingsHeader, SettingsRow } from "./shared";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  subscribe_to_push,
  unsubscribe_from_push,
} from "@/services/push_subscription";

type PermissionState = "granted" | "denied" | "default" | "unsupported";

function get_permission_state(): PermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function NotificationsSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const { is_feature_locked } = use_plan_limits();
  const [permission_state, set_permission_state] =
    useState<PermissionState>(get_permission_state);

  const quiet_start = preferences.quiet_hours_start || "22:00";
  const quiet_end = preferences.quiet_hours_end || "07:00";

  const handle_desktop_toggle = async () => {
    const new_value = !preferences.desktop_notifications;

    if (new_value) {
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
        if (result !== "granted") return;
      }
      update_preference("desktop_notifications", true, true);
      set_permission_state("granted");
      subscribe_to_push();

      return;
    }
    update_preference("desktop_notifications", false, true);
    unsubscribe_from_push();
  };

  const handle_push_toggle = (v: boolean) => {
    update_preference("push_notifications", v, true);
    if (v) {
      subscribe_to_push();
    } else {
      unsubscribe_from_push();
    }
  };

  const desktop_blocked =
    permission_state === "denied"
      ? t("settings.blocked_by_browser")
      : permission_state === "unsupported"
        ? t("settings.notifications_not_supported")
        : null;

  return (
    <div className="flex h-full flex-col">
      <SettingsHeader
        on_back={on_back}
        on_close={on_close}
        title={t("settings.notifications")}
      />
      <div className="flex-1 overflow-y-auto pb-8">
        <SettingsGroup title={t("settings.channels")}>
          <SettingsRow
            label={t("settings.desktop_notifications")}
            trailing={
              <Switch
                checked={preferences.desktop_notifications}
                onCheckedChange={handle_desktop_toggle}
              />
            }
          />
          {desktop_blocked && (
            <div className="px-4 pb-2">
              <p className="text-[12px] text-[var(--text-muted)]">
                {desktop_blocked}
              </p>
            </div>
          )}
          <SettingsRow
            label={t("settings.sound_new_notifications")}
            trailing={
              <Switch
                checked={preferences.sound}
                onCheckedChange={(v) => update_preference("sound", v, true)}
              />
            }
          />
          <SettingsRow
            label={t("common.push_notifications")}
            trailing={
              <Switch
                checked={preferences.push_notifications}
                onCheckedChange={handle_push_toggle}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.events")}>
          <SettingsRow
            label={t("settings.new_emails")}
            trailing={
              <Switch
                checked={preferences.notify_new_email}
                onCheckedChange={(v) =>
                  update_preference("notify_new_email", v, true)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.replies")}
            trailing={
              <Switch
                checked={preferences.notify_replies}
                onCheckedChange={(v) => update_preference("notify_replies", v, true)}
              />
            }
          />
          <SettingsRow
            label={t("settings.mentions")}
            trailing={
              <Switch
                checked={preferences.notify_mentions}
                onCheckedChange={(v) => update_preference("notify_mentions", v, true)}
              />
            }
          />
        </SettingsGroup>

        <UpgradeGate
          description={t("settings.quiet_hours_locked")}
          feature_name={t("settings.quiet_hours")}
          is_locked={is_feature_locked("has_quiet_hours")}
          min_plan="Star"
        >
          <SettingsGroup title={t("settings.quiet_hours")}>
            <SettingsRow
              label={t("settings.quiet_hours")}
              trailing={
                <Switch
                  checked={preferences.quiet_hours_enabled}
                  onCheckedChange={(v) =>
                    update_preference("quiet_hours_enabled", v, true)
                  }
                />
              }
            />
            {preferences.quiet_hours_enabled && (
              <>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[15px] text-[var(--text-primary)]">
                    {t("settings.from")}
                  </span>
                  <Input
                    className="ml-auto"
                    type="time"
                    value={quiet_start}
                    onChange={(e) =>
                      update_preference(
                        "quiet_hours_start",
                        e.target.value,
                        true,
                      )
                    }
                  />
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-[15px] text-[var(--text-primary)]">
                    {t("settings.to")}
                  </span>
                  <Input
                    className="ml-auto"
                    type="time"
                    value={quiet_end}
                    onChange={(e) =>
                      update_preference("quiet_hours_end", e.target.value, true)
                    }
                  />
                </div>
              </>
            )}
          </SettingsGroup>
        </UpgradeGate>
      </div>
    </div>
  );
}
