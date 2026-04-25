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
import { en } from "@/lib/i18n/translations/en";

export type NotificationType = "new_email" | "reply" | "mention";

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

async function show_tauri_notification(
  title: string,
  body: string,
): Promise<void> {
  try {
    const { sendNotification, isPermissionGranted, requestPermission } =
      await import("@tauri-apps/plugin-notification");

    let permitted = await isPermissionGranted();

    if (!permitted) {
      const result = await requestPermission();

      permitted = result === "granted";
    }

    if (permitted) {
      sendNotification({ title, body });
    }
  } catch {
    return;
  }
}

function get_notification_sound(): HTMLAudioElement {
  if (!notification_sound) {
    notification_sound = new Audio("/chime.mp3");
    notification_sound.volume = 0.5;
  }

  return notification_sound;
}

function parse_time(time_string: string): { hours: number; minutes: number } {
  const [hours, minutes] = time_string.split(":").map(Number);

  return { hours: hours || 0, minutes: minutes || 0 };
}

function is_within_quiet_hours(preferences: UserPreferences): boolean {
  if (!preferences.quiet_hours_enabled) {
    return false;
  }

  const now = new Date();
  const current_minutes = now.getHours() * 60 + now.getMinutes();

  const start = parse_time(preferences.quiet_hours_start);
  const end = parse_time(preferences.quiet_hours_end);

  const start_minutes = start.hours * 60 + start.minutes;
  const end_minutes = end.hours * 60 + end.minutes;

  if (start_minutes <= end_minutes) {
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
    case "mention":
      return preferences.notify_mentions;
    default:
      return false;
  }
}

export async function show_notification(
  type: NotificationType,
  options: NotificationOptions,
  preferences: UserPreferences,
): Promise<Notification | null> {
  if (!should_notify(type, preferences)) {
    return null;
  }

  if (preferences.sound) {
    play_notification_sound();
  }

  if (is_tauri()) {
    await show_tauri_notification(options.title, options.body);

    return null;
  }

  if (!("Notification" in window)) {
    return null;
  }

  if (Notification.permission !== "granted") {
    return null;
  }

  const notification = new Notification(options.title, {
    body: options.body,
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
  sound.play().catch(() => {});
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
      title: en.mail.notification_new_email.replace("{{ sender }}", sender),
      body: subject,
      tag: `email-${email_id}`,
      data: { email_id },
    },
    preferences,
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
      title: en.mail.notification_reply.replace("{{ sender }}", sender),
      body: subject,
      tag: `reply-${email_id}`,
      data: { email_id },
    },
    preferences,
  );
}

export function notify_mention(
  sender: string,
  subject: string,
  email_id: string,
  preferences: UserPreferences,
): Promise<Notification | null> {
  return show_notification(
    "mention",
    {
      title: en.mail.notification_mention.replace("{{ sender }}", sender),
      body: subject,
      tag: `mention-${email_id}`,
      data: { email_id },
    },
    preferences,
  );
}
