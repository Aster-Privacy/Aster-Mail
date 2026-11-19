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
import {
  is_usable_identity_key,
  with_identity_key,
} from "@/services/crypto/identity_key_required";
import { decrypt_account_context_with_fallback } from "@/services/crypto/legacy_keks";
import { api_client } from "@/services/api/client";

export type SubscriptionCacheCategory =
  "newsletter" | "marketing" | "social" | "transactional" | "unknown";

export interface CachedSubscription {
  sender_email: string;
  sender_name: string;
  domain: string;
  email_count: number;
  last_received: string;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
  list_unsubscribe_post?: string;
  routing_token?: string;
  recipients?: string[];
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

export interface LegacyRecordMove {
  moved_at: string;
  pending_ids: string[];
}

export interface DeletedSubscription {
  sender_email: string;
  deleted_at: string;
}

export interface SubscriptionCacheData {
  subscriptions: CachedSubscription[];
  last_scan_ts: string;
  last_scan_message_ts?: string;
  version?: number;
  scan_progress?: SubscriptionScanProgress;
  legacy_move?: LegacyRecordMove;
  deleted?: DeletedSubscription[];
}

export const MAX_DELETED_SUBSCRIPTIONS = 1000;
export const MAX_DELETED_SUBSCRIPTIONS_CEILING = 5000;

export function normalize_sender_email(sender_email: string): string {
  return typeof sender_email === "string"
    ? sender_email.trim().toLowerCase()
    : "";
}

function parse_time(value: unknown): number {
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;

  return Number.isFinite(parsed) ? parsed : NaN;
}

export function merge_deleted_subscriptions(
  ...lists: Array<DeletedSubscription[] | undefined>
): DeletedSubscription[] {
  const merged = new Map<string, DeletedSubscription>();

  for (const list of lists) {
    if (!Array.isArray(list)) continue;

    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;

      const sender_email = normalize_sender_email(entry.sender_email);
      const deleted_time = parse_time(entry.deleted_at);

      if (!sender_email.includes("@") || !Number.isFinite(deleted_time)) {
        continue;
      }

      const existing = merged.get(sender_email);

      if (!existing || parse_time(existing.deleted_at) < deleted_time) {
        merged.set(sender_email, {
          sender_email,
          deleted_at: entry.deleted_at,
        });
      }
    }
  }

  return retain_newest_deletions(
    Array.from(merged.values()).sort(
      (a, b) => parse_time(b.deleted_at) - parse_time(a.deleted_at),
    ),
  );
}

function retain_newest_deletions(
  newest_first: DeletedSubscription[],
): DeletedSubscription[] {
  if (newest_first.length <= MAX_DELETED_SUBSCRIPTIONS) return newest_first;

  const cutoff = parse_time(
    newest_first[MAX_DELETED_SUBSCRIPTIONS - 1].deleted_at,
  );
  let end = MAX_DELETED_SUBSCRIPTIONS;

  while (
    end < newest_first.length &&
    end < MAX_DELETED_SUBSCRIPTIONS_CEILING &&
    parse_time(newest_first[end].deleted_at) === cutoff
  ) {
    end += 1;
  }

  return newest_first.slice(0, end);
}

export function is_deleted_subscription(
  subscription: CachedSubscription,
  deleted: DeletedSubscription[] | undefined,
): boolean {
  if (!Array.isArray(deleted) || deleted.length === 0) return false;

  const sender_email = normalize_sender_email(subscription.sender_email);
  const tombstone = deleted.find((d) => d.sender_email === sender_email);

  if (!tombstone) return false;

  const received = parse_time(subscription.last_received);

  if (!Number.isFinite(received)) return true;

  return received <= parse_time(tombstone.deleted_at);
}

export function apply_deleted_subscriptions(
  data: SubscriptionCacheData,
  extra: DeletedSubscription[] = [],
): SubscriptionCacheData {
  const deleted = merge_deleted_subscriptions(data.deleted, extra);

  if (deleted.length === 0) {
    if (data.deleted === undefined) return data;

    const without: SubscriptionCacheData = { ...data };

    delete without.deleted;

    return without;
  }

  const subscriptions = Array.isArray(data.subscriptions)
    ? data.subscriptions.filter((s) => !is_deleted_subscription(s, deleted))
    : [];

  return { ...data, subscriptions, deleted };
}

