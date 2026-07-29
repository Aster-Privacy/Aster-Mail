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
import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";
import { get_current_account_id } from "@/services/account_manager";
import {
  normalize_chunk_summary,
  parse_gram_filter,
  summarize_chunk,
  SUMMARY_GROUP_SIZE,
  type ChunkSummary,
  type GramFilter,
  type StoredGramFilter,
} from "@/services/search_chunk_filter";

const KEY_PREFIX = "search_index_";
const SNAPSHOT_VERSION = 1;
const MANIFEST_VERSION = 5;
export const SNAPSHOT_CHUNK_SIZE = 2000;
export const MAX_INDEX_BODY_CHARS = 2048;
export const MAX_INDEX_PREVIEW_CHARS = 320;
export const MAX_INDEX_RECIPIENTS = 32;
const STORAGE_RESERVE_BYTES = 64 * 1024 * 1024;
const STORAGE_MAX_USAGE_RATIO = 0.9;
const CHUNK_CACHE_SIZE = 2;
const GRAM_CACHE_SIZE = 48;
const SUMMARY_CACHE_SIZE = 16;

interface SearchIndexManifest {
  version: number;
  user_email: string;
  saved_at: number;
  chunk_ids: number[];
  next_chunk_id: number;
  next_cursor?: string;
  complete: boolean;
  total: number;
  include_body: boolean;
}

export interface SearchIndexChunk {
  items: MailItem[];
  entries: PersistedSearchEntry[];
}

export interface SnapshotMeta {
  saved_at: number;
  chunk_ids: number[];
  next_chunk_id: number;
  next_cursor?: string;
  complete: boolean;
  total: number;
  include_body: boolean;
}

export interface PersistedSearchEntry {
  id: string;
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  search_body_text: string;
  meta_fp: string;
  has_body: boolean;
}

export interface PersistableEntry {
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  search_body_text: string;
  meta_fp: string;
  has_body: boolean;
}

export function to_persisted_entry(
  id: string,
  entry: PersistableEntry,
): PersistedSearchEntry {
  return {
    id,
    envelope: entry.envelope
      ? { ...entry.envelope, body_html: "", html_body: "" }
      : null,
    metadata: entry.metadata,
    search_body_text: entry.search_body_text,
    meta_fp: entry.meta_fp,
    has_body: entry.has_body,
  };
}

export interface SearchIndexSnapshot {
  version: number;
  user_email: string;
  saved_at: number;
  items: MailItem[];
  entries: PersistedSearchEntry[];
}

const INDEXED_HEADER_NAMES = new Set([
  "x-simplelogin-type",
  "x-simplelogin-original-from",
  "x-simplelogin-envelope-from",
  "x-anonaddy-original-sender",
]);

export function trim_item_for_index(item: MailItem): MailItem {
  return {
    ...item,
    encrypted_envelope: "",
    envelope_nonce: "",
    encrypted_metadata: "",
    metadata_nonce: undefined,
    ephemeral_key: undefined,
    ephemeral_pq_key: undefined,
    sender_sealed: undefined,
  };
}

function bound_recipients(list: unknown): { name: string; email: string }[] {
  return normalize_envelope_recipients(list)
    .slice(0, MAX_INDEX_RECIPIENTS)
    .map((r) => ({ name: r.name || "", email: r.email }));
}

export function slim_envelope_for_index(
  envelope: DecryptedEnvelope,
): DecryptedEnvelope {
  const headers = envelope.raw_headers?.filter((h) =>
    INDEXED_HEADER_NAMES.has(h.name.toLowerCase()),
  );

  return {
    subject: envelope.subject,
    body_text: envelope.body_text,
    body_html: "",
    html_body: "",
    from: normalize_envelope_from(envelope.from) ?? { name: "", email: "" },
    to: normalize_envelope_recipients(envelope.to),
    cc: bound_recipients(envelope.cc),
    bcc: bound_recipients(envelope.bcc),
    sent_at: envelope.sent_at,
    ...(headers && headers.length > 0 ? { raw_headers: headers } : {}),
  };
}

export interface BoundedIndexBody {
  search_text: string;
  preview_text: string;
}

export function bound_index_body(stripped_body: string): BoundedIndexBody {
  const bounded =
    stripped_body.length > MAX_INDEX_BODY_CHARS
      ? stripped_body.slice(0, MAX_INDEX_BODY_CHARS)
      : stripped_body;

  return {
    search_text: bounded.toLowerCase(),
    preview_text:
      bounded.length > MAX_INDEX_PREVIEW_CHARS
        ? bounded.slice(0, MAX_INDEX_PREVIEW_CHARS)
        : bounded,
  };
}

