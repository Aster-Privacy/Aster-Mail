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

import { HASH_ALG } from "@/services/crypto/constants";
import { decrypt_account_context_with_fallback } from "@/services/crypto/legacy_keks";
import { api_client } from "@/services/api/client";

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

export const SUBSCRIPTION_CACHE_VERSION = 4;

export const SUBSCRIPTION_CACHE_SAVED_EVENT =
  "astermail:subscription-cache-saved";

export interface SubscriptionScanProgress {
  cursor: string;
  last_scan_ts: string;
  last_scan_message_ts: string;
  carried: string[];
}

export interface SubscriptionCacheData {
  subscriptions: CachedSubscription[];
  last_scan_ts: string;
  last_scan_message_ts?: string;
  version?: number;
  scan_progress?: SubscriptionScanProgress;
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

export const SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES = 640 * 1024;

const SUBSCRIPTION_FIELD_MAX_LENGTH = 2048;

function serialized_size(data: SubscriptionCacheData): number {
  return new TextEncoder().encode(JSON.stringify(data)).length;
}

function is_oversized(value: unknown): boolean {
  return (
    typeof value !== "string" || value.length > SUBSCRIPTION_FIELD_MAX_LENGTH
  );
}

function trim_subscription_fields(
  subscription: CachedSubscription,
): CachedSubscription {
  const trimmed: CachedSubscription = { ...subscription };

  if (typeof trimmed.sender_name !== "string") {
    trimmed.sender_name = "";
  } else if (trimmed.sender_name.length > SUBSCRIPTION_FIELD_MAX_LENGTH) {
    trimmed.sender_name = trimmed.sender_name.slice(
      0,
      SUBSCRIPTION_FIELD_MAX_LENGTH,
    );
  }

  if (
    trimmed.unsubscribe_link !== undefined &&
    is_oversized(trimmed.unsubscribe_link)
  ) {
    delete trimmed.unsubscribe_link;
  }

  if (
    trimmed.list_unsubscribe_header !== undefined &&
    is_oversized(trimmed.list_unsubscribe_header)
  ) {
    delete trimmed.list_unsubscribe_header;
  }

  if (
    trimmed.list_unsubscribe_post !== undefined &&
    is_oversized(trimmed.list_unsubscribe_post)
  ) {
    delete trimmed.list_unsubscribe_post;
  }

  return trimmed;
}

function received_time(subscription: CachedSubscription): number {
  const parsed =
    typeof subscription.last_received === "string"
      ? Date.parse(subscription.last_received)
      : NaN;

  return Number.isFinite(parsed) ? parsed : 0;
}

function email_count_of(subscription: CachedSubscription): number {
  const count = subscription.email_count;

  return typeof count === "number" && Number.isFinite(count) ? count : 0;
}

function compare_retention_priority(
  a: CachedSubscription,
  b: CachedSubscription,
): number {
  const a_unsubscribed = a.status === "unsubscribed" ? 1 : 0;
  const b_unsubscribed = b.status === "unsubscribed" ? 1 : 0;

  if (a_unsubscribed !== b_unsubscribed) return b_unsubscribed - a_unsubscribed;

  const by_received = received_time(b) - received_time(a);

  if (by_received !== 0) return by_received;

  return email_count_of(b) - email_count_of(a);
}

function keep_subscriptions(
  data: SubscriptionCacheData,
  subscriptions: CachedSubscription[],
  kept_emails: Set<string> | null,
): SubscriptionCacheData {
  const retained = kept_emails
    ? subscriptions.filter((s) => kept_emails.has(s.sender_email))
    : subscriptions;
  const result: SubscriptionCacheData = { ...data, subscriptions: retained };

  if (data.scan_progress) {
    const carried = Array.isArray(data.scan_progress.carried)
      ? data.scan_progress.carried
      : [];

    result.scan_progress = {
      ...data.scan_progress,
      carried: kept_emails
        ? carried.filter((email) => kept_emails.has(email))
        : carried,
    };
  }

  return result;
}

export function compact_subscription_cache(
  data: SubscriptionCacheData,
  max_bytes: number = SUBSCRIPTION_CACHE_MAX_PLAINTEXT_BYTES,
): SubscriptionCacheData {
  if (serialized_size(data) <= max_bytes) return data;

  const source = Array.isArray(data.subscriptions) ? data.subscriptions : [];
  const trimmed = source.map(trim_subscription_fields);
  const trimmed_data = keep_subscriptions(data, trimmed, null);

  if (serialized_size(trimmed_data) <= max_bytes) return trimmed_data;

  const ranked = [...trimmed].sort(compare_retention_priority);
  const build = (count: number) =>
    keep_subscriptions(
      data,
      trimmed,
      new Set(ranked.slice(0, count).map((s) => s.sender_email)),
    );

  let low = 0;
  let high = ranked.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (serialized_size(build(middle)) <= max_bytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  const compacted = build(low);

  if (serialized_size(compacted) <= max_bytes) return compacted;

  const without_progress: SubscriptionCacheData = { ...compacted };

  delete without_progress.scan_progress;

  return without_progress;
}

async function encrypt_subscriptions(
  data: SubscriptionCacheData,
  vault: EncryptedVault,
): Promise<{ encrypted: string; nonce: string }> {
  const key = await derive_subscriptions_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(
    JSON.stringify(compact_subscription_cache(data)),
  );

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

  const decrypted = await decrypt_account_context_with_fallback(
    "astermail-subscriptions-v1",
    key,
    encrypted_data,
    nonce_data,
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

    const saved = !response.error && response.data?.success === true;

    if (saved && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CACHE_SAVED_EVENT));
    }

    return saved;
  } catch {
    return false;
  }
}