export function with_deleted_senders(
  data: SubscriptionCacheData,
  sender_emails: string[],
  deleted_at: string = new Date().toISOString(),
): SubscriptionCacheData {
  const removed = new Set(sender_emails.map(normalize_sender_email));
  const remaining = data.subscriptions.filter(
    (sub) => !removed.has(normalize_sender_email(sub.sender_email)),
  );

  return apply_deleted_subscriptions(
    { ...data, subscriptions: remaining },
    sender_emails.map((sender_email) => ({ sender_email, deleted_at })),
  );
}

const known_deleted = new Map<string, DeletedSubscription[]>();

function remember_deleted(
  vault: EncryptedVault,
  deleted: DeletedSubscription[] | undefined,
): DeletedSubscription[] {
  const account = vault.identity_key || "";
  const merged = merge_deleted_subscriptions(
    known_deleted.get(account),
    deleted,
  );

  known_deleted.set(account, merged);

  return merged;
}

function with_known_deleted(
  data: SubscriptionCacheData,
  vault: EncryptedVault,
): SubscriptionCacheData {
  return apply_deleted_subscriptions(
    data,
    remember_deleted(vault, data.deleted),
  );
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
const SUBSCRIPTION_RECIPIENT_LIMIT = 20;

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

  if (
    trimmed.routing_token !== undefined &&
    is_oversized(trimmed.routing_token)
  ) {
    delete trimmed.routing_token;
  }

  if (
    trimmed.recipients !== undefined &&
    (!Array.isArray(trimmed.recipients) ||
      trimmed.recipients.length > SUBSCRIPTION_RECIPIENT_LIMIT ||
      trimmed.recipients.some(is_oversized))
  ) {
    delete trimmed.recipients;
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
  const key = await derive_subscriptions_key(with_identity_key(vault));
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
  const key = is_usable_identity_key(vault.identity_key)
    ? await derive_subscriptions_key(vault)
    : null;
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

interface CacheSnapshot {
  data: SubscriptionCacheData | null;
  nonce: string | null;
}

const SUBSCRIPTIONS_CONFLICT_CODE = "SUBSCRIPTIONS_VERSION_CONFLICT";
const SAVE_CONFLICT_RETRIES = 3;

const last_snapshot = new WeakMap<EncryptedVault, CacheSnapshot>();

async function fetch_subscription_cache(
  vault: EncryptedVault,
): Promise<CacheSnapshot | null> {
  try {
    const response = await api_client.get<GetSubscriptionsApiResponse>(
      "/settings/v1/preferences/subscriptions",
    );

    if (response.error || !response.data) {
      return null;
    }

    const { encrypted_subscriptions, subscriptions_nonce } = response.data;

    const snapshot: CacheSnapshot =
      !encrypted_subscriptions || !subscriptions_nonce
        ? { data: null, nonce: null }
        : {
            data: with_known_deleted(
              await decrypt_subscriptions(
                encrypted_subscriptions,
                subscriptions_nonce,
                vault,
              ),
              vault,
            ),
            nonce: subscriptions_nonce,
          };

    last_snapshot.set(vault, snapshot);

    return snapshot;
  } catch {
    return null;
  }
}

export async function load_subscription_cache(
  vault: EncryptedVault,
): Promise<SubscriptionCacheData | null> {
  return (await fetch_subscription_cache(vault))?.data ?? null;
}

function stable_text(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(
            Object.entries(item as Record<string, unknown>)
              .filter(([, field]) => field !== undefined)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          )
        : item,
    ) ?? ""
  );
}

function pick_changed<T>(base: T, local: T, remote: T): T {
  return stable_text(local) === stable_text(base) ? remote : local;
}

function merge_subscription(
  base: CachedSubscription | undefined,
  local: CachedSubscription | undefined,
  remote: CachedSubscription | undefined,
): CachedSubscription | undefined {
  if (stable_text(local) === stable_text(base)) return remote;
  if (stable_text(remote) === stable_text(base)) return local;
  if (!local) return remote;
  if (!remote) return local;

  const status_source =
    local.status !== base?.status || remote.status === base?.status
      ? local
      : remote;

  return {
    ...remote,
    ...local,
    status: status_source.status,
    unsubscribed_at: status_source.unsubscribed_at,
  };
}

