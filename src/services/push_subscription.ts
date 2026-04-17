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

    const existing = await registration.pushManager.getSubscription();

    if (existing) {
      await send_subscription_to_server(existing);

      return true;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: url_base64_to_uint8_array(vapid_key),
    });

    await send_subscription_to_server(subscription);

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

  await api_client.post("/sync/v1/web-push/subscribe", {
    endpoint: subscription.endpoint,
    p256dh,
    auth: auth_key,
    user_agent: navigator.userAgent,
  });
}
