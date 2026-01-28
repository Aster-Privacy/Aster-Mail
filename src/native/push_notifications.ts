import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type Token,
  type ActionPerformed,
  type PushNotificationSchema,
} from "@capacitor/push-notifications";

import { is_native_platform, get_platform } from "./capacitor_bridge";

type PushNotificationCallback = (notification: PushNotificationSchema) => void;
type PushActionCallback = (action: ActionPerformed) => void;

const notification_received_listeners: PushNotificationCallback[] = [];
const notification_action_listeners: PushActionCallback[] = [];

export async function register_push_notifications(): Promise<void> {
  if (!is_native_platform()) return;

  const permission = await PushNotifications.checkPermissions();

  if (permission.receive === "prompt") {
    const result = await PushNotifications.requestPermissions();

    if (result.receive !== "granted") {
      return;
    }
  } else if (permission.receive !== "granted") {
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener("registration", async (token: Token) => {
    await send_push_token_to_server(token.value);
  });

  PushNotifications.addListener("registrationError", () => {});

  PushNotifications.addListener(
    "pushNotificationReceived",
    (notification: PushNotificationSchema) => {
      notification_received_listeners.forEach((callback) =>
        callback(notification),
      );
    },
  );

  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action: ActionPerformed) => {
      notification_action_listeners.forEach((callback) => callback(action));

      const data = action.notification.data;

      if (data?.email_id) {
        window.location.href = `/email/${data.email_id}`;
      } else if (
        data?.route &&
        typeof data.route === "string" &&
        data.route.startsWith("/") &&
        !data.route.startsWith("//")
      ) {
        window.location.href = data.route;
      }
    },
  );
}

async function send_push_token_to_server(token: string): Promise<void> {
  try {
    const response = await fetch("/api/sync/push-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        push_token: token,
        platform: get_platform(),
        device_id: await get_device_id(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to register push token: ${response.status}`);
    }
  } catch {}
}

async function get_device_id(): Promise<string> {
  const stored_id = localStorage.getItem("aster_device_id");

  if (stored_id) return stored_id;

  const new_id = crypto.randomUUID();

  localStorage.setItem("aster_device_id", new_id);

  return new_id;
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

    return false;
  }

  const result = await PushNotifications.requestPermissions();

  if (result.receive === "granted") {
    await PushNotifications.register();

    return true;
  }

  return false;
}

export async function unregister_push_notifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await fetch("/api/sync/push-token", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        device_id: await get_device_id(),
      }),
    });
  } catch {}
}
