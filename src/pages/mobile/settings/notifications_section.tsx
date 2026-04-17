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
import { Switch } from "@aster/ui";

import { SettingsGroup, SettingsHeader, SettingsRow } from "./shared";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";
import { Input } from "@/components/ui/input";

export function NotificationsSection({
  on_back,
  on_close,
}: {
  on_back: () => void;
  on_close: () => void;
}) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();

  const quiet_start = preferences.quiet_hours_start || "22:00";
  const quiet_end = preferences.quiet_hours_end || "07:00";

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
                onCheckedChange={(v) =>
                  update_preference("desktop_notifications", v)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.sound_new_notifications")}
            trailing={
              <Switch
                checked={preferences.sound}
                onCheckedChange={(v) => update_preference("sound", v)}
              />
            }
          />
          <SettingsRow
            label={t("common.push_notifications")}
            trailing={
              <Switch
                checked={preferences.push_notifications}
                onCheckedChange={(v) =>
                  update_preference("push_notifications", v)
                }
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
                  update_preference("notify_new_email", v)
                }
              />
            }
          />
          <SettingsRow
            label={t("settings.replies")}
            trailing={
              <Switch
                checked={preferences.notify_replies}
                onCheckedChange={(v) => update_preference("notify_replies", v)}
              />
            }
          />
          <SettingsRow
            label={t("settings.mentions")}
            trailing={
              <Switch
                checked={preferences.notify_mentions}
                onCheckedChange={(v) => update_preference("notify_mentions", v)}
              />
            }
          />
        </SettingsGroup>

        <SettingsGroup title={t("settings.quiet_hours")}>
          <SettingsRow
            label={t("settings.quiet_hours")}
            trailing={
              <Switch
                checked={preferences.quiet_hours_enabled}
                onCheckedChange={(v) =>
                  update_preference("quiet_hours_enabled", v)
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
                    update_preference("quiet_hours_start", e.target.value)
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
                    update_preference("quiet_hours_end", e.target.value)
                  }
                />
              </div>
            </>
          )}
        </SettingsGroup>
      </div>
    </div>
  );
}
