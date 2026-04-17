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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { api_client } from "@/services/api/client";

const HASH_ALG = ["SHA", "256"].join("-");

export type SubscriptionCacheCategory =
  | "newsletter"
  | "marketing"
  | "social"
  | "transactional"
  | "unknown";

export interface CachedSubscription {
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  last_received: string;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  list_unsubscribe_post?: string;
  has_one_click: boolean;
  category: SubscriptionCacheCategory;
  status: "active" | "unsubscribed";
  unsubscribed_at?: string;
}

export const SUBSCRIPTION_CACHE_VERSION = 2;

export interface SubscriptionCacheData {
  subscriptions: CachedSubscription[];
  last_scan_ts: string;
  version?: number;
}

interface GetSubscriptionsApiResponse {
  encrypted_subscriptions: string | null;
  subscriptions_nonce: string | null;
}

interface SaveSubscriptionsApiResponse {
  success: boolean;
}

async function derive_subscriptions_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + "astermail-subscriptions-v1",
  );
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_subscriptions(
  data: SubscriptionCacheData,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_subscriptions_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const encrypted_bytes = new Uint8Array(encrypted);
  let binary = "";

  for (let i = 0; i < encrypted_bytes.length; i++) {
    binary += String.fromCharCode(encrypted_bytes[i]);
  }

  return {
    encrypted: btoa(binary),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decrypt_subscriptions(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<SubscriptionCacheData> {
  const key = await derive_subscriptions_key(vault);
  const encrypted_data = Uint8Array.from(atob(encrypted), (c) =>
    c.charCodeAt(0),
  );
  const nonce_data = Uint8Array.from(atob(nonce), (c) => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce_data },
    key,
    encrypted_data,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

export async function load_subscription_cache(
  vault: EncryptedVault,
): Promise<SubscriptionCacheData | null> {
  try {
    const response = await api_client.get<GetSubscriptionsApiResponse>(
      "/settings/v1/preferences/subscriptions",
    );

    if (response.error || !response.data) {
      return null;
    }

    const { encrypted_subscriptions, subscriptions_nonce } = response.data;

    if (!encrypted_subscriptions || !subscriptions_nonce) {
      return null;
    }

    return await decrypt_subscriptions(
      encrypted_subscriptions,
      subscriptions_nonce,
      vault,
    );
  } catch {
    return null;
  }
}

export async function save_subscription_cache(
  data: SubscriptionCacheData,
  vault: EncryptedVault,
): Promise<boolean> {
  try {
    const { encrypted, nonce } = await encrypt_subscriptions(data, vault);

    const response = await api_client.put<SaveSubscriptionsApiResponse>(
      "/settings/v1/preferences/subscriptions",
      {
        encrypted_subscriptions: encrypted,
        subscriptions_nonce: nonce,
      },
    );

    return !response.error && response.data?.success === true;
  } catch {
    return false;
  }
}
