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
import type { UserPreferences } from "@/services/api/preferences";

import { DEFAULT_PREFERENCES } from "@/services/api/preferences";
import { get_active_translations } from "@/lib/i18n/translations";
import { is_any_lockdown_active } from "@/services/lockdown_store";
import { ignore_error } from "@/lib/ignore_error";

export type NotificationType = "new_email" | "reply";

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

let notification_sound: HTMLAudioElement | null = null;

function is_tauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

let tauri_actions_bound = false;

async function bind_tauri_notification_actions(notification_module: {
  onAction: (
    callback: (notification: { extra?: Record<string, unknown> }) => void,
  ) => Promise<unknown>;
}): Promise<void> {
  if (tauri_actions_bound) return;
  tauri_actions_bound = true;

  try {
    await notification_module.onAction((notification) => {
      const email_id = notification.extra?.email_id;

      window.focus();

      if (typeof email_id === "string" && email_id !== "") {
        window.dispatchEvent(
          new CustomEvent("astermail:open-email", {
            detail: { email_id },
          }),
        );
      }
    });
  } catch {
    tauri_actions_bound = false;
  }
}

async function show_tauri_notification(
  title: string,
  body: string,
  email_id?: string,
): Promise<void> {
  try {
    const notification_module = await import("@tauri-apps/plugin-notification");
    const { sendNotification, isPermissionGranted, requestPermission } =
      notification_module;

    let permitted = await isPermissionGranted();

    if (!permitted) {
      const result = await requestPermission();

      permitted = result === "granted";
    }

    if (!permitted) return;

    await bind_tauri_notification_actions(notification_module);

    sendNotification({
      title,
      body,
      extra: email_id ? { email_id } : undefined,
    });
  } catch {
    return;
  }
}

function get_notification_sound(): HTMLAudioElement {
  if (!notification_sound) {
    notification_sound = new Audio("/asterchime.mp3");
    notification_sound.volume = 0.5;
  }

  return notification_sound;
}

function parse_time(
  time_string: string,
): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(time_string);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return { hours, minutes };
}

function is_within_quiet_hours(preferences: UserPreferences): boolean {
  if (!preferences.quiet_hours_enabled) {
    return false;
  }

  const now = new Date();
  const current_minutes = now.getHours() * 60 + now.getMinutes();

  const start =
    parse_time(preferences.quiet_hours_start) ??
    parse_time(DEFAULT_PREFERENCES.quiet_hours_start);
  const end =
    parse_time(preferences.quiet_hours_end) ??
    parse_time(DEFAULT_PREFERENCES.quiet_hours_end);

  if (!start || !end) return false;

  const start_minutes = start.hours * 60 + start.minutes;
  const end_minutes = end.hours * 60 + end.minutes;

  if (start_minutes === end_minutes) {
    return true;
  }

  if (start_minutes < end_minutes) {
    return current_minutes >= start_minutes && current_minutes < end_minutes;
  }

  return current_minutes >= start_minutes || current_minutes < end_minutes;
}

function should_notify(
  type: NotificationType,
  preferences: UserPreferences,
): boolean {
  if (is_within_quiet_hours(preferences)) {
    return false;
  }

  if (!preferences.desktop_notifications) {
    return false;
  }

  switch (type) {
    case "new_email":
      return preferences.notify_new_email;
    case "reply":
      return preferences.notify_replies;
    default:
      return false;
  }
}

export async function show_notification(
  type: NotificationType,
  options: NotificationOptions,
  preferences: UserPreferences,
  lockdown_active: boolean = false,
): Promise<Notification | null> {
  if (!should_notify(type, preferences)) {
    return null;
  }

  const display_title = lockdown_active
    ? get_active_translations().settings.lockdown_notification_generic
    : options.title;
  const display_body = lockdown_active ? "" : options.body;

  if (preferences.sound) {
    play_notification_sound();
  }

  if (is_tauri()) {
    await show_tauri_notification(
      display_title,
      display_body,
      typeof options.data?.email_id === "string"
        ? options.data.email_id
        : undefined,
    );

    return null;
  }

  if (!("Notification" in window)) {
    return null;
  }

  if (Notification.permission !== "granted") {
    return null;
  }

  const notification = new Notification(display_title, {
    body: display_body,
    icon: options.icon || "/icons/icon-192x192.png",
    tag: options.tag,
    data: options.data,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();

    if (options.data?.email_id) {
      window.dispatchEvent(
        new CustomEvent("astermail:open-email", {
          detail: { email_id: options.data.email_id },
        }),
      );
    }
  };

  return notification;
}

export function play_notification_sound(): void {
  const sound = get_notification_sound();

  sound.currentTime = 0;
  sound
    .play()
    .catch((caught) =>
      ignore_error(
        "services/notification_service:play_notification_sound",
        caught,
      ),
    );
}

export async function request_notification_permission(): Promise<NotificationPermission> {
  if (is_tauri()) {
    try {
      const { isPermissionGranted, requestPermission } = await import(
        "@tauri-apps/plugin-notification"
      );

      const permitted = await isPermissionGranted();

      if (permitted) return "granted";

      const result = await requestPermission();

      return result === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  if (!("Notification" in window)) {
    return "denied";
  }

  if (Notification.permission !== "default") {
    return Notification.permission;
  }

  return await Notification.requestPermission();
}

export function get_notification_permission(): NotificationPermission {
  if (!("Notification" in window)) {
    return "denied";
  }

  return Notification.permission;
}

export function clear_notification_state(): void {
  if (notification_sound) {
    notification_sound.pause();
    notification_sound.src = "";
    notification_sound = null;
  }
}

export async function load_notification_preferences(
  _vault?: unknown,
): Promise<{ enabled: boolean }> {
  if (is_tauri()) {
    try {
      const { isPermissionGranted } = await import(
        "@tauri-apps/plugin-notification"
      );

      return { enabled: await isPermissionGranted() };
    } catch {
      return { enabled: false };
    }
  }

  if (!("Notification" in window)) {
    return { enabled: false };
  }

  get_notification_sound();

  return { enabled: Notification.permission === "granted" };
}

export function notify_new_email(
  sender: string,
  subject: string,
  email_id: string,
  preferences: UserPreferences,
): Promise<Notification | null> {
  return show_notification(
    "new_email",
    {
      title: get_active_translations().mail.notification_new_email.replace(
        "{{ sender }}",
        sender,
      ),
      body: subject,
      tag: `email-${email_id}`,
      data: { email_id },
    },
    preferences,
    is_any_lockdown_active(),
  );
}

export function notify_reply(
  sender: string,
  subject: string,
  email_id: string,
  preferences: UserPreferences,
): Promise<Notification | null> {
  return show_notification(
    "reply",
    {
      title: get_active_translations().mail.notification_reply.replace(
        "{{ sender }}",
        sender,
      ),
      body: subject,
      tag: `reply-${email_id}`,
      data: { email_id },
    },
    preferences,
    is_any_lockdown_active(),
  );
}