export function merge_subscription_caches(
  base: SubscriptionCacheData | null,
  local: SubscriptionCacheData,
  remote: SubscriptionCacheData | null,
): SubscriptionCacheData {
  const index = (data: SubscriptionCacheData | null) =>
    new Map(
      (data?.subscriptions ?? []).map((s) => [s.sender_email, s] as const),
    );
  const base_map = index(base);
  const local_map = index(local);
  const remote_map = index(remote);
  const order = [
    ...Array.from(local_map.keys()),
    ...Array.from(remote_map.keys()).filter((email) => !local_map.has(email)),
  ];
  const subscriptions: CachedSubscription[] = [];

  for (const email of order) {
    const entry = merge_subscription(
      base_map.get(email),
      local_map.get(email),
      remote_map.get(email),
    );

    if (entry) subscriptions.push(entry);
  }

  const merged: SubscriptionCacheData = {
    ...(remote ?? {}),
    ...local,
    subscriptions,
    last_scan_ts:
      pick_changed(
        base?.last_scan_ts,
        local.last_scan_ts,
        remote?.last_scan_ts,
      ) ?? "",
    last_scan_message_ts: pick_changed(
      base?.last_scan_message_ts,
      local.last_scan_message_ts,
      remote?.last_scan_message_ts,
    ),
    version: pick_changed(base?.version, local.version, remote?.version),
    scan_progress: pick_changed(
      base?.scan_progress,
      local.scan_progress,
      remote?.scan_progress,
    ),
    deleted: merge_deleted_subscriptions(
      base?.deleted,
      local.deleted,
      remote?.deleted,
    ),
  };

  return apply_deleted_subscriptions(
    Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== undefined),
    ) as unknown as SubscriptionCacheData,
  );
}

function keep_legacy_move(
  data: SubscriptionCacheData,
  stored: SubscriptionCacheData | null,
): SubscriptionCacheData {
  if (data.legacy_move || !stored?.legacy_move) return data;

  return { ...data, legacy_move: stored.legacy_move };
}

async function put_subscription_cache(
  data: SubscriptionCacheData,
  vault: EncryptedVault,
): Promise<boolean> {
  try {
    let base = last_snapshot.get(vault) ?? (await fetch_subscription_cache(vault));

    if (!base) return false;

    let next = with_known_deleted(keep_legacy_move(data, base.data), vault);

    for (let attempt = 0; attempt <= SAVE_CONFLICT_RETRIES; attempt += 1) {
      const { encrypted, nonce } = await encrypt_subscriptions(next, vault);

      const response = await api_client.put<SaveSubscriptionsApiResponse>(
        "/settings/v1/preferences/subscriptions",
        {
          encrypted_subscriptions: encrypted,
          subscriptions_nonce: nonce,
          expected_nonce: base.nonce ?? "",
        },
      );

      if (!response.error && response.data?.success === true) {
        last_snapshot.set(vault, {
          data: compact_subscription_cache(next),
          nonce,
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CACHE_SAVED_EVENT));
        }

        return true;
      }

      if (response.server_code !== SUBSCRIPTIONS_CONFLICT_CODE) return false;

      const remote = await fetch_subscription_cache(vault);

      if (!remote) return false;

      next = with_known_deleted(
        keep_legacy_move(
          merge_subscription_caches(base.data, next, remote.data),
          remote.data,
        ),
        vault,
      );
      base = remote;
    }

    return false;
  } catch {
    return false;
  }
}

let sender_status_chain: Promise<unknown> = Promise.resolve();

function in_save_order<T>(run: () => Promise<T>): Promise<T> {
  const result = sender_status_chain.then(run, run);

  sender_status_chain = result.catch(() => false);

  return result;
}

export function save_subscription_cache(
  data: SubscriptionCacheData,
  vault: EncryptedVault,
): Promise<boolean> {
  return in_save_order(() => put_subscription_cache(data, vault));
}

export interface UnsubscribedSenderDetails {
  sender_name: string;
  unsubscribe_link?: string;
  list_unsubscribe_header?: string;
}

function sender_domain(sender_email: string): string {
  return sender_email.slice(sender_email.lastIndexOf("@") + 1);
}

