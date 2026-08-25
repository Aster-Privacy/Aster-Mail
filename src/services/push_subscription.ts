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
import { api_client } from "@/services/api/client";

const DEVICE_ID_STORAGE_KEY = "aster_push_device_id";
const LAST_ENDPOINT_STORAGE_KEY = "aster_push_last_endpoint";

function get_push_device_id(): string | null {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);

    if (existing) return existing;

    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);

    return generated;
  } catch {
    return null;
  }
}

async function delete_server_subscription(endpoint: string): Promise<void> {
  try {
    await api_client.delete("/sync/v1/web-push/subscribe", {
      data: { endpoint },
    });
  } catch {
    return;
  }
}

function url_base64_to_uint8_array(base64_string: string): Uint8Array {
  const padding = "=".repeat((4 - (base64_string.length % 4)) % 4);
  const base64 = (base64_string + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw_data = window.atob(base64);
  const output_array = new Uint8Array(raw_data.length);

  for (let i = 0; i < raw_data.length; ++i) {
    output_array[i] = raw_data.charCodeAt(i);
  }

  return output_array;
}

interface VapidKeyResponse {
  public_key: string;
}

async function get_vapid_public_key(): Promise<string | null> {
  try {
    const result = await api_client.get<VapidKeyResponse>(
      "/sync/v1/web-push/vapid-key",
    );

    if ("error" in result || !result.data) return null;

    return result.data.public_key || null;
  } catch {
    return null;
  }
}

async function get_push_subscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return null;
  }

  const registration = await navigator.serviceWorker.ready;

  return registration.pushManager.getSubscription();
}

export async function subscribe_to_push(): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return false;
    }

    const vapid_key = await get_vapid_public_key();

    if (!vapid_key) return false;

    const registration = await navigator.serviceWorker.ready;
    const app_server_key = url_base64_to_uint8_array(vapid_key);

    let subscription: PushSubscription | null = null;
    let replaced_endpoint: string | null = null;

    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: app_server_key,
      });
    } catch {
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        replaced_endpoint = existing.endpoint;
        await existing.unsubscribe();
      }
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: app_server_key,
      });
    }

    if (!subscription) return false;

    await send_subscription_to_server(subscription);

    if (replaced_endpoint && replaced_endpoint !== subscription.endpoint) {
      await delete_server_subscription(replaced_endpoint);
    }

    let previous_endpoint: string | null = null;

    try {
      previous_endpoint = localStorage.getItem(LAST_ENDPOINT_STORAGE_KEY);
      localStorage.setItem(LAST_ENDPOINT_STORAGE_KEY, subscription.endpoint);
    } catch {
      previous_endpoint = null;
    }

    if (
      previous_endpoint &&
      previous_endpoint !== subscription.endpoint &&
      previous_endpoint !== replaced_endpoint
    ) {
      await delete_server_subscription(previous_endpoint);
    }

    return true;
  } catch {
    return false;
  }
}

export async function unsubscribe_from_push(): Promise<boolean> {
  try {
    const subscription = await get_push_subscription();

    if (!subscription) return true;

    const endpoint = subscription.endpoint;

    await subscription.unsubscribe();

    await api_client.delete("/sync/v1/web-push/subscribe", {
      data: { endpoint },
    });

    try {
      localStorage.removeItem(LAST_ENDPOINT_STORAGE_KEY);
    } catch {
      return true;
    }

    return true;
  } catch {
    return false;
  }
}

export async function send_test_push(): Promise<boolean> {
  try {
    const result = await api_client.post("/sync/v1/web-push/test", {});

    return !("error" in result);
  } catch {
    return false;
  }
}

export async function is_push_subscribed(): Promise<boolean> {
  const subscription = await get_push_subscription();

  return subscription !== null;
}

async function send_subscription_to_server(
  subscription: PushSubscription,
): Promise<void> {
  const key = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");

  if (!key || !auth) return;

  const p256dh = btoa(String.fromCharCode(...new Uint8Array(key)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const auth_key = btoa(String.fromCharCode(...new Uint8Array(auth)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await api_client.post("/sync/v1/web-push/subscribe", {
    endpoint: subscription.endpoint,
    p256dh,
    auth: auth_key,
    user_agent: navigator.userAgent,
    device_id: get_push_device_id(),
  });

  if (response.error) throw new Error(response.error);
}
