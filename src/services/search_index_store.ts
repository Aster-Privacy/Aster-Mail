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
import type { DecryptedEnvelope, MailItemMetadata } from "@/types/email";
import type { MailItem } from "@/services/api/mail";

import {
  encrypted_set,
  encrypted_get,
  encrypted_list_keys,
  secure_overwrite_and_delete,
} from "@/services/crypto/encrypted_storage";
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "@/services/crypto/memory_key_store";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { get_current_account_id } from "@/services/account_manager";

const KEY_PREFIX = "search_index_";
const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_ENTRIES = 20000;
const SNAPSHOT_CAP_TARGET = 12000;

export interface PersistedSearchEntry {
  id: string;
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  search_body_text: string;
  meta_fp: string;
  has_body: boolean;
}

export interface SearchIndexSnapshot {
  version: number;
  user_email: string;
  saved_at: number;
  items: MailItem[];
  entries: PersistedSearchEntry[];
}

export function metadata_fingerprint(item: MailItem): string {
  const meta = item.encrypted_metadata ?? "";

  return `${item.metadata_nonce ?? ""}:${meta.length}:${meta.slice(0, 24)}`;
}

async function get_snapshot_encryption_key(): Promise<CryptoKey | null> {
  if (!has_vault_in_memory()) return null;

  const raw = get_derived_encryption_key();

  if (!raw) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  zero_uint8_array(raw);

  return key;
}

async function snapshot_key(): Promise<string> {
  const account_id = await get_current_account_id();

  return `${KEY_PREFIX}${account_id ?? "unknown"}`;
}

export async function save_search_snapshot(
  snapshot: SearchIndexSnapshot,
): Promise<void> {
  try {
    const encryption_key = await get_snapshot_encryption_key();

    if (!encryption_key) return;

    const key = await snapshot_key();

    await encrypted_set(key, snapshot, encryption_key);
  } catch (error) {
    const is_quota =
      error instanceof DOMException && error.name === "QuotaExceededError";
    const approx_size_bytes = (() => {
      try {
        return JSON.stringify(snapshot).length;
      } catch {
        return -1;
      }
    })();

    console.error(
      `search_index_store: failed to persist snapshot (entries=${
        snapshot.entries.length
      }, approx_size_bytes=${approx_size_bytes}${
        is_quota ? ", quota exceeded" : ""
      })`,
      error,
    );
  }
}

export async function load_search_snapshot(
  user_email: string,
): Promise<SearchIndexSnapshot | null> {
  try {
    const encryption_key = await get_snapshot_encryption_key();

    if (!encryption_key) return null;

    const key = await snapshot_key();
    const snapshot = await encrypted_get<SearchIndexSnapshot>(
      key,
      encryption_key,
    );

    if (
      !snapshot ||
      snapshot.version !== SNAPSHOT_VERSION ||
      snapshot.user_email !== user_email ||
      !Array.isArray(snapshot.items) ||
      !Array.isArray(snapshot.entries)
    ) {
      return null;
    }

    return snapshot;
  } catch (error) {
    console.error("search_index_store: failed to load snapshot", error);

    return null;
  }
}

export async function clear_search_snapshots(): Promise<void> {
  try {
    const keys = await encrypted_list_keys();

    await Promise.all(
      keys
        .filter((k) => k.startsWith(KEY_PREFIX))
        .map((k) => secure_overwrite_and_delete(k)),
    );
  } catch {
    return;
  }
}

function item_recency_ts(item: MailItem): number {
  const ts = new Date(item.message_ts || item.created_at).getTime();

  return Number.isNaN(ts) ? 0 : ts;
}

function select_items_for_snapshot(items: MailItem[]): MailItem[] {
  if (items.length <= MAX_SNAPSHOT_ENTRIES) return items;

  return [...items]
    .sort((a, b) => item_recency_ts(b) - item_recency_ts(a))
    .slice(0, SNAPSHOT_CAP_TARGET);
}

export function build_snapshot(
  user_email: string,
  items: MailItem[],
  entries: Map<
    string,
    {
      envelope: DecryptedEnvelope | null;
      metadata: MailItemMetadata | null;
      search_body_text: string;
      meta_fp: string;
      has_body: boolean;
    }
  >,
): SearchIndexSnapshot {
  const capped_items = select_items_for_snapshot(items);
  const kept_ids =
    capped_items.length === items.length
      ? null
      : new Set(capped_items.map((item) => item.id));

  const trimmed_items = capped_items.map((item) => ({
    ...item,
    encrypted_envelope: "",
    envelope_nonce: "",
    encrypted_metadata: "",
    metadata_nonce: undefined,
    ephemeral_key: undefined,
    ephemeral_pq_key: undefined,
    sender_sealed: undefined,
  }));
  const trimmed_entries: PersistedSearchEntry[] = [];

  for (const [id, entry] of entries) {
    if (kept_ids && !kept_ids.has(id)) continue;

    trimmed_entries.push({
      id,
      envelope: entry.envelope
        ? { ...entry.envelope, body_html: "", html_body: "" }
        : null,
      metadata: entry.metadata,
      search_body_text: entry.search_body_text,
      meta_fp: entry.meta_fp,
      has_body: entry.has_body,
    });
  }

  return {
    version: SNAPSHOT_VERSION,
    user_email,
    saved_at: Date.now(),
    items: trimmed_items,
    entries: trimmed_entries,
  };
}
