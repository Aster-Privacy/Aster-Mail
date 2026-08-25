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
import {
  BellIcon,
  BellAlertIcon,
  BellSlashIcon,
  MoonIcon,
} from "@heroicons/react/24/outline";
import { Button, Switch } from "@aster/ui";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { DEFAULT_PREFERENCES } from "@/services/api/preferences";
import { use_i18n } from "@/lib/i18n/context";
import { UpgradeGate } from "@/components/common/upgrade_gate";
import { use_plan_limits } from "@/hooks/use_plan_limits";
import {
  is_push_supported,
  subscribe_to_push,
  unsubscribe_from_push,
} from "@/services/push_subscription";
import { show_notification } from "@/services/notification_service";
import { show_toast } from "@/components/toast/simple_toast";
import { ignore_error } from "@/lib/ignore_error";
import { detect_platform } from "@/lib/utils";
import {
  get_product_updates_subscription,
  set_product_updates_subscription,
} from "@/services/api/product_updates";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown_menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format_hour_choice } from "@/utils/date_format";
import { BUILTIN_CATEGORIES } from "@/data/category_catalog";
import { category_icon } from "@/data/category_icons";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function format_hour_label(hour: number, am: string, pm: string): string {
  return format_hour_choice(hour, am, pm);
}

function parse_time_value(
  value: string,
): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) return null;

  return { hour, minute };
}

