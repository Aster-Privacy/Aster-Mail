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
const MANIFEST_VERSION = 2;
const SNAPSHOT_CHUNK_SIZE = 2000;

interface SearchIndexManifest {
  version: number;
  user_email: string;
  saved_at: number;
  chunk_count: number;
}

interface SearchIndexChunk {
  saved_at: number;
  items: MailItem[];
  entries: PersistedSearchEntry[];
}

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

function chunk_record_key(base_key: string, index: number): string {
  return `${base_key}_chunk_${index}`;
}

export async function save_search_snapshot(
  snapshot: SearchIndexSnapshot,
): Promise<void> {
  try {
    const encryption_key = await get_snapshot_encryption_key();

    if (!encryption_key) return;

    const key = await snapshot_key();
    const chunk_count = Math.max(
      1,
      Math.ceil(
        Math.max(snapshot.items.length, snapshot.entries.length) /
          SNAPSHOT_CHUNK_SIZE,
      ),
    );

    for (let i = 0; i < chunk_count; i++) {
      const start = i * SNAPSHOT_CHUNK_SIZE;
      const chunk: SearchIndexChunk = {
        saved_at: snapshot.saved_at,
        items: snapshot.items.slice(start, start + SNAPSHOT_CHUNK_SIZE),
        entries: snapshot.entries.slice(start, start + SNAPSHOT_CHUNK_SIZE),
      };

      await encrypted_set(chunk_record_key(key, i), chunk, encryption_key);
    }

    const manifest: SearchIndexManifest = {
      version: MANIFEST_VERSION,
      user_email: snapshot.user_email,
      saved_at: snapshot.saved_at,
      chunk_count,
    };

    await encrypted_set(key, manifest, encryption_key);

    const keys = await encrypted_list_keys();
    const stale_prefix = `${key}_chunk_`;

    await Promise.all(
      keys
        .filter((k) => {
          if (!k.startsWith(stale_prefix)) return false;
          const index = Number(k.slice(stale_prefix.length));

          return !Number.isInteger(index) || index >= chunk_count;
        })
        .map((k) => secure_overwrite_and_delete(k)),
    );
  } catch (error) {
    if (import.meta.env.DEV) console.error("search_snapshot_save", error);
  }
}

export async function load_search_snapshot(
  user_email: string,
): Promise<SearchIndexSnapshot | null> {
  try {
    const encryption_key = await get_snapshot_encryption_key();

    if (!encryption_key) return null;

    const key = await snapshot_key();
    const record = await encrypted_get<SearchIndexManifest | SearchIndexSnapshot>(
      key,
      encryption_key,
    );

    if (!record || record.user_email !== user_email) return null;

    if (record.version === SNAPSHOT_VERSION) {
      const legacy = record as SearchIndexSnapshot;

      if (!Array.isArray(legacy.items) || !Array.isArray(legacy.entries)) {
        return null;
      }

      return legacy;
    }

    if (record.version !== MANIFEST_VERSION) return null;

    const manifest = record as SearchIndexManifest;

    if (
      !Number.isInteger(manifest.chunk_count) ||
      manifest.chunk_count < 1 ||
      manifest.chunk_count > 1000
    ) {
      return null;
    }

    const items: MailItem[] = [];
    const entries: PersistedSearchEntry[] = [];

    for (let i = 0; i < manifest.chunk_count; i++) {
      const chunk = await encrypted_get<SearchIndexChunk>(
        chunk_record_key(key, i),
        encryption_key,
      );

      if (
        !chunk ||
        chunk.saved_at !== manifest.saved_at ||
        !Array.isArray(chunk.items) ||
        !Array.isArray(chunk.entries)
      ) {
        return null;
      }

      items.push(...chunk.items);
      entries.push(...chunk.entries);
    }

    return {
      version: SNAPSHOT_VERSION,
      user_email: manifest.user_email,
      saved_at: manifest.saved_at,
      items,
      entries,
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error("search_snapshot_load", error);

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
  const trimmed_items = items.map((item) => ({
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