function with_sender_status(
  cached: SubscriptionCacheData | null,
  sender_email: string,
  unsubscribed: boolean,
  details: UnsubscribedSenderDetails | undefined,
  now: string,
): SubscriptionCacheData | null {
  const subscriptions = cached?.subscriptions ?? [];
  const existing = subscriptions.find((s) => s.sender_email === sender_email);
  const target_status = unsubscribed ? "unsubscribed" : "active";

  if (existing?.status === target_status) return null;
  if (!existing && !unsubscribed) return null;

  const updated: CachedSubscription = existing
    ? {
        ...existing,
        status: target_status,
        unsubscribed_at: unsubscribed ? now : undefined,
      }
    : {
        sender_email,
        sender_name: details?.sender_name ?? "",
        domain: sender_domain(sender_email),
        email_count: 1,
        last_received: now,
        unsubscribe_link: details?.unsubscribe_link,
        list_unsubscribe_header: details?.list_unsubscribe_header,
        has_one_click: false,
        category: "unknown",
        status: "unsubscribed",
        unsubscribed_at: now,
      };

  return {
    ...(cached ?? { last_scan_ts: "" }),
    subscriptions: existing
      ? subscriptions.map((s) => (s === existing ? updated : s))
      : [...subscriptions, updated],
  };
}

export function set_cached_sender_status(
  vault: EncryptedVault,
  sender_email: string,
  unsubscribed: boolean,
  details?: UnsubscribedSenderDetails,
): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const fetched = await fetch_subscription_cache(vault);

    if (!fetched) return false;

    const next = with_sender_status(
      fetched.data,
      sender_email,
      unsubscribed,
      details,
      new Date().toISOString(),
    );

    if (!next) return true;

    return put_subscription_cache(next, vault);
  };

  return in_save_order(run);
}

export interface ImportedUnsubscribedSender extends UnsubscribedSenderDetails {
  sender_email: string;
}

export interface LegacyUnsubscribedRecord extends ImportedUnsubscribedSender {
  id: string;
}

function has_deletion_record(
  cached: SubscriptionCacheData | null,
  sender_email: string,
): boolean {
  const target = normalize_sender_email(sender_email);

  return (cached?.deleted ?? []).some((d) => d.sender_email === target);
}

function with_imported_senders(
  cached: SubscriptionCacheData | null,
  senders: ImportedUnsubscribedSender[],
  now: string,
): SubscriptionCacheData | null {
  const known = new Set(
    (cached?.subscriptions ?? []).map((s) => s.sender_email),
  );
  let next = cached;

  for (const sender of senders) {
    if (known.has(sender.sender_email)) continue;
    if (has_deletion_record(cached, sender.sender_email)) continue;

    const updated = with_sender_status(
      next,
      sender.sender_email,
      true,
      sender,
      now,
    );

    if (!updated) continue;
    known.add(sender.sender_email);
    next = updated;
  }

  return next;
}

export function move_legacy_unsubscribed_senders(
  vault: EncryptedVault,
  records: LegacyUnsubscribedRecord[],
): Promise<string[] | null> {
  const run = async (): Promise<string[] | null> => {
    const fetched = await fetch_subscription_cache(vault);

    if (!fetched) return null;
    if (fetched.data?.legacy_move) {
      return [...fetched.data.legacy_move.pending_ids];
    }

    const now = new Date().toISOString();
    const imported = with_imported_senders(fetched.data, records, now);
    const stored = new Set(
      (imported?.subscriptions ?? []).map((s) => s.sender_email),
    );
    const pending_ids = records
      .filter(
        (r) =>
          stored.has(r.sender_email) ||
          has_deletion_record(fetched.data, r.sender_email),
      )
      .map((r) => r.id);
    const next: SubscriptionCacheData = {
      ...(imported ?? { subscriptions: [], last_scan_ts: "" }),
      legacy_move: { moved_at: now, pending_ids },
    };

    return (await put_subscription_cache(next, vault)) ? pending_ids : null;
  };

  return in_save_order(run);
}

export function finish_legacy_record_removal(
  vault: EncryptedVault,
  removed_ids: string[],
): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    const fetched = await fetch_subscription_cache(vault);
    const move = fetched?.data?.legacy_move;

    if (!fetched?.data || !move) return false;

    const removed = new Set(removed_ids);
    const pending_ids = move.pending_ids.filter((id) => !removed.has(id));

    if (pending_ids.length === move.pending_ids.length) return true;

    return put_subscription_cache(
      { ...fetched.data, legacy_move: { ...move, pending_ids } },
      vault,
    );
  };

  return in_save_order(run);
}

export async function list_cached_unsubscribed_senders(
  vault: EncryptedVault,
): Promise<string[] | null> {
  const fetched = await fetch_subscription_cache(vault);

  if (!fetched) return null;

  return (fetched.data?.subscriptions ?? [])
    .filter((s) => s.status === "unsubscribed")
    .map((s) => s.sender_email);
}