function build_time_value(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function QuietHoursTimeSelect({
  label,
  value,
  fallback_value,
  on_change,
}: {
  label: string;
  value: string;
  fallback_value: string;
  on_change: (value: string) => void;
}) {
  const { t } = use_i18n();
  const { hour, minute } = parse_time_value(value) ??
    parse_time_value(fallback_value) ?? { hour: 0, minute: 0 };
  const am = t("common.am");
  const pm = t("common.pm");

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
              {format_hour_label(hour, am, pm)}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-[70] max-h-60 overflow-y-auto">
            {HOURS.map((h) => (
              <DropdownMenuItem
                key={h}
                onClick={() => on_change(build_time_value(h, minute))}
              >
                {format_hour_label(h, am, pm)}
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
  disabled?: boolean;
}

function ToggleSetting({
  title,
  description,
  enabled,
  on_toggle,
  action,
  disabled = false,
}: ToggleSettingProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pe-4">
        <p className="text-sm font-medium text-txt-primary">{title}</p>
        <p className="text-sm mt-0.5 text-txt-muted">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {action}
        <Switch
          aria-label={title}
          checked={enabled}
          disabled={disabled}
          size="lg"
          onCheckedChange={on_toggle}
        />
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

const is_tauri = "__TAURI_INTERNALS__" in window;

function MutedCategoriesSetting() {
  const { preferences, update_preference } = use_preferences();
  const { t } = use_i18n();

  const enabled_ids = new Set(preferences.enabled_categories ?? []);
  const muted_ids = new Set(preferences.muted_notification_categories ?? []);

  const rows = [
    ...BUILTIN_CATEGORIES.filter(
      (cat) => cat.removable && enabled_ids.has(cat.id),
    ).map((cat) => ({
      id: cat.id,
      label: t(cat.label_key),
      icon: category_icon(cat.icon),
    })),
    ...(preferences.custom_categories ?? [])
      .filter((rule) => rule.enabled)
      .map((rule) => ({
        id: rule.id,
        label: rule.name,
        icon: category_icon(rule.icon),
      })),
  ];

  const toggle_muted = (id: string, is_muted: boolean) => {
    const next = is_muted
      ? [...muted_ids].filter((value) => value !== id)
      : [...muted_ids, id];

    update_preference("muted_notification_categories", next, true);
  };

  return (
    <div className="pt-3">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-txt-primary flex items-center gap-2">
          <BellSlashIcon className="w-[18px] h-[18px] text-txt-primary flex-shrink-0" />
          {t("settings.muted_categories")}
        </h3>
        <p className="text-sm mt-2 text-txt-muted">
          {t("settings.muted_categories_description")}
        </p>
        <div className="mt-2 h-px bg-edge-secondary" />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm py-3 text-txt-muted">
          {t("settings.muted_categories_empty")}
        </p>
      ) : (
        rows.map((row) => {
          const Icon = row.icon;
          const is_muted = muted_ids.has(row.id);

          return (
            <div
              key={row.id}
              className="flex items-center justify-between py-3"
            >
              <div className="flex-1 pe-4 flex items-center gap-3">
                <Icon className="w-[18px] h-[18px] text-txt-muted flex-shrink-0" />
                <p className="text-sm font-medium text-txt-primary">
                  {row.label}
                </p>
              </div>
              <Switch
                aria-label={row.label}
                checked={is_muted}
                size="lg"
                onCheckedChange={() => toggle_muted(row.id, is_muted)}
              />
            </div>
          );
        })
      )}
    </div>
  );
}

function system_notification_settings_target(): string | null {
  const platform = detect_platform();

  if (platform === "windows") return "ms-settings:notifications";
  if (platform === "mac") {
    return "x-apple.systempreferences:com.apple.preference.notifications";
  }

  return null;
}

async function open_system_notification_settings_os(): Promise<boolean> {
  const target = system_notification_settings_target();

  if (!target) return false;

  try {
    const { open } = await import("@tauri-apps/plugin-shell");

    await open(target);

    return true;
  } catch (caught) {
    ignore_error(
      "components/settings/notifications_section:open_system_notification_settings_os",
      caught,
    );

    return false;
  }
}

export function NotificationsSection() {
  const { preferences, update_preference } = use_preferences();
  const { t } = use_i18n();
  const { is_feature_locked } = use_plan_limits();
  const [permission_state, set_permission_state] = useState<PermissionState>(
    () => (is_tauri ? "default" : get_permission_state()),
  );
  const [product_updates, set_product_updates] = useState<boolean | null>(null);
  const [product_updates_busy, set_product_updates_busy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(window.location.search);
    const wants_unsubscribe = params.get("unsubscribe") === "product_updates";

    const apply = async () => {
      if (wants_unsubscribe) {
        try {
          await set_product_updates_subscription(false);
        } catch (caught) {
          if (cancelled) return;

          show_toast(t("settings.product_updates_save_failed"), "error");
          ignore_error(
            "components/settings/notifications_section:product_updates",
            caught,
          );
          set_product_updates(await get_product_updates_subscription());

          return;
        }

        params.delete("unsubscribe");
        const query = params.toString();

        window.history.replaceState(
          {},
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}`,
        );

        if (cancelled) return;

        set_product_updates(false);
        show_toast(t("settings.product_updates_turned_off"), "success");

        return;
      }

      const subscribed = await get_product_updates_subscription();

      if (cancelled) return;

      set_product_updates(subscribed);
    };

    apply().catch((caught) =>
      ignore_error(
        "components/settings/notifications_section:product_updates",
        caught,
      ),
    );

    return () => {
      cancelled = true;
    };
  }, [t]);

  const handle_product_updates_toggle = async () => {
    if (product_updates_busy || product_updates === null) return;

    const next = !product_updates;

    set_product_updates_busy(true);
    set_product_updates(next);

    try {
      await set_product_updates_subscription(next);
    } catch (caught) {
      set_product_updates(!next);
      show_toast(t("settings.product_updates_save_failed"), "error");
      ignore_error(
        "components/settings/notifications_section:handle_product_updates_toggle",
        caught,
      );
    } finally {
      set_product_updates_busy(false);
    }
  };

  useEffect(() => {
    if (!is_tauri) return;

    import("@tauri-apps/plugin-notification")
      .then(({ isPermissionGranted }) =>
        isPermissionGranted().then((granted) => {
          set_permission_state(granted ? "granted" : "default");
        }),
      )
      .catch((caught) =>
        ignore_error(
          "components/settings/notifications_section:NotificationsSection",
          caught,
        ),
      );
  }, []);

  const desktop_enabled =
    preferences.desktop_notifications && permission_state === "granted";

  const push_supported = !is_tauri && is_push_supported();

  const subscribe_to_push_with_warning = async (): Promise<void> => {
    const subscribed = await subscribe_to_push();

    if (!subscribed && is_push_supported()) {
      show_toast(t("settings.push_subscribe_failed"), "warning");
    }
  };

  const handle_desktop_toggle = async () => {
    const new_value = !desktop_enabled;

    if (new_value) {
      if (is_tauri) {
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
            await subscribe_to_push_with_warning();
          } else {
            set_permission_state("denied");
            await open_system_notification_settings_os();
          }
        } catch {
          set_permission_state("denied");
        }

        return;
      }

      if (!("Notification" in window)) {
        set_permission_state("unsupported");
        show_toast(t("settings.notifications_not_supported"), "warning");

        return;
      }

      const current = Notification.permission;

      if (current === "denied") {
        set_permission_state("denied");
        show_toast(t("settings.blocked_by_browser"), "warning");

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
          show_toast(t("settings.blocked_by_browser"), "warning");

          return;
        }
      }

      update_preference("desktop_notifications", true, true);
      set_permission_state("granted");
      await subscribe_to_push_with_warning();

      return;
    }

    update_preference("desktop_notifications", false, true);
    unsubscribe_from_push();
  };

  const handle_push_toggle = async (enabled: boolean) => {
    if (!enabled) {
      update_preference("push_notifications", false, true);
      unsubscribe_from_push();

      return;
    }

    if (!is_push_supported()) {
      show_toast(t("settings.push_subscribe_failed"), "warning");

      return;
    }

    update_preference("push_notifications", true, true);

    const subscribed = await subscribe_to_push();

    if (!subscribed) {
      update_preference("push_notifications", false, true);
      show_toast(t("settings.push_subscribe_failed"), "warning");
    }
  };

  const send_test_notification = async () => {
    if (permission_state !== "granted" || !preferences.desktop_notifications) {
      show_toast(t("settings.test_notification_blocked"), "warning");

      return;
    }

    show_toast(t("settings.test_notification_body"), "info");

    await show_notification(
      "new_email",
      {
        title: t("settings.test_notification"),
        body: t("settings.test_notification_body"),
        tag: "aster-test-notification",
      },
      {
        ...preferences,
        desktop_notifications: true,
        notify_new_email: true,
        quiet_hours_enabled: false,
      },
    );
  };

  const handle_open_system_notification_settings = async () => {
    const opened = await open_system_notification_settings_os();

    if (!opened) {
      show_toast(t("settings.blocked_by_os"), "warning");
    }
  };

  const desktop_description =
    permission_state === "denied"
      ? is_tauri
        ? t("settings.blocked_by_os")
        : t("settings.blocked_by_browser")
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
          action={
            is_tauri &&
            permission_state === "denied" &&
            system_notification_settings_target() !== null ? (
              <Button
                variant="ghost"
                onClick={handle_open_system_notification_settings}
              >
                {t("settings.open_system_notification_settings")}
              </Button>
            ) : undefined
          }
          description={desktop_description}
          enabled={desktop_enabled}
          on_toggle={handle_desktop_toggle}
          title={t("settings.desktop")}
        />
        <ToggleSetting
          description={t("settings.sound_new_notifications")}
          enabled={preferences.sound}
          on_toggle={() => update_preference("sound", !preferences.sound, true)}
          title={t("settings.sound")}
        />
        <ToggleSetting
          description={t("settings.badge_count_setting_description")}
          enabled={preferences.badge_count}
          on_toggle={() =>
            update_preference("badge_count", !preferences.badge_count, true)
          }
          title={t("settings.badge_count_setting")}
        />
        {push_supported && (
          <ToggleSetting
            description={t("settings.push_notifications_description")}
            enabled={preferences.push_notifications}
            on_toggle={() =>
              handle_push_toggle(!preferences.push_notifications)
            }
            title={t("settings.push")}
          />
        )}
        <div className="flex items-center justify-between py-3">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.toast_position")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.toast_position_description")}
            </p>
          </div>
          <Select
            value={preferences.toast_position}
            onValueChange={(v) =>
              update_preference(
                "toast_position",
                v as
                  | "top"
                  | "bottom"
                  | "top-right"
                  | "bottom-right"
                  | "top-left"
                  | "bottom-left",
                true,
              )
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom">
                {t("settings.toast_position_middle")}
              </SelectItem>
              <SelectItem value="top">
                {t("settings.toast_position_top")}
              </SelectItem>
              <SelectItem value="top-right">
                {t("settings.toast_position_top_right")}
              </SelectItem>
              <SelectItem value="bottom-right">
                {t("settings.toast_position_bottom_right")}
              </SelectItem>
              <SelectItem value="top-left">
                {t("settings.toast_position_top_left")}
              </SelectItem>
              <SelectItem value="bottom-left">
                {t("settings.toast_position_bottom_left")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.toast_duration")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.toast_duration_description")}
            </p>
          </div>
          <Select
            value={String(preferences.toast_duration_ms)}
            onValueChange={(v) =>
              update_preference("toast_duration_ms", Number(v), true)
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2000">
                {t("settings.toast_duration_default")}
              </SelectItem>
              <SelectItem value="5000">
                {t("settings.toast_duration_long")}
              </SelectItem>
              <SelectItem value="10000">
                {t("settings.toast_duration_longer")}
              </SelectItem>
              <SelectItem value="20000">
                {t("settings.toast_duration_longest")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between py-3">
          <div className="flex-1 pe-4">
            <p className="text-sm font-medium text-txt-primary">
              {t("settings.send_test_notification")}
            </p>
            <p className="text-sm mt-0.5 text-txt-muted">
              {t("settings.test_notification_body")}
            </p>
          </div>
          <Button size="md" variant="outline" onClick={send_test_notification}>
            {t("settings.send_test_notification")}
          </Button>
        </div>
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
            update_preference(
              "notify_new_email",
              !preferences.notify_new_email,
              true,
            )
          }
          title={t("settings.new_emails")}
        />
        <ToggleSetting
          description={t("settings.replies_description")}
          enabled={preferences.notify_replies}
          on_toggle={() =>
            update_preference(
              "notify_replies",
              !preferences.notify_replies,
              true,
            )
          }
          title={t("settings.replies")}
        />

        {product_updates !== null && (
          <ToggleSetting
            description={t("settings.product_updates_description")}
            disabled={product_updates_busy}
            enabled={product_updates}
            on_toggle={handle_product_updates_toggle}
            title={t("settings.product_updates")}
          />
        )}
      </div>

      {preferences.inbox_categories_enabled !== false && (
        <MutedCategoriesSetting />
      )}

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
                  true,
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
                    fallback_value={DEFAULT_PREFERENCES.quiet_hours_start}
                    label={t("settings.from")}
                    on_change={(v) =>
                      update_preference("quiet_hours_start", v, true)
                    }
                    value={preferences.quiet_hours_start}
                  />
                  <QuietHoursTimeSelect
                    fallback_value={DEFAULT_PREFERENCES.quiet_hours_end}
                    label={t("settings.to")}
                    on_change={(v) =>
                      update_preference("quiet_hours_end", v, true)
                    }
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
