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
import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
} from "@capacitor/push-notifications";

import { is_native_platform } from "./capacitor_bridge";
import { api_client } from "@/services/api/client";

type PushNotificationCallback = (notification: PushNotificationSchema) => void;
type PushActionCallback = (action: ActionPerformed) => void;

const notification_received_listeners: PushNotificationCallback[] = [];
const notification_action_listeners: PushActionCallback[] = [];

export async function register_push_notifications(): Promise<void> {
  return;
}

export function add_notification_received_listener(
  callback: PushNotificationCallback,
): () => void {
  notification_received_listeners.push(callback);

  return () => {
    const index = notification_received_listeners.indexOf(callback);

    if (index > -1) {
      notification_received_listeners.splice(index, 1);
    }
  };
}

export function add_notification_action_listener(
  callback: PushActionCallback,
): () => void {
  notification_action_listeners.push(callback);

  return () => {
    const index = notification_action_listeners.indexOf(callback);

    if (index > -1) {
      notification_action_listeners.splice(index, 1);
    }
  };
}

export async function get_push_permission_status(): Promise<
  "granted" | "denied" | "prompt"
> {
  if (!is_native_platform()) {
    if ("Notification" in window) {
      return Notification.permission as "granted" | "denied" | "prompt";
    }

    return "denied";
  }

  const permission = await PushNotifications.checkPermissions();
  const status = permission.receive;

  if (status === "granted") return "granted";
  if (status === "denied") return "denied";

  return "prompt";
}

export async function request_push_permission(): Promise<boolean> {
  if (!is_native_platform()) {
    if ("Notification" in window) {
      const result = await Notification.requestPermission();

      return result === "granted";
    }
  }

  return false;
}

export async function unregister_push_notifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const token_value = localStorage.getItem("aster_push_token");

    if (!token_value) return;

    await api_client.delete("/sync/v1/push-token", {
      data: { push_token: token_value },
    });

    localStorage.removeItem("aster_push_token");
  } catch (err) {
    if (import.meta.env.DEV)
      console.error("failed to unregister push token", err);
  }
}