export function metadata_fingerprint(item: MailItem): string {
  const meta = item.encrypted_metadata ?? "";

  return `${item.metadata_nonce ?? ""}:${meta.length}:${meta.slice(0, 24)}`;
}

export function index_storage_ceiling(usage: number, quota: number): number {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
    return 0;
  }

  const ceiling = Math.min(
    quota * STORAGE_MAX_USAGE_RATIO,
    quota - STORAGE_RESERVE_BYTES,
  );

  return Math.max(0, ceiling - usage);
}

export async function index_storage_headroom(): Promise<number | null> {
  const manager = typeof navigator === "undefined" ? null : navigator.storage;

  if (!manager?.estimate) return null;

  try {
    const { usage, quota } = await manager.estimate();

    if (typeof usage !== "number" || typeof quota !== "number") return null;

    return index_storage_ceiling(usage, quota);
  } catch {
    return null;
  }
}

export async function has_index_storage_headroom(): Promise<boolean> {
  const headroom = await index_storage_headroom();

  return headroom === null || headroom > 0;
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

function gram_record_key(base_key: string, index: number): string {
  return `${base_key}_grams_${index}`;
}

function summary_group_key(base_key: string, group: number): string {
  return `${base_key}_sumg_${group}`;
}

function summary_group_of(chunk_id: number): number {
  return Math.floor(chunk_id / SUMMARY_GROUP_SIZE);
}

interface SummaryGroupRecord {
  summaries: Record<string, ChunkSummary>;
}

const chunk_cache = new Map<string, SearchIndexChunk>();
const gram_cache = new Map<string, GramFilter | null>();
const summary_cache = new Map<string, Record<string, ChunkSummary>>();

function cache_read<T>(cache: Map<string, T>, key: string): T | undefined {
  if (!cache.has(key)) return undefined;

  const value = cache.get(key) as T;

  cache.delete(key);
  cache.set(key, value);

  return value;
}

function cache_write<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
): void {
  cache.delete(key);
  cache.set(key, value);

  while (cache.size > limit) {
    const oldest = cache.keys().next();

    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

export function invalidate_snapshot_caches(): void {
  chunk_cache.clear();
  gram_cache.clear();
  summary_cache.clear();
}

export interface SnapshotReader {
  meta: SnapshotMeta;
  read(chunk_id: number): Promise<SearchIndexChunk | null>;
  read_summaries(chunk_ids: number[]): Promise<Map<number, ChunkSummary>>;
  read_grams(chunk_id: number): Promise<GramFilter | null>;
}

export interface SnapshotWriter {
  add_page(
    items: MailItem[],
    entries: Map<string, PersistableEntry>,
  ): Promise<void>;
  written_count(): number;
  storage_exhausted(): boolean;
  finish(options: {
    next_cursor?: string;
    complete: boolean;
    include_body: boolean;
    keep_chunk_ids?: number[];
    kept_total?: number;
    keep_first?: boolean;
  }): Promise<SnapshotMeta | null>;
  discard(): Promise<void>;
}

export async function open_snapshot_reader(
  user_email: string,
): Promise<SnapshotReader | null> {
  try {
    const encryption_key = await get_snapshot_encryption_key();

    if (!encryption_key) return null;

    const key = await snapshot_key();
    const record = await encrypted_get<SearchIndexManifest>(
      key,
      encryption_key,
    );

    if (!record || record.user_email !== user_email) return null;
    if (record.version !== MANIFEST_VERSION) return null;
    if (!Array.isArray(record.chunk_ids)) return null;

    const chunk_ids = record.chunk_ids.filter((id) => Number.isInteger(id));

    const meta: SnapshotMeta = {
      saved_at: record.saved_at,
      chunk_ids,
      next_chunk_id: Number.isInteger(record.next_chunk_id)
        ? record.next_chunk_id
        : chunk_ids.length,
      next_cursor: record.next_cursor,
      complete: !!record.complete,
      total: Number.isInteger(record.total) ? record.total : 0,
      include_body: !!record.include_body,
    };

    return {
      meta,
      read: async (chunk_id: number) => {
        const record_key = chunk_record_key(key, chunk_id);
        const cached = cache_read(chunk_cache, record_key);

        if (cached) return cached;

        try {
          const chunk = await encrypted_get<SearchIndexChunk>(
            record_key,
            encryption_key,
          );

          if (
            !chunk ||
            !Array.isArray(chunk.items) ||
            !Array.isArray(chunk.entries)
          ) {
            return null;
          }

          cache_write(chunk_cache, record_key, chunk, CHUNK_CACHE_SIZE);

          return chunk;
        } catch {
          return null;
        }
      },
      read_summaries: async (chunk_ids: number[]) => {
        const found = new Map<number, ChunkSummary>();
        const groups = new Set(chunk_ids.map(summary_group_of));

        for (const group of groups) {
          const record_key = summary_group_key(key, group);
          let summaries = cache_read(summary_cache, record_key);

          if (!summaries) {
            try {
              const record = await encrypted_get<SummaryGroupRecord>(
                record_key,
                encryption_key,
              );
              const raw = record?.summaries;

              summaries = {};

              if (raw && typeof raw === "object") {
                for (const [id, value] of Object.entries(raw)) {
                  const summary = normalize_chunk_summary(value);

                  if (summary) summaries[id] = summary;
                }
              }
            } catch {
              summaries = {};
            }

            cache_write(
              summary_cache,
              record_key,
              summaries,
              SUMMARY_CACHE_SIZE,
            );
          }

          for (const chunk_id of chunk_ids) {
            if (summary_group_of(chunk_id) !== group) continue;

            const summary = summaries[String(chunk_id)];

            if (summary) found.set(chunk_id, summary);
          }
        }

        return found;
      },
      read_grams: async (chunk_id: number) => {
        const record_key = gram_record_key(key, chunk_id);

        if (gram_cache.has(record_key)) {
          return cache_read(gram_cache, record_key) ?? null;
        }

        let filter: GramFilter | null = null;

        try {
          const stored = await encrypted_get<StoredGramFilter>(
            record_key,
            encryption_key,
          );

          filter = parse_gram_filter(stored);
        } catch {
          filter = null;
        }

        cache_write(gram_cache, record_key, filter, GRAM_CACHE_SIZE);

        return filter;
      },
    };
  } catch (error) {
    if (import.meta.env.DEV) console.error("search_snapshot_open", error);

    return null;
  }
}

export async function open_snapshot_writer(
  user_email: string,
  base?: SnapshotMeta | null,
): Promise<SnapshotWriter | null> {
  const encryption_key = await get_snapshot_encryption_key();

  if (!encryption_key) return null;

  const key = await snapshot_key();
  const saved_at = Date.now();
  const written_ids: number[] = [];
  const written_summaries = new Map<number, ChunkSummary>();
  let next_chunk_id = base?.next_chunk_id ?? 0;
  let buffer_items: MailItem[] = [];
  let buffer_entries: PersistedSearchEntry[] = [];
  let written = 0;
  let storage_exhausted = false;

  const drop_buffer = (): void => {
    buffer_items = [];
    buffer_entries = [];
  };

  const flush = async (): Promise<void> => {
    if (buffer_items.length === 0) return;

    if (storage_exhausted) {
      drop_buffer();

      return;
    }

    if (!(await has_index_storage_headroom())) {
      storage_exhausted = true;
      drop_buffer();

      return;
    }

    const chunk_id = next_chunk_id++;

    try {
      await encrypted_set(
        chunk_record_key(key, chunk_id),
        {
          items: buffer_items,
          entries: buffer_entries,
        } satisfies SearchIndexChunk,
        encryption_key,
      );

      const digest = summarize_chunk(buffer_items, buffer_entries);

      await encrypted_set(
        gram_record_key(key, chunk_id),
        digest.grams,
        encryption_key,
      );
      written_summaries.set(chunk_id, digest.summary);

      written_ids.push(chunk_id);
      written += buffer_items.length;
    } catch (error) {
      if (import.meta.env.DEV) console.error("search_snapshot_flush", error);

      storage_exhausted = true;
      written_summaries.delete(chunk_id);

      await secure_overwrite_and_delete(chunk_record_key(key, chunk_id)).catch(
        () => {},
      );
      await secure_overwrite_and_delete(gram_record_key(key, chunk_id)).catch(
        () => {},
      );
    } finally {
      drop_buffer();
    }
  };

  const prune_summary_groups = async (
    existing_keys: string[],
    live: Set<number>,
  ): Promise<void> => {
    const groups = new Map<number, Record<string, ChunkSummary>>();
    const prefix = `${key}_sumg_`;

    for (const record_key of existing_keys) {
      if (!record_key.startsWith(prefix)) continue;

      const group = Number(record_key.slice(prefix.length));

      if (!Number.isInteger(group)) {
        await secure_overwrite_and_delete(record_key);
        continue;
      }

      const record = await encrypted_get<SummaryGroupRecord>(
        record_key,
        encryption_key,
      );
      const raw = record?.summaries;
      const summaries: Record<string, ChunkSummary> = {};

      if (raw && typeof raw === "object") {
        for (const [id, value] of Object.entries(raw)) {
          const summary = normalize_chunk_summary(value);

          if (summary) summaries[id] = summary;
        }
      }

      groups.set(group, summaries);
    }

    for (const [chunk_id, summary] of written_summaries) {
      const group = summary_group_of(chunk_id);
      const summaries = groups.get(group) ?? {};

      summaries[String(chunk_id)] = summary;
      groups.set(group, summaries);
    }

    for (const [group, summaries] of groups) {
      const kept: Record<string, ChunkSummary> = {};

      for (const [id, summary] of Object.entries(summaries)) {
        if (live.has(Number(id))) kept[id] = summary;
      }

      const record_key = summary_group_key(key, group);

      if (Object.keys(kept).length === 0) {
        await secure_overwrite_and_delete(record_key);
        continue;
      }

      await encrypted_set(
        record_key,
        { summaries: kept } satisfies SummaryGroupRecord,
        encryption_key,
      );
    }
  };

  return {
    written_count: () => written + buffer_items.length,
    storage_exhausted: () => storage_exhausted,
    add_page: async (items, entries) => {
      if (storage_exhausted) return;

      for (const item of items) {
        const entry = entries.get(item.id);

        if (!entry) continue;

        buffer_items.push(trim_item_for_index(item));
        buffer_entries.push(to_persisted_entry(item.id, entry));

        if (buffer_items.length >= SNAPSHOT_CHUNK_SIZE) {
          await flush();
        }
      }
    },
    discard: async () => {
      buffer_items = [];
      buffer_entries = [];
      written_summaries.clear();
      invalidate_snapshot_caches();

      await Promise.all(
        written_ids.flatMap((id) => [
          secure_overwrite_and_delete(chunk_record_key(key, id)),
          secure_overwrite_and_delete(gram_record_key(key, id)),
        ]),
      );
    },
    finish: async ({
      next_cursor,
      complete,
      include_body,
      keep_chunk_ids,
      kept_total,
      keep_first,
    }) => {
      try {
        await flush();

        const kept = keep_chunk_ids ?? [];
        const chunk_ids = keep_first
          ? [...kept, ...written_ids]
          : [...written_ids, ...kept];
        const meta: SnapshotMeta = {
          saved_at,
          chunk_ids,
          next_chunk_id,
          next_cursor,
          complete,
          total: written + (kept_total ?? 0),
          include_body,
        };

        await encrypted_set(
          key,
          {
            version: MANIFEST_VERSION,
            user_email,
            ...meta,
          } satisfies SearchIndexManifest,
          encryption_key,
        );

        const live = new Set(chunk_ids);
        const keys = await encrypted_list_keys();
        const chunk_prefix = `${key}_chunk_`;
        const grams_prefix = `${key}_grams_`;

        invalidate_snapshot_caches();

        await Promise.all(
          keys
            .filter((k) => {
              const prefix = k.startsWith(chunk_prefix)
                ? chunk_prefix
                : k.startsWith(grams_prefix)
                  ? grams_prefix
                  : null;

              if (!prefix) return false;
              const id = Number(k.slice(prefix.length));

              return !Number.isInteger(id) || !live.has(id);
            })
            .map((k) => secure_overwrite_and_delete(k)),
        );

        await prune_summary_groups(keys, live);

        return meta;
      } catch (error) {
        if (import.meta.env.DEV) console.error("search_snapshot_save", error);

        return null;
      }
    },
  };
}

export async function clear_search_snapshots(): Promise<void> {
  invalidate_snapshot_caches();

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
  entries: Map<string, PersistableEntry>,
): SearchIndexSnapshot {
  const trimmed_items = items.map(trim_item_for_index);
  const trimmed_entries: PersistedSearchEntry[] = [];

  for (const [id, entry] of entries) {
    trimmed_entries.push(to_persisted_entry(id, entry));
  }

  return {
    version: SNAPSHOT_VERSION,
    user_email,
    saved_at: Date.now(),
    items: trimmed_items,
    entries: trimmed_entries,
  };
}
