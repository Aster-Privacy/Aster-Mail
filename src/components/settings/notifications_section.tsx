import { useState, useRef } from "react";
import {
  BellIcon,
  SpeakerWaveIcon,
  DevicePhoneMobileIcon,
  PlayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

import { SettingsSaveIndicatorInline } from "./settings_save_indicator";

import { use_preferences } from "@/contexts/preferences_context";
import { play_notification_sound } from "@/services/notification_service";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type PermissionState = "granted" | "denied" | "default" | "unsupported";

function get_permission_state(): PermissionState {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function NotificationsSection() {
  const { preferences, update_preference } = use_preferences();
  const [permission_state, set_permission_state] =
    useState<PermissionState>(get_permission_state);
  const start_time_ref = useRef<HTMLInputElement>(null);
  const end_time_ref = useRef<HTMLInputElement>(null);

  const handle_desktop_toggle = () => {
    const new_value = !preferences.desktop_notifications;

    if (new_value) {
      const current_state = get_permission_state();

      set_permission_state(current_state);

      if (current_state === "unsupported" || current_state === "denied") {
        return;
      }

      if (current_state === "default") {
        Notification.requestPermission().then((permission) => {
          const new_state =
            permission === "granted"
              ? "granted"
              : permission === "denied"
                ? "denied"
                : "default";

          set_permission_state(new_state);

          if (permission === "granted") {
            update_preference("desktop_notifications", true);
          }
        });

        return;
      }
    }

    update_preference("desktop_notifications", new_value);
  };

  const handle_test_sound = () => {
    play_notification_sound();
  };

  const handle_test_notification = () => {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    new Notification("Test Notification", {
      body: "This is a test notification from Aster Mail",
      icon: "/icons/icon-192x192.png",
    });

    if (preferences.sound) {
      play_notification_sound();
    }
  };

  const handle_request_permission = () => {
    if (!("Notification" in window)) return;

    Notification.requestPermission().then((permission) => {
      set_permission_state(
        permission === "granted"
          ? "granted"
          : permission === "denied"
            ? "denied"
            : "default",
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3
            className="text-base font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Notifications
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Configure how and when you receive notifications
          </p>
        </div>
        <SettingsSaveIndicatorInline />
      </div>

      <div
        className="flex items-start gap-3 p-3 rounded-lg"
        style={{
          backgroundColor:
            permission_state === "granted"
              ? "rgba(34, 197, 94, 0.08)"
              : permission_state === "denied"
                ? "rgba(239, 68, 68, 0.08)"
                : "rgba(59, 130, 246, 0.08)",
        }}
      >
        {permission_state === "granted" ? (
          <CheckCircleIcon className="w-5 h-5 flex-shrink-0 text-green-500" />
        ) : permission_state === "denied" ? (
          <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 text-red-500" />
        ) : (
          <InformationCircleIcon className="w-5 h-5 flex-shrink-0 text-blue-500" />
        )}
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-medium"
            style={{
              color:
                permission_state === "granted"
                  ? "#22c55e"
                  : permission_state === "denied"
                    ? "#ef4444"
                    : "#3b82f6",
            }}
          >
            {permission_state === "granted"
              ? "Notifications enabled"
              : permission_state === "denied"
                ? "Notifications blocked"
                : permission_state === "unsupported"
                  ? "Not supported"
                  : "Permission required"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {permission_state === "granted"
              ? "You'll receive desktop notifications for new emails"
              : permission_state === "denied"
                ? "Enable notifications in your browser settings"
                : permission_state === "unsupported"
                  ? "Your browser doesn't support notifications"
                  : "Grant permission to receive notifications"}
          </p>
        </div>
        {permission_state === "default" && (
          <Button
            size="sm"
            onClick={handle_request_permission}
          >
            Enable
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-wider px-1"
          style={{ color: "var(--text-muted)" }}
        >
          Channels
        </p>
        <div
          className="rounded-lg divide-y overflow-hidden"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <BellIcon
                  className="w-4 h-4"
                  style={{
                    color:
                      permission_state === "denied" ||
                      permission_state === "unsupported"
                        ? "#ef4444"
                        : "var(--text-secondary)",
                  }}
                />
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Desktop
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {permission_state === "denied"
                    ? "Blocked by browser"
                    : permission_state === "unsupported"
                      ? "Not supported"
                      : "Show desktop notifications"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {permission_state === "granted" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handle_test_notification}
                >
                  <PlayIcon className="w-3 h-3" />
                  Test
                </Button>
              )}
              <Switch
                checked={preferences.desktop_notifications}
                onCheckedChange={handle_desktop_toggle}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <SpeakerWaveIcon
                  className="w-4 h-4"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Sound
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Play sound for new notifications
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handle_test_sound}
              >
                <PlayIcon className="w-3 h-3" />
                Preview
              </Button>
              <Switch
                checked={preferences.sound}
                onCheckedChange={() =>
                  update_preference("sound", !preferences.sound)
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <DevicePhoneMobileIcon
                  className="w-4 h-4"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Push
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Receive push notifications on mobile
                </p>
              </div>
            </div>
            <Switch
              checked={preferences.push_notifications}
              onCheckedChange={() =>
                update_preference(
                  "push_notifications",
                  !preferences.push_notifications,
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-wider px-1"
          style={{ color: "var(--text-muted)" }}
        >
          Events
        </p>
        <div
          className="rounded-lg divide-y overflow-hidden"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderColor: "var(--border-secondary)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                New emails
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                When you receive a new email
              </p>
            </div>
            <Switch
              checked={preferences.notify_new_email}
              onCheckedChange={() =>
                update_preference(
                  "notify_new_email",
                  !preferences.notify_new_email,
                )
              }
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Replies
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                When someone replies to your email
              </p>
            </div>
            <Switch
              checked={preferences.notify_replies}
              onCheckedChange={() =>
                update_preference("notify_replies", !preferences.notify_replies)
              }
            />
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Mentions
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                When someone mentions you
              </p>
            </div>
            <Switch
              checked={preferences.notify_mentions}
              onCheckedChange={() =>
                update_preference(
                  "notify_mentions",
                  !preferences.notify_mentions,
                )
              }
            />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <p
          className="text-[11px] font-medium uppercase tracking-wider px-1"
          style={{ color: "var(--text-muted)" }}
        >
          Quiet Hours
        </p>
        <div
          className="rounded-lg overflow-hidden"
          style={{ backgroundColor: "var(--bg-tertiary)" }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Enable quiet hours
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Mute notifications during set times
              </p>
            </div>
            <Switch
              checked={preferences.quiet_hours_enabled}
              onCheckedChange={() =>
                update_preference(
                  "quiet_hours_enabled",
                  !preferences.quiet_hours_enabled,
                )
              }
            />
          </div>

          {preferences.quiet_hours_enabled && (
            <div
              className="flex items-center gap-4 px-4 py-3"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              <div className="flex-1">
                <label
                  className="text-xs font-medium block mb-1.5"
                  htmlFor="quiet-hours-start"
                  style={{ color: "var(--text-muted)" }}
                >
                  From
                </label>
                <input
                  ref={start_time_ref}
                  className="w-full px-3 py-2 text-sm rounded-md cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  id="quiet-hours-start"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-secondary)",
                    color: "var(--text-primary)",
                  }}
                  type="time"
                  value={preferences.quiet_hours_start}
                  onChange={(e) =>
                    update_preference("quiet_hours_start", e.target.value)
                  }
                  onClick={() => start_time_ref.current?.showPicker()}
                />
              </div>
              <div className="flex-1">
                <label
                  className="text-xs font-medium block mb-1.5"
                  htmlFor="quiet-hours-end"
                  style={{ color: "var(--text-muted)" }}
                >
                  To
                </label>
                <input
                  ref={end_time_ref}
                  className="w-full px-3 py-2 text-sm rounded-md cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  id="quiet-hours-end"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    border: "1px solid var(--border-secondary)",
                    color: "var(--text-primary)",
                  }}
                  type="time"
                  value={preferences.quiet_hours_end}
                  onChange={(e) =>
                    update_preference("quiet_hours_end", e.target.value)
                  }
                  onClick={() => end_time_ref.current?.showPicker()}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
