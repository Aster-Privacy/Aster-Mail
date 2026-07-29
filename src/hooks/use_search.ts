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

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  list_encrypted_mail_items,
  list_mail_items,
  reencrypt_mail_item_envelope,
  type MailItem,
} from "@/services/api/mail";
import { decrypt_mail_metadata } from "@/services/crypto/mail_metadata";
import {
  decrypt_envelope_with_bytes,
  encrypt_envelope_with_identity_key,
  base64_to_array,
} from "@/services/crypto/envelope";
import {
  get_passphrase_bytes,
  get_passphrase_from_memory,
  get_vault_from_memory,
} from "@/services/crypto/memory_key_store";
import { decrypt_pgp_message_parallel } from "@/workers/pgp_decrypt_pool";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { strip_html_tags } from "@/lib/html_sanitizer";
import { get_email_username } from "@/lib/utils";
import { resolve_forwarding_display } from "@/utils/forwarding_alias";
import {
  parse_search_query,
  expand_date_shortcut,
  parse_size_value,
  parse_size_range,
  get_quick_filters,
  type ParsedOperator,
} from "@/utils/search_operators";
import { use_auth } from "@/contexts/auth_context";
import {
  decrypt_body_text_with_bundle,
  is_ratchet_envelope,
} from "@/utils/email_crypto";
import {
  normalize_envelope_from,
  normalize_envelope_recipients,
} from "@/services/crypto/envelope_normalize";
import { use_i18n } from "@/lib/i18n/context";
import { use_preferences } from "@/contexts/preferences_context";
import {
  secure_store,
  secure_retrieve,
  secure_remove,
} from "@/services/crypto/secure_storage";
import {
  bound_index_body,
  clear_search_snapshots,
  has_index_storage_headroom,
  metadata_fingerprint,
  open_snapshot_reader,
  open_snapshot_writer,
  slim_envelope_for_index,
  trim_item_for_index,
  SNAPSHOT_CHUNK_SIZE,
  type PersistedSearchEntry,
  type SnapshotMeta,
  type SnapshotWriter,
} from "@/services/search_index_store";
import {
  build_chunk_skip_plan,
  date_boundary_local,
  type ChunkSkipPlan,
} from "@/services/search_chunk_filter";
import { MAIL_EVENTS } from "@/hooks/mail_events";

export interface ActiveFilter {
  id: string;
  label: string;
  removable: boolean;
}

export type SortOption = "relevance" | "date_newest" | "date_oldest" | "sender";

export interface SearchScope {
  type: "all" | "current_folder";
  folder?: string;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: number;
  result_count?: number;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  created_at: number;
  last_used_at?: number;
}

export interface SearchResultItem {
  id: string;
  subject: string;
  preview: string;
  sender_name: string;
  sender_email: string;
  timestamp: string;
  is_read: boolean;
  is_starred: boolean;
  has_attachment: boolean;
  avatar_url?: string;
  folders?: { folder_token: string; name: string }[];
}

export interface TextHighlight {
  text: string;
  is_match: boolean;
}

export interface AutocompleteSuggestion {
  text: string;
  type: string;
}

export function compute_highlight_ranges(
  text: string,
  terms: string[],
): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  const lower = text.toLowerCase();

  for (const term of terms) {
    const term_lower = term.toLowerCase();
    let pos = 0;

    while (pos < lower.length) {
      const idx = lower.indexOf(term_lower, pos);

      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + term_lower.length });
      pos = idx + 1;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

export function apply_highlights(
  text: string,
  ranges: { start: number; end: number }[],
): TextHighlight[] {
  if (ranges.length === 0) return [{ text, is_match: false }];

  const merged: { start: number; end: number }[] = [];

  for (const range of ranges) {
    if (merged.length > 0 && range.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(
        merged[merged.length - 1].end,
        range.end,
      );
    } else {
      merged.push({ ...range });
    }
  }

  const parts: TextHighlight[] = [];
  let pos = 0;

  for (const range of merged) {
    if (range.start > pos) {
      parts.push({ text: text.slice(pos, range.start), is_match: false });
    }
    parts.push({ text: text.slice(range.start, range.end), is_match: true });
    pos = range.end;
  }

  if (pos < text.length) {
    parts.push({ text: text.slice(pos), is_match: false });
  }

  return parts;
}

export function extract_query_terms(query: string): string[] {
  return query
    .replace(/\S+:\S*/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

const SEARCH_HISTORY_LIMIT = 20;
const SAVED_SEARCH_LIMIT = 50;

function history_storage_key(user_id: string): string {
  return `aster_search_history_${user_id}`;
}

function saved_search_storage_key(user_id: string): string {
  return `aster_saved_searches_${user_id}`;
}

async function read_secure_array<T>(key: string): Promise<T[]> {
  try {
    const parsed = await secure_retrieve<T[]>(key);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function write_secure_array<T>(key: string, value: T[]): Promise<void> {
  try {
    await secure_store(key, value);
  } catch {
    return;
  }
}

function sort_saved_searches(searches: SavedSearch[]): SavedSearch[] {
  return [...searches].sort(
    (a, b) =>
      (b.last_used_at ?? b.created_at) - (a.last_used_at ?? a.created_at),
  );
}

export async function get_search_history(
  user_id: string,
): Promise<SearchHistoryEntry[]> {
  if (!user_id) return [];

  return (
    await read_secure_array<SearchHistoryEntry>(history_storage_key(user_id))
  ).sort((a, b) => b.timestamp - a.timestamp);
}

export async function add_to_history(
  user_id: string,
  query: string,
  result_count: number,
): Promise<SearchHistoryEntry[]> {
  const trimmed = query.trim();

  if (!user_id || !trimmed) return get_search_history(user_id);

  const key = history_storage_key(user_id);
  const existing = (await read_secure_array<SearchHistoryEntry>(key)).filter(
    (e) => e.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  const entry: SearchHistoryEntry = {
    id: crypto.randomUUID(),
    query: trimmed,
    timestamp: Date.now(),
    result_count,
  };
  const updated = [entry, ...existing].slice(0, SEARCH_HISTORY_LIMIT);

  await write_secure_array(key, updated);

  return updated;
}

export async function remove_from_history(
  user_id: string,
  entry_id: string,
): Promise<SearchHistoryEntry[]> {
  if (!user_id) return [];

  const key = history_storage_key(user_id);
  const updated = (await read_secure_array<SearchHistoryEntry>(key))
    .filter((e) => e.id !== entry_id)
    .sort((a, b) => b.timestamp - a.timestamp);

  await write_secure_array(key, updated);

  return updated;
}

export async function get_saved_searches(
  user_id: string,
): Promise<SavedSearch[]> {
  if (!user_id) return [];

  return sort_saved_searches(
    await read_secure_array<SavedSearch>(saved_search_storage_key(user_id)),
  );
}

export async function save_search_to_storage(
  user_id: string,
  name: string,
  query: string,
): Promise<{ success: boolean; search?: SavedSearch }> {
  const trimmed_name = name.trim();
  const trimmed_query = query.trim();

  if (!user_id || !trimmed_name || !trimmed_query) return { success: false };

  const key = saved_search_storage_key(user_id);
  const existing = await read_secure_array<SavedSearch>(key);
  const search: SavedSearch = {
    id: crypto.randomUUID(),
    name: trimmed_name,
    query: trimmed_query,
    created_at: Date.now(),
  };

  await write_secure_array(
    key,
    [search, ...existing].slice(0, SAVED_SEARCH_LIMIT),
  );

  return { success: true, search };
}

export async function delete_saved_search_from_storage(
  user_id: string,
  search_id: string,
): Promise<SavedSearch[]> {
  if (!user_id) return [];

  const key = saved_search_storage_key(user_id);
  const updated = (await read_secure_array<SavedSearch>(key)).filter(
    (s) => s.id !== search_id,
  );

  await write_secure_array(key, updated);

  return sort_saved_searches(updated);
}

export async function update_saved_search_usage(
  user_id: string,
  search_id: string,
): Promise<void> {
  if (!user_id) return;

  const key = saved_search_storage_key(user_id);
  const updated = (await read_secure_array<SavedSearch>(key)).map((s) =>
    s.id === search_id ? { ...s, last_used_at: Date.now() } : s,
  );

  await write_secure_array(key, updated);
}

export async function clear_search_data(
  user_id: string,
  options: {
    clear_history: boolean;
    clear_saved_searches: boolean;
    clear_cache: boolean;
  },
): Promise<void> {
  if (!user_id) return;

  if (options.clear_history) {
    secure_remove(history_storage_key(user_id));
  }
  if (options.clear_saved_searches) {
    secure_remove(saved_search_storage_key(user_id));
  }
  if (options.clear_cache) {
    clear_search_index();
  }
}

interface SearchState {
  query: string;
  results: SearchResultItem[];
  is_loading: boolean;
  is_searching: boolean;
  is_loading_more: boolean;
  has_more: boolean;
  total_results: number;
  search_time_ms: number;
  error: string | null;
  index_building: boolean;
  hidden_spam_trash: number;
}

interface AutocompleteState {
  suggestions: AutocompleteSuggestion[];
  selected_index: number;
}

interface AdvancedSearchState {
  raw_query: string;
  text_query: string;
  results: SearchResultItem[];
  is_loading: boolean;
  is_searching: boolean;
  has_more: boolean;
  total_results: number;
  search_time_ms: number;
  error: string | null;
  active_filters: ActiveFilter[];
  sort_option: SortOption;
  search_scope: SearchScope;
  result_folders: Map<string, number>;
}

interface QuickFilter {
  id: string;
  label: string;
  operator: string;
}

export interface SearchOptions {
  fields?: string[];
  filters?: {
    has_attachments?: boolean;
    is_starred?: boolean;
    date_from?: string;
    date_to?: string;
  };
  label_name_to_tokens?: Map<string, string[]>;
  search_body?: boolean;
}

export interface DecryptedIndexEntry {
  envelope: DecryptedEnvelope | null;
  metadata: MailItemMetadata | null;
  search_body_text: string;
  meta_fp: string;
  has_body: boolean;
}

export interface CachedIndex {
  items: MailItem[];
  decrypted: Map<string, DecryptedIndexEntry>;
  built_at: number;
  include_body: boolean;
  user_email: string;
  disk_chunk_ids: number[];
  total_indexed: number;
  complete: boolean;
  meta: SnapshotMeta | null;
}

const HASH_ALG = ["SHA", "256"].join("-");
const ENVELOPE_KEY_VERSIONS = ["astermail-envelope-v1", "astermail-import-v1"];
const ENVELOPE_FETCH_CHUNK = 100;
const INDEX_PAGE_LIMIT = 500;
const ENVELOPE_PAGE_LIMIT = 200;
const HOT_CHUNK_COUNT = 6;
const MAX_RAM_INDEX_ITEMS = HOT_CHUNK_COUNT * SNAPSHOT_CHUNK_SIZE;
const MAX_INDEX_ITEMS = 1_000_000;
const DEEP_SEGMENT_ITEMS = 10000;
const DEEP_SEGMENT_PAUSE_MS = 1500;
const MAX_SEARCH_RESULTS = 500;
const INDEX_TTL_MS = 5 * 60 * 1000;
const INDEX_TTL_MS_LOW_NETWORK = 20 * 60 * 1000;

let cached_index: CachedIndex | null = null;
let index_build_promise: Promise<CachedIndex> | null = null;
let build_generation = 0;
let deep_index_active = false;

async function try_decrypt_with_identity_key(
  encrypted: string,
  nonce_bytes: Uint8Array,
  identity_key: string,
): Promise<DecryptedEnvelope | null> {
  const encrypted_bytes = base64_to_array(encrypted);

  for (const version of ENVELOPE_KEY_VERSIONS) {
    try {
      const key_hash = await crypto.subtle.digest(
        HASH_ALG,
        new TextEncoder().encode(identity_key + version),
      );
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key_hash,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      const decrypted = await decrypt_aes_gcm_with_fallback(
        crypto_key,
        encrypted_bytes,
        nonce_bytes,
      );

      const parsed = JSON.parse(new TextDecoder().decode(decrypted));
      const from = normalize_envelope_from(parsed.from);

      if (from) parsed.from = from;

      return parsed;
    } catch {
      continue;
    }
  }

  return null;
}

const legacy_migration_attempted = new Set<string>();
let legacy_migration_inflight = 0;
const LEGACY_MIGRATION_MAX_INFLIGHT = 4;
const legacy_migration_queue: Array<() => void> = [];
let legacy_migration_disabled = true;

export function reset_legacy_migration_state(): void {
  legacy_migration_attempted.clear();
  legacy_migration_queue.length = 0;
  legacy_migration_inflight = 0;
  legacy_migration_disabled = false;
}

export function schedule_legacy_envelope_migration(
  item_id: string,
  item_type: string,
  envelope: DecryptedEnvelope,
): void {
  if (item_type !== "received") return;
  if (legacy_migration_disabled) return;
  if (legacy_migration_attempted.has(item_id)) return;

  const has_body =
    !!envelope.body_text || !!envelope.body_html || !!envelope.html_body;

  if (!has_body) return;

  legacy_migration_attempted.add(item_id);

  const envelope_snapshot = JSON.stringify(envelope);

  const run = async () => {
    legacy_migration_inflight++;

    try {
      const vault = get_vault_from_memory();

      if (!vault?.identity_key) return;

      const snapshot = JSON.parse(envelope_snapshot) as DecryptedEnvelope;

      if (!snapshot.body_text && !snapshot.body_html && !snapshot.html_body) {
        return;
      }

      const { encrypted, nonce } = await encrypt_envelope_with_identity_key(
        snapshot,
        vault.identity_key,
      );

      const response = await reencrypt_mail_item_envelope(item_id, {
        encrypted_envelope: encrypted,
        envelope_nonce: nonce,
      });

      if (!response.data) {
        legacy_migration_disabled = true;
        legacy_migration_queue.length = 0;
      }
    } catch {
      legacy_migration_disabled = true;
      legacy_migration_queue.length = 0;
    } finally {
      legacy_migration_inflight--;
      const next = legacy_migration_queue.shift();

      if (next) next();
    }
  };

  if (legacy_migration_inflight < LEGACY_MIGRATION_MAX_INFLIGHT) {
    run();
  } else {
    legacy_migration_queue.push(run);
  }
}

async function decrypt_envelope_for_search(
  encrypted: string,
  nonce: string,
  item_id: string,
  item_type: string,
): Promise<DecryptedEnvelope | null> {
  const nonce_bytes = nonce ? base64_to_array(nonce) : new Uint8Array(0);

  if (nonce_bytes.length === 0) {
    try {
      const encrypted_bytes = base64_to_array(encrypted);
      const text = new TextDecoder().decode(encrypted_bytes);

      if (!text.startsWith("-----BEGIN PGP")) {
        const parsed = JSON.parse(text) as DecryptedEnvelope;

        schedule_legacy_envelope_migration(item_id, item_type, parsed);

        return parsed;
      }

      const vault = get_vault_from_memory();
      const pass = get_passphrase_from_memory();

      if (vault?.identity_key && pass) {
        const decrypted = await decrypt_pgp_message_parallel(
          text,
          [vault.identity_key, ...(vault.previous_keys ?? [])],
          pass,
        );
        const parsed = JSON.parse(decrypted) as DecryptedEnvelope;

        schedule_legacy_envelope_migration(item_id, item_type, parsed);

        return parsed;
      }

      return null;
    } catch {
      return null;
    }
  }

  const passphrase = get_passphrase_bytes();

  if (!passphrase) return null;

  try {
    if (nonce_bytes.length === 1 && nonce_bytes[0] === 1) {
      const result = await decrypt_envelope_with_bytes<DecryptedEnvelope>(
        encrypted,
        passphrase,
      );

      zero_uint8_array(passphrase);

      if (result)
        schedule_legacy_envelope_migration(item_id, item_type, result);

      return result;
    }

    zero_uint8_array(passphrase);

    const vault = get_vault_from_memory();

    if (!vault?.identity_key) return null;

    const first_byte = base64_to_array(encrypted)[0];

    if (
      nonce_bytes.length === 12 &&
      (first_byte === 2 || first_byte === 3 || first_byte === 4)
    ) {
      const { decrypt_mail_envelope } = await import(
        "@/components/email/shared/decrypt_envelope"
      );
      const ecies_result = await decrypt_mail_envelope<DecryptedEnvelope>(
        encrypted,
        nonce,
      );

      if (ecies_result) return ecies_result;
    }

    const result = await try_decrypt_with_identity_key(
      encrypted,
      nonce_bytes,
      vault.identity_key,
    );

    if (result) return result;

    if (vault.previous_keys && vault.previous_keys.length > 0) {
      for (const prev_key of vault.previous_keys) {
        const prev_result = await try_decrypt_with_identity_key(
          encrypted,
          nonce_bytes,
          prev_key,
        );

        if (prev_result) return prev_result;
      }
    }

    return null;
  } catch {
    zero_uint8_array(passphrase);

    return null;
  }
}

export interface IndexingProgress {
  building: boolean;
  current: number;
  total: number;
}

let indexing_progress: IndexingProgress = {
  building: false,
  current: 0,
  total: 0,
};
const indexing_listeners = new Set<() => void>();

function emit_indexing(next: Partial<IndexingProgress>) {
  indexing_progress = { ...indexing_progress, ...next };
  indexing_listeners.forEach((cb) => cb());
}

function subscribe_indexing(cb: () => void): () => void {
  indexing_listeners.add(cb);

  return () => {
    indexing_listeners.delete(cb);
  };
}

function get_indexing_snapshot(): IndexingProgress {
  return indexing_progress;
}

export function use_indexing_progress(): IndexingProgress {
  return useSyncExternalStore(
    subscribe_indexing,
    get_indexing_snapshot,
    get_indexing_snapshot,
  );
}

const index_refresh_listeners = new Set<() => void>();

function emit_index_refreshed(): void {
  index_refresh_listeners.forEach((cb) => cb());
}

export function subscribe_index_refresh(cb: () => void): () => void {
  index_refresh_listeners.add(cb);

  return () => {
    index_refresh_listeners.delete(cb);
  };
}

interface PipelineOptions {
  user_email: string;
  include_body: boolean;
  prior?: Map<string, DecryptedIndexEntry>;
  my_gen: number;
  start_cursor?: string;
  stop_at_id?: string;
  max_items: number;
  hot: CachedIndex | null;
  writer: SnapshotWriter | null;
  report_progress: boolean;
}

interface PipelineResult {
  processed: number;
  next_cursor?: string;
  reached_boundary: boolean;
  fresh_count: number;
}

async function run_index_pipeline(
  options: PipelineOptions,
): Promise<PipelineResult> {
  const { user_email, include_body, prior, my_gen, hot, writer } = options;
  const incremental = !!prior && prior.size > 0;
  const batch_size = include_body ? 40 : 250;
  const page_limit = incremental ? INDEX_PAGE_LIMIT : ENVELOPE_PAGE_LIMIT;
  let cursor = options.start_cursor;
  let processed = 0;
  let fresh_count = 0;
  let known_total = 0;
  let reached_boundary = false;

  const cancel = (): never => {
    throw new Error("search_index_cancelled");
  };

  const fail = (error: string): never => {
    throw new Error(`search_fetch_failed:${error}`);
  };

  const progress = (next: Partial<IndexingProgress>): void => {
    if (options.report_progress) emit_indexing(next);
  };

  const is_reusable = (item: MailItem): boolean => {
    const prior_entry = prior?.get(item.id);
    const immutable =
      item.item_type === "received" || item.item_type === "sent";

    return (
      !!prior_entry && immutable && (prior_entry.has_body || !include_body)
    );
  };

  const fetch_envelopes = async (
    ids: string[],
  ): Promise<Map<string, MailItem>> => {
    const by_id = new Map<string, MailItem>();

    for (let i = 0; i < ids.length; i += ENVELOPE_FETCH_CHUNK) {
      const response = await list_mail_items({
        ids: ids.slice(i, i + ENVELOPE_FETCH_CHUNK),
      });

      if (my_gen !== build_generation) cancel();
      if (response.error) fail(response.error);

      for (const full of response.data?.items ?? []) {
        by_id.set(full.id, full);
      }
    }

    return by_id;
  };

  const decrypt_item = async (
    item: MailItem,
    envelope_by_id: Map<string, MailItem> | null,
  ): Promise<{ id: string; entry: DecryptedIndexEntry; fresh: boolean }> => {
    const meta_fp = metadata_fingerprint(item);
    const prior_entry = prior?.get(item.id);
    const immutable =
      item.item_type === "received" || item.item_type === "sent";

    if (prior_entry && immutable && (prior_entry.has_body || !include_body)) {
      if (prior_entry.meta_fp === meta_fp) {
        return { id: item.id, entry: prior_entry, fresh: false };
      }

      let refreshed_metadata: MailItemMetadata | null = null;

      if (item.encrypted_metadata && item.metadata_nonce) {
        refreshed_metadata = await decrypt_mail_metadata(
          item.encrypted_metadata,
          item.metadata_nonce,
          item.metadata_version,
        );
      }

      return {
        id: item.id,
        entry: { ...prior_entry, metadata: refreshed_metadata, meta_fp },
        fresh: true,
      };
    }

    const source = envelope_by_id
      ? (envelope_by_id.get(item.id) ?? null)
      : item;

    if (!source?.encrypted_envelope) {
      return {
        id: item.id,
        entry: prior_entry ?? {
          envelope: null,
          metadata: null,
          search_body_text: "",
          meta_fp,
          has_body: include_body,
        },
        fresh: false,
      };
    }

    const envelope = await decrypt_envelope_for_search(
      source.encrypted_envelope,
      source.envelope_nonce,
      item.id,
      item.item_type,
    );

    if (envelope?.body_text) {
      if (include_body || !envelope.subject) {
        const sender_email = envelope.from?.email || "";

        const bundle = await decrypt_body_text_with_bundle(
          envelope.body_text,
          user_email,
          sender_email,
          item.id,
        );

        if (bundle.subject !== null && !envelope.subject) {
          envelope.subject = bundle.subject;
        }
        envelope.body_text = include_body ? bundle.body : "";
      } else {
        envelope.body_text = "";
      }
    }
    if (envelope && !include_body) {
      envelope.body_html = "";
      envelope.html_body = "";
    }

    let metadata: MailItemMetadata | null = null;

    if (item.encrypted_metadata && item.metadata_nonce) {
      metadata = await decrypt_mail_metadata(
        item.encrypted_metadata,
        item.metadata_nonce,
        item.metadata_version,
      );
    }

    const bounded_body = bound_index_body(
      envelope ? strip_html_tags(searchable_body_source(envelope)) : "",
    );

    if (envelope) {
      envelope.body_text = bounded_body.preview_text;
    }

    return {
      id: item.id,
      entry: {
        envelope: envelope ? slim_envelope_for_index(envelope) : null,
        metadata,
        search_body_text: bounded_body.search_text,
        meta_fp,
        has_body: include_body,
      },
      fresh: true,
    };
  };

  const decrypt_page = async (
    page_items: MailItem[],
    envelope_by_id: Map<string, MailItem> | null,
  ): Promise<Map<string, DecryptedIndexEntry>> => {
    const page_entries = new Map<string, DecryptedIndexEntry>();

    for (let i = 0; i < page_items.length; i += batch_size) {
      const batch = page_items.slice(i, i + batch_size);

      const results = await Promise.allSettled(
        batch.map((item) => decrypt_item(item, envelope_by_id)),
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value.fresh) fresh_count++;
          page_entries.set(result.value.id, result.value.entry);
        }
      }

      if (my_gen !== build_generation) cancel();

      processed += batch.length;
      progress({ current: processed });

      await new Promise<void>((r) => setTimeout(r, 0));
    }

    return page_entries;
  };

  do {
    const response = await list_encrypted_mail_items({
      cursor,
      limit: page_limit,
      include_envelope: incremental ? false : undefined,
    });

    if (my_gen !== build_generation) cancel();
    if (response.error) fail(response.error);
    if (!response.data?.items?.length) {
      cursor = undefined;
      break;
    }

    cursor = response.data.next_cursor;

    if (response.data.total) {
      known_total = Math.min(response.data.total, options.max_items);
    }

    let page_items = response.data.items;

    if (options.stop_at_id) {
      const boundary = page_items.findIndex(
        (item) => item.id === options.stop_at_id,
      );

      if (boundary >= 0) {
        page_items = page_items.slice(0, boundary);
        reached_boundary = true;
      }
    }

    const room = options.max_items - processed;

    if (page_items.length > room) {
      page_items = page_items.slice(0, room);
    }

    progress({
      total: Math.max(known_total, processed + page_items.length),
    });

    const envelope_by_id = incremental
      ? await fetch_envelopes(
          page_items.filter((item) => !is_reusable(item)).map((it) => it.id),
        )
      : null;

    const page_entries = await decrypt_page(page_items, envelope_by_id);

    if (hot) {
      for (const item of page_items) {
        if (hot.items.length >= MAX_RAM_INDEX_ITEMS) break;

        const entry = page_entries.get(item.id);

        if (!entry) continue;

        hot.items.push(trim_item_for_index(item));
        hot.decrypted.set(item.id, entry);
      }
    }

    if (writer) {
      await writer.add_page(page_items, page_entries);
    }

    page_entries.clear();

    if (!hot && writer?.storage_exhausted()) break;
  } while (cursor && !reached_boundary && processed < options.max_items);

  if (my_gen !== build_generation) cancel();

  return {
    processed,
    next_cursor: reached_boundary ? undefined : cursor,
    reached_boundary,
    fresh_count,
  };
}

function empty_index(user_email: string, include_body: boolean): CachedIndex {
  return {
    items: [],
    decrypted: new Map(),
    built_at: 0,
    include_body,
    user_email,
    disk_chunk_ids: [],
    total_indexed: 0,
    complete: false,
    meta: null,
  };
}

function front_chunk_count(index: CachedIndex): number {
  return Math.ceil(index.items.length / SNAPSHOT_CHUNK_SIZE);
}

export function disk_ids_after_hot(
  chunk_ids: number[],
  hot_count: number,
): number[] {
  return chunk_ids.slice(Math.ceil(hot_count / SNAPSHOT_CHUNK_SIZE));
}

function apply_meta(index: CachedIndex, meta: SnapshotMeta): void {
  index.meta = meta;
  index.total_indexed = meta.total;
  index.complete = meta.complete;
  index.disk_chunk_ids = disk_ids_after_hot(meta.chunk_ids, index.items.length);
}

async function build_index_full(
  user_email: string,
  include_body: boolean,
  prior?: Map<string, DecryptedIndexEntry>,
): Promise<CachedIndex> {
  const my_gen = build_generation;
  const index = empty_index(user_email, include_body);

  emit_indexing({ building: true, current: 0, total: 0 });

  const writer = await open_snapshot_writer(user_email);

  try {
    const result = await run_index_pipeline({
      user_email,
      include_body,
      prior,
      my_gen,
      max_items: MAX_RAM_INDEX_ITEMS,
      hot: index,
      writer,
      report_progress: true,
    });

    index.built_at = Date.now();
    index.total_indexed = index.items.length;
    index.complete = !result.next_cursor;

    if (writer) {
      const exhausted = writer.storage_exhausted();
      const meta = await writer.finish({
        next_cursor: exhausted ? undefined : result.next_cursor,
        complete: exhausted ? false : !result.next_cursor,
        include_body,
      });

      if (meta) apply_meta(index, meta);
    }

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    cached_index = index;
    emit_indexing({ building: false, current: 0, total: 0 });

    if (index.meta && !index.meta.complete) {
      schedule_deep_index(user_email, include_body, index.meta);
    }

    return index;
  } catch (error) {
    index.items.length = 0;
    index.decrypted.clear();
    emit_indexing({ building: false, current: 0, total: 0 });
    throw error;
  }
}

async function build_index_front_refresh(
  user_email: string,
  include_body: boolean,
  stale: CachedIndex,
): Promise<CachedIndex> {
  const my_gen = build_generation;
  const prior = stale.decrypted;
  const base = stale.meta as SnapshotMeta;
  const reader = await open_snapshot_reader(user_email);
  const keep_ids = base.chunk_ids.slice(front_chunk_count(stale));
  const boundary_chunk = reader ? await reader.read(keep_ids[0]) : null;
  const boundary_id = boundary_chunk?.items[0]?.id;

  if (!boundary_id) {
    return build_index_full(user_email, include_body, prior);
  }

  const index = empty_index(user_email, include_body);

  emit_indexing({ building: true, current: 0, total: 0 });

  try {
    const result = await run_index_pipeline({
      user_email,
      include_body,
      prior,
      my_gen,
      stop_at_id: boundary_id,
      max_items: MAX_RAM_INDEX_ITEMS,
      hot: index,
      writer: null,
      report_progress: true,
    });

    if (!result.reached_boundary) {
      index.items.length = 0;
      index.decrypted.clear();
      emit_indexing({ building: false, current: 0, total: 0 });

      return build_index_full(user_email, include_body, prior);
    }

    index.built_at = Date.now();
    index.total_indexed = index.items.length;
    index.complete = base.complete;
    index.disk_chunk_ids = keep_ids;
    index.meta = base;

    const unchanged =
      result.fresh_count === 0 && index.items.length === prior.size;

    if (!unchanged) {
      const writer = await open_snapshot_writer(user_email, base);

      if (writer) {
        await writer.add_page(index.items, index.decrypted);

        if (writer.storage_exhausted()) {
          await writer.discard();
        } else {
          const meta = await writer.finish({
            next_cursor: base.next_cursor,
            complete: base.complete,
            include_body,
            keep_chunk_ids: keep_ids,
            kept_total: Math.max(base.total - stale.items.length, 0),
          });

          if (meta) apply_meta(index, meta);
        }
      }
    }

    if (my_gen !== build_generation) {
      throw new Error("search_index_cancelled");
    }

    cached_index = index;
    emit_indexing({ building: false, current: 0, total: 0 });

    if (index.meta && !index.meta.complete) {
      schedule_deep_index(user_email, include_body, index.meta);
    }

    return index;
  } catch (error) {
    index.items.length = 0;
    index.decrypted.clear();
    emit_indexing({ building: false, current: 0, total: 0 });
    throw error;
  }
}

function schedule_deep_index(
  user_email: string,
  include_body: boolean,
  base: SnapshotMeta,
): void {
  if (deep_index_active) return;

  deep_index_active = true;
  void run_deep_index(user_email, include_body, base).finally(() => {
    deep_index_active = false;
  });
}

async function run_deep_index(
  user_email: string,
  include_body: boolean,
  base: SnapshotMeta,
): Promise<void> {
  const my_gen = build_generation;
  let meta = base;

  try {
    while (
      !meta.complete &&
      meta.next_cursor &&
      meta.total < MAX_INDEX_ITEMS &&
      my_gen === build_generation
    ) {
      await new Promise<void>((r) => setTimeout(r, DEEP_SEGMENT_PAUSE_MS));

      if (my_gen !== build_generation) return;
      if (!(await has_index_storage_headroom())) return;

      const writer = await open_snapshot_writer(user_email, meta);

      if (!writer) return;

      const result = await run_index_pipeline({
        user_email,
        include_body,
        my_gen,
        start_cursor: meta.next_cursor,
        max_items: Math.min(DEEP_SEGMENT_ITEMS, MAX_INDEX_ITEMS - meta.total),
        hot: null,
        writer,
        report_progress: false,
      });

      const exhausted = writer.storage_exhausted();
      const next = await writer.finish({
        next_cursor: exhausted ? undefined : result.next_cursor,
        complete: exhausted ? false : !result.next_cursor,
        include_body,
        keep_chunk_ids: meta.chunk_ids,
        kept_total: meta.total,
        keep_first: true,
      });

      if (!next || my_gen !== build_generation) return;

      meta = next;

      if (
        cached_index &&
        cached_index.user_email === user_email &&
        cached_index.include_body === include_body
      ) {
        apply_meta(cached_index, meta);
      }

      emit_index_refreshed();

      if (result.processed === 0) return;
    }
  } catch {
    return;
  }
}

export interface ScanOptions {
  skip?: ChunkSkipPlan | null;
  on_chunk?: () => void;
}

export async function scan_search_index(
  index: CachedIndex,
  visit: (item: MailItem, entry: DecryptedIndexEntry) => boolean,
  is_aborted: () => boolean,
  options?: ScanOptions,
): Promise<boolean> {
  for (const item of index.items) {
    const entry = index.decrypted.get(item.id);

    if (!entry) continue;
    if (!visit(item, entry)) return true;
  }

  options?.on_chunk?.();

  if (index.disk_chunk_ids.length === 0) return false;

  const reader = await open_snapshot_reader(index.user_email);

  if (!reader) return false;

  const skip = options?.skip ?? null;
  const summaries = skip?.uses_summary
    ? await reader.read_summaries(index.disk_chunk_ids)
    : null;

  for (const chunk_id of index.disk_chunk_ids) {
    if (is_aborted()) return true;

    if (summaries) {
      const summary = summaries.get(chunk_id);

      if (summary && skip!.skip_by_summary(summary)) continue;
    }

    if (skip?.uses_grams) {
      const filter = await reader.read_grams(chunk_id);

      if (filter && skip.skip_by_grams(filter)) continue;
    }

    const chunk = await reader.read(chunk_id);

    if (!chunk) continue;

    const entries = new Map<string, DecryptedIndexEntry>();

    for (const entry of chunk.entries) {
      entries.set(entry.id, entry);
    }

    let stopped = false;

    for (const item of chunk.items) {
      const entry = entries.get(item.id);

      if (!entry) continue;
      if (!visit(item, entry)) {
        stopped = true;
        break;
      }
    }

    entries.clear();

    if (stopped) return true;

    options?.on_chunk?.();

    await new Promise<void>((r) => setTimeout(r, 0));
  }

  return false;
}

export function clear_search_index(): void {
  cached_index = null;
  build_generation++;
  index_build_promise = null;
  emit_indexing({ building: false, current: 0, total: 0 });
  void clear_search_snapshots();
}

export interface IndexPerson {
  name: string;
  email: string;
  count: number;
}

export function list_index_people(
  direction: "from" | "to",
  limit = 200,
): IndexPerson[] {
  if (!cached_index) return [];

  const by_email = new Map<string, IndexPerson>();

  const track = (name: string, email: string) => {
    const clean_email = (email || "").trim().toLowerCase();

    if (!clean_email || !clean_email.includes("@")) return;

    const existing = by_email.get(clean_email);

    if (existing) {
      existing.count++;
      if (!existing.name && name) existing.name = name.trim();

      return;
    }

    by_email.set(clean_email, {
      name: (name || "").trim(),
      email: clean_email,
      count: 1,
    });
  };

  for (const item of cached_index.items) {
    const envelope = cached_index.decrypted.get(item.id)?.envelope;

    if (!envelope) continue;

    if (direction === "from") {
      track(envelope.from?.name || "", envelope.from?.email || "");
      continue;
    }

    for (const recipient of envelope.to || []) {
      track(recipient.name, recipient.email);
    }
    for (const recipient of envelope.cc || []) {
      track(recipient.name, recipient.email);
    }
  }

  return Array.from(by_email.values())
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email))
    .slice(0, limit);
}

export function mark_search_index_stale(): void {
  if (cached_index) {
    cached_index.built_at = 0;
  }
}

export async function prewarm_search_index(
  user_email: string,
  include_body: boolean,
): Promise<void> {
  try {
    await build_search_index(user_email, include_body);
  } catch {
    return;
  }
}

function start_background_rebuild(
  user_email: string,
  include_body: boolean,
  stale?: CachedIndex | null,
): Promise<CachedIndex> {
  if (index_build_promise) {
    return index_build_promise;
  }

  const can_refresh_front =
    !!stale &&
    stale.items.length > 0 &&
    !!stale.meta &&
    stale.meta.chunk_ids.length > front_chunk_count(stale) &&
    (stale.meta.include_body || !include_body);

  const promise = (
    can_refresh_front && stale
      ? build_index_front_refresh(user_email, include_body, stale)
      : build_index_full(user_email, include_body, stale?.decrypted)
  )
    .then((index) => {
      emit_index_refreshed();

      return index;
    })
    .finally(() => {
      if (index_build_promise === promise) {
        index_build_promise = null;
      }
    });

  index_build_promise = promise;
  promise.catch(() => {});

  return promise;
}

async function build_search_index(
  user_email: string,
  include_body: boolean,
  ttl_ms: number = INDEX_TTL_MS,
): Promise<CachedIndex> {
  if (cached_index && cached_index.user_email !== user_email) {
    cached_index = null;
    build_generation++;
    index_build_promise = null;
  }

  const body_compatible = (index: CachedIndex | null): index is CachedIndex =>
    !!index &&
    index.user_email === user_email &&
    (index.include_body || !include_body);

  if (
    body_compatible(cached_index) &&
    Date.now() - cached_index.built_at < ttl_ms
  ) {
    return cached_index;
  }

  if (body_compatible(cached_index)) {
    const stale = cached_index;

    void start_background_rebuild(user_email, include_body, stale);

    return stale;
  }

  if (index_build_promise) {
    return index_build_promise;
  }

  const reader = await open_snapshot_reader(user_email);

  if (index_build_promise) {
    return index_build_promise;
  }
  if (body_compatible(cached_index)) {
    return cached_index;
  }

  if (!reader || reader.meta.chunk_ids.length === 0) {
    return start_background_rebuild(user_email, include_body);
  }

  const meta = reader.meta;

  if (include_body && !meta.include_body) {
    return start_background_rebuild(user_email, include_body);
  }

  const index = empty_index(user_email, meta.include_body);
  let consumed = 0;

  for (const chunk_id of meta.chunk_ids) {
    if (index.items.length >= MAX_RAM_INDEX_ITEMS) break;

    const chunk = await reader.read(chunk_id);

    consumed++;

    if (!chunk) continue;

    const entries = new Map<string, PersistedSearchEntry>();

    for (const entry of chunk.entries) {
      entries.set(entry.id, entry);
    }

    for (const item of chunk.items) {
      const entry = entries.get(item.id);

      if (!entry) continue;

      index.items.push(item);
      index.decrypted.set(item.id, {
        envelope: entry.envelope,
        metadata: entry.metadata,
        search_body_text: entry.search_body_text,
        meta_fp: entry.meta_fp,
        has_body: entry.has_body,
      });
    }
  }

  if (index_build_promise) {
    return index_build_promise;
  }
  if (body_compatible(cached_index)) {
    return cached_index;
  }

  if (index.items.length === 0) {
    return start_background_rebuild(user_email, include_body);
  }

  index.meta = meta;
  index.total_indexed = meta.total;
  index.complete = meta.complete;
  index.disk_chunk_ids = meta.chunk_ids.slice(consumed);
  cached_index = index;

  void start_background_rebuild(user_email, include_body, index);

  return index;
}

export function searchable_body_source(envelope: DecryptedEnvelope): string {
  const text = envelope.body_text || envelope.text_body || "";

  if (text && !is_ratchet_envelope(text)) return text;

  const html = envelope.body_html || envelope.html_body || "";

  if (html && !is_ratchet_envelope(html)) return html;

  return text;
}

function collect_recipient_text(envelope: DecryptedEnvelope): string {
  return [
    ...normalize_envelope_recipients(envelope.to),
    ...normalize_envelope_recipients(envelope.cc),
    ...normalize_envelope_recipients(envelope.bcc),
  ]
    .map((r) => `${r.email.toLowerCase()} ${(r.name || "").toLowerCase()}`)
    .join(" ");
}

function envelope_sender(envelope: DecryptedEnvelope): {
  name: string;
  email: string;
} {
  return normalize_envelope_from(envelope.from) ?? { name: "", email: "" };
}

function matches_operator(
  op: ParsedOperator,
  envelope: DecryptedEnvelope,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  search_body_text?: string,
): boolean {
  const val = op.value.toLowerCase();

  switch (op.type) {
    case "from": {
      const forwarding = resolve_forwarding_display(
        envelope.from,
        envelope.raw_headers,
      );
      const from = envelope_sender(envelope);
      const sender = `${from.email} ${
        forwarding?.display_sender_email || ""
      }`.toLowerCase();
      const sender_name = `${from.name} ${
        forwarding?.display_sender_name || ""
      }`.toLowerCase();

      return sender.includes(val) || sender_name.includes(val);
    }
    case "to":
      return collect_recipient_text(envelope).includes(val);
    case "subject":
      return (envelope.subject || "").toLowerCase().includes(val);
    case "has": {
      if (val === "attachment" || val === "attachments")
        return metadata?.has_attachments ?? false;
      if (!metadata?.has_attachments) return false;
      const combined =
        search_body_text ||
        (
          (envelope.body_text || "") +
          " " +
          (envelope.body_html || envelope.html_body || "")
        ).toLowerCase();
      const ext_map: Record<string, string[]> = {
        pdf: [".pdf"],
        image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"],
        document: [".doc", ".docx", ".odt", ".txt", ".rtf"],
        spreadsheet: [".xls", ".xlsx", ".ods", ".csv"],
        video: [".mp4", ".webm", ".avi", ".mov"],
        audio: [".mp3", ".wav", ".ogg", ".aac", ".flac"],
        archive: [".zip", ".rar", ".7z", ".gz", ".tar"],
      };
      const extensions = ext_map[val];

      if (!extensions) return true;

      return extensions.some((ext) => combined.includes(ext));
    }
    case "is":
      if (val === "unread") return !(metadata?.is_read ?? false);
      if (val === "read") return metadata?.is_read ?? false;
      if (val === "starred") return metadata?.is_starred ?? false;
      if (val === "unstarred") return !(metadata?.is_starred ?? false);

      return true;
    case "in": {
      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

      if (val === "anywhere") return true;
      if (val === "all") return !item.is_trashed && !item.is_spam;
      if (
        val === "inbox" &&
        item.item_type === "received" &&
        !item.is_trashed &&
        !item.is_spam
      )
        return true;
      if (val === "sent" && item.item_type === "sent") return true;
      if (val === "trash" && item.is_trashed) return true;
      if (val === "spam" && item.is_spam) return true;
      if (val === "drafts" && item.item_type === "draft") return true;

      return all_names.some((f) => f.includes(val));
    }
    case "before": {
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const target = date_boundary_local(op.value, false);

      return !isNaN(target) && ts < target;
    }
    case "after": {
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const target = date_boundary_local(op.value, false);

      return !isNaN(target) && ts > target;
    }
    case "date": {
      const range = expand_date_shortcut(val);

      if (!range) return true;
      const ts = new Date(item.message_ts || item.created_at).getTime();
      const [fy, fm, fd] = range.date_from.split("-").map(Number);
      const [ty, tm, td] = range.date_to.split("-").map(Number);
      const from_ts = new Date(fy, fm - 1, fd, 0, 0, 0, 0).getTime();
      const to_ts = new Date(ty, tm - 1, td, 23, 59, 59, 999).getTime();

      return ts >= from_ts && ts <= to_ts;
    }
    case "filename":
    case "attachment": {
      if (!metadata?.has_attachments) return false;
      const content =
        search_body_text ||
        (
          (envelope.body_text || "") +
          " " +
          (envelope.body_html || envelope.html_body || "")
        ).toLowerCase();

      return content.includes(val);
    }
    case "larger": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return true;
      const size = metadata?.size_bytes ?? 0;

      return size > threshold;
    }
    case "smaller": {
      const threshold = parse_size_value(op.value);

      if (threshold === null) return true;
      const size = metadata?.size_bytes ?? 0;

      return size < threshold;
    }
    case "size": {
      const range = parse_size_range(op.value);

      if (!range) return true;
      const size = metadata?.size_bytes ?? 0;

      return size >= range.min && size <= range.max;
    }
    case "id":
      return item.id === op.value;
    case "label":
    case "folder": {
      if (label_name_to_tokens) {
        const matching_tokens: string[] = [];

        for (const [name, tokens] of label_name_to_tokens) {
          if (name.includes(val)) {
            matching_tokens.push(...tokens);
          }
        }
        if (matching_tokens.length > 0) {
          const item_tokens = [
            ...(item.labels || []).map((l) => l.token),
            ...(item.folders || []).map((f) => f.token),
            ...(item.tag_tokens || []),
          ];

          return item_tokens.some((t) => matching_tokens.includes(t));
        }
      }
      const all_names = [
        ...(item.labels || []).map((l) => l.name.toLowerCase()),
        ...(item.folders || []).map((f) => f.name.toLowerCase()),
      ];

      return all_names.some((l) => l.length > 0 && l.includes(val));
    }
    default:
      return true;
  }
}

const BODY_CONTENT_OPERATOR_TYPES = new Set(["filename", "attachment"]);

function operator_needs_body(op: ParsedOperator): boolean {
  if (BODY_CONTENT_OPERATOR_TYPES.has(op.type)) return true;
  if (op.type === "has") {
    const val = op.value.toLowerCase();

    return val !== "attachment" && val !== "attachments";
  }

  return false;
}

function query_requires_body(
  terms: string[],
  operators: ParsedOperator[],
): boolean {
  return terms.length > 0 || operators.some(operator_needs_body);
}

export function matches_query(
  terms: string[],
  operators: ParsedOperator[],
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
  item: MailItem,
  label_name_to_tokens?: Map<string, string[]>,
  fields?: string[],
  search_body: boolean = true,
  search_body_text?: string,
): boolean {
  if (!envelope) return false;

  for (const op of operators) {
    const result = matches_operator(
      op,
      envelope,
      metadata,
      item,
      label_name_to_tokens,
      search_body_text,
    );

    if (op.negated ? result : !result) return false;
  }

  if (terms.length === 0) return true;

  const search_all = !fields || fields.length === 0 || fields.includes("all");
  const subject = (envelope.subject || "").toLowerCase();
  const forwarding = resolve_forwarding_display(
    envelope.from,
    envelope.raw_headers,
  );
  const from = envelope_sender(envelope);
  const sender_name = `${from.name} ${
    forwarding?.display_sender_name || ""
  }`.toLowerCase();
  const sender_email = `${from.email} ${
    forwarding?.display_sender_email || ""
  }`.toLowerCase();
  const recipients = collect_recipient_text(envelope);
  const body = search_body
    ? (search_body_text ??
      strip_html_tags(searchable_body_source(envelope)).toLowerCase())
    : "";

  return terms.every((term) => {
    if (search_all) {
      return (
        subject.includes(term) ||
        sender_name.includes(term) ||
        sender_email.includes(term) ||
        recipients.includes(term) ||
        (search_body && body.includes(term))
      );
    }
    let match = false;

    if (fields!.includes("subject")) match = match || subject.includes(term);
    if (fields!.includes("sender"))
      match =
        match || sender_name.includes(term) || sender_email.includes(term);
    if (fields!.includes("recipient"))
      match = match || recipients.includes(term);
    if (search_body && fields!.includes("body"))
      match = match || body.includes(term);

    return match;
  });
}

function to_search_result(
  item: MailItem,
  envelope: DecryptedEnvelope | null,
  metadata: MailItemMetadata | null,
): SearchResultItem {
  const forwarding_display = resolve_forwarding_display(
    envelope?.from,
    envelope?.raw_headers,
  );

  const from = envelope
    ? envelope_sender(envelope)
    : { name: "", email: "" };
  const outgoing =
    item.item_type === "sent" || item.item_type === "draft" ? envelope : null;
  const first_recipient = outgoing
    ? normalize_envelope_recipients(outgoing.to)[0]
    : undefined;
  const display = first_recipient ?? from;

  return {
    id: item.id,
    subject: envelope?.subject || "(Encrypted)",
    preview: envelope
      ? strip_html_tags(searchable_body_source(envelope)).substring(0, 150)
      : "",
    sender_name:
      (!first_recipient && forwarding_display?.display_sender_name) ||
      display.name ||
      get_email_username(display.email),
    sender_email:
      (!first_recipient && forwarding_display?.display_sender_email) ||
      display.email,
    timestamp: item.message_ts || item.created_at,
    is_read: metadata?.is_read ?? false,
    is_starred: metadata?.is_starred ?? false,
    has_attachment: metadata?.has_attachments ?? false,
    folders: [
      ...(item.labels || []).map((l) => ({
        folder_token: l.token,
        name: l.name,
      })),
      ...(item.folders || []).map((f) => ({
        folder_token: f.token,
        name: f.name,
      })),
    ],
  };
}

const PROGRESS_FLUSH_MS = 120;
const REFINE_CACHE_MAX_CHARS = 2_000_000;

export interface ScanCandidate {
  item: MailItem;
  entry: DecryptedIndexEntry;
  result: SearchResultItem;
  excluded_by_scope?: boolean;
}

export interface SearchMailboxScope {
  include_spam: boolean;
  include_trash: boolean;
}

export function resolve_mailbox_scope(
  operators: ParsedOperator[],
): SearchMailboxScope {
  const scope: SearchMailboxScope = {
    include_spam: false,
    include_trash: false,
  };

  for (const op of operators) {
    if (op.negated) continue;
    if (op.type !== "in" && op.type !== "label" && op.type !== "folder")
      continue;

    const val = op.value.toLowerCase();

    if (val === "anywhere") {
      scope.include_spam = true;
      scope.include_trash = true;
    } else if (val === "spam") {
      scope.include_spam = true;
    } else if (val === "trash") {
      scope.include_trash = true;
    }
  }

  return scope;
}

export function excluded_by_mailbox_scope(
  item: MailItem,
  scope: SearchMailboxScope,
): boolean {
  if (item.is_trashed && !scope.include_trash) return true;
  if (item.is_spam && !scope.include_spam) return true;

  return false;
}

export function passes_search_filters(
  item: MailItem,
  metadata: MailItemMetadata | null,
  filters?: SearchOptions["filters"],
): boolean {
  if (!filters) return true;

  if (
    filters.has_attachments !== undefined &&
    (metadata?.has_attachments ?? false) !== filters.has_attachments
  ) {
    return false;
  }
  if (
    filters.is_starred !== undefined &&
    (metadata?.is_starred ?? false) !== filters.is_starred
  ) {
    return false;
  }
  if (filters.date_from) {
    const ts = new Date(item.message_ts || item.created_at).getTime();

    if (ts < date_boundary_local(filters.date_from, false)) return false;
  }
  if (filters.date_to) {
    const ts = new Date(item.message_ts || item.created_at).getTime();

    if (ts > date_boundary_local(filters.date_to, true)) return false;
  }

  return true;
}

export interface ScanCacheEntry {
  terms: string[];
  operators: ParsedOperator[];
  options_key: string;
  built_at: number;
  saved_at: number;
  candidates: ScanCandidate[];
}

export function options_signature(options?: SearchOptions): string {
  const labels = options?.label_name_to_tokens
    ? [...options.label_name_to_tokens.entries()]
        .map(([name, tokens]) => `${name}=${tokens.join(",")}`)
        .sort()
        .join("|")
    : "";

  return JSON.stringify([
    options?.fields ?? null,
    options?.filters ?? null,
    options?.search_body ?? null,
    labels,
  ]);
}

export function operators_equal(
  a: ParsedOperator[],
  b: ParsedOperator[],
): boolean {
  if (a.length !== b.length) return false;

  return a.every(
    (op, i) =>
      op.type === b[i].type &&
      op.value === b[i].value &&
      !!op.negated === !!b[i].negated,
  );
}

export function candidates_are_cacheable(candidates: ScanCandidate[]): boolean {
  let chars = 0;

  for (const candidate of candidates) {
    chars += candidate.entry.search_body_text.length;

    if (chars > REFINE_CACHE_MAX_CHARS) return false;
  }

  return true;
}

export function can_refine_scan(
  cache: ScanCacheEntry | null,
  terms: string[],
  operators: ParsedOperator[],
  options_key: string,
  index: Pick<CachedIndex, "built_at" | "meta">,
): boolean {
  if (!cache) return false;
  if (cache.options_key !== options_key) return false;
  if (cache.built_at !== index.built_at) return false;
  if (cache.saved_at !== (index.meta?.saved_at ?? 0)) return false;
  if (!operators_equal(cache.operators, operators)) return false;

  return cache.terms.every((prev) => terms.some((next) => next.includes(prev)));
}

export function use_search() {
  const { user } = use_auth();
  const { t } = use_i18n();
  const { preferences } = use_preferences();

  const ttl = preferences.low_network_mode
    ? INDEX_TTL_MS_LOW_NETWORK
    : INDEX_TTL_MS;
  const [state, set_state] = useState<SearchState>({
    query: "",
    results: [],
    is_loading: false,
    is_searching: false,
    is_loading_more: false,
    has_more: false,
    total_results: 0,
    search_time_ms: 0,
    error: null,
    index_building: false,
    hidden_spam_trash: 0,
  });

  const abort_ref = useRef<AbortController | null>(null);
  const last_scan_ref = useRef<ScanCacheEntry | null>(null);
  const last_search_ref = useRef<{
    query: string;
    options?: SearchOptions;
  } | null>(null);

  const [autocomplete_state] = useState<AutocompleteState>({
    suggestions: [],
    selected_index: -1,
  });

  const clear_index = useCallback(() => {
    cached_index = null;
    build_generation++;
    index_build_promise = null;
    last_scan_ref.current = null;
    emit_indexing({ building: false, current: 0, total: 0 });
  }, []);

  useEffect(() => {
    const handle_mail_changed = () => {
      mark_search_index_stale();
    };

    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_mail_changed);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_mail_changed);
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_mail_changed);
    window.addEventListener(
      MAIL_EVENTS.MAIL_ITEMS_REMOVED,
      handle_mail_changed,
    );

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.EMAIL_RECEIVED,
        handle_mail_changed,
      );
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_mail_changed);
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_mail_changed,
      );
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEMS_REMOVED,
        handle_mail_changed,
      );
    };
  }, []);

  const search = useCallback(
    async (query: string, options?: SearchOptions) => {
      set_state((prev) => ({
        ...prev,
        query,
        is_searching: true,
        error: null,
      }));

      if (!query || query.length < 2) {
        last_search_ref.current = null;
        last_scan_ref.current = null;
        set_state((prev) => ({
          ...prev,
          results: [],
          is_searching: false,
          total_results: 0,
          search_time_ms: 0,
          hidden_spam_trash: 0,
        }));

        return;
      }

      last_search_ref.current = { query, options };
      abort_ref.current?.abort();

      const controller = new AbortController();

      abort_ref.current = controller;

      const start = Date.now();

      try {
        const parsed = parse_search_query(query);
        const terms = parsed.text_query
          .split(/\s+/)
          .filter((t) => t.length >= 2)
          .map((t) => t.toLowerCase());
        const operators = parsed.operators;

        if (terms.length === 0 && operators.length === 0) {
          last_scan_ref.current = null;
          set_state((prev) => ({
            ...prev,
            results: [],
            is_searching: false,
            total_results: 0,
            search_time_ms: Date.now() - start,
            hidden_spam_trash: 0,
          }));

          return;
        }

        set_state((prev) => ({ ...prev, index_building: true }));

        const search_body =
          options?.search_body !== false &&
          query_requires_body(terms, operators);
        const index = await build_search_index(
          user?.email || "",
          search_body,
          ttl,
        );

        set_state((prev) => ({ ...prev, index_building: false }));

        if (controller.signal.aborted) return;

        const candidates: ScanCandidate[] = [];
        const mailbox_scope = resolve_mailbox_scope(operators);
        const counts = { visible: 0, hidden: 0 };

        const visible_candidates = (): ScanCandidate[] =>
          candidates.filter((candidate) => !candidate.excluded_by_scope);

        const sorted_results = (): SearchResultItem[] =>
          visible_candidates()
            .map((candidate) => candidate.result)
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            );

        const visit = (item: MailItem, data: DecryptedIndexEntry): boolean => {
          const { envelope, metadata, search_body_text } = data;

          if (
            !matches_query(
              terms,
              operators,
              envelope,
              metadata,
              item,
              options?.label_name_to_tokens,
              options?.fields,
              options?.search_body !== false,
              search_body_text,
            )
          ) {
            return true;
          }

          if (!passes_search_filters(item, metadata, options?.filters)) {
            return true;
          }

          const excluded = excluded_by_mailbox_scope(item, mailbox_scope);

          candidates.push({
            item,
            entry: data,
            result: to_search_result(item, envelope, metadata),
            excluded_by_scope: excluded,
          });

          if (excluded) {
            counts.hidden++;

            return true;
          }

          counts.visible++;

          return counts.visible < MAX_SEARCH_RESULTS;
        };

        let last_flush = 0;

        const flush_progress = () => {
          if (controller.signal.aborted) return;

          const now = Date.now();

          if (now - last_flush < PROGRESS_FLUSH_MS) return;

          last_flush = now;

          const partial = sorted_results();

          set_state((prev) => ({
            ...prev,
            results: partial,
            total_results: partial.length,
            search_time_ms: now - start,
            hidden_spam_trash: counts.hidden,
          }));
        };

        const options_key = options_signature(options);
        const reusable = last_scan_ref.current;

        let stopped = false;

        if (can_refine_scan(reusable, terms, operators, options_key, index)) {
          for (const candidate of reusable!.candidates) {
            if (!visit(candidate.item, candidate.entry)) {
              stopped = true;
              break;
            }
          }
        } else {
          const probe_terms =
            options?.search_body === false ||
            (!index.include_body && index.meta?.include_body !== true);

          stopped = await scan_search_index(
            index,
            visit,
            () => controller.signal.aborted,
            {
              skip: build_chunk_skip_plan({
                terms,
                operators,
                filters: options?.filters,
                label_name_to_tokens: options?.label_name_to_tokens,
                probe_terms,
              }),
              on_chunk: flush_progress,
            },
          );
        }

        if (controller.signal.aborted) return;

        const results = sorted_results();
        const total_results = results.length;

        if (results.length > MAX_SEARCH_RESULTS) {
          results.length = MAX_SEARCH_RESULTS;
        }

        last_scan_ref.current =
          stopped || !candidates_are_cacheable(candidates)
            ? null
            : {
                terms,
                operators,
                options_key,
                built_at: index.built_at,
                saved_at: index.meta?.saved_at ?? 0,
                candidates,
              };

        set_state((prev) => ({
          ...prev,
          results,
          is_searching: false,
          total_results,
          search_time_ms: Date.now() - start,
          has_more: stopped && total_results >= MAX_SEARCH_RESULTS,
          hidden_spam_trash: counts.hidden,
        }));
      } catch (err) {
        if (controller.signal.aborted) return;

        const message = err instanceof Error ? err.message : "";

        if (message === "search_index_cancelled") {
          set_state((prev) => ({
            ...prev,
            is_searching: false,
            index_building: false,
          }));

          return;
        }

        const is_fetch_error = message.startsWith("search_fetch_failed:");

        set_state((prev) => ({
          ...prev,
          is_searching: false,
          index_building: false,
          error: is_fetch_error
            ? t("common.search_load_failed_try_again")
            : t("common.search_failed_try_again"),
        }));
      }
    },
    [user?.email, ttl, t],
  );

  useEffect(() => {
    return subscribe_index_refresh(() => {
      const last = last_search_ref.current;

      if (last) void search(last.query, last.options);
    });
  }, [search]);

  const clear_results = useCallback(() => {
    last_search_ref.current = null;
    last_scan_ref.current = null;
    set_state({
      query: "",
      results: [],
      is_loading: false,
      is_searching: false,
      is_loading_more: false,
      has_more: false,
      total_results: 0,
      search_time_ms: 0,
      error: null,
      index_building: false,
      hidden_spam_trash: 0,
    });
  }, []);

  const set_query = useCallback((query: string) => {
    set_state((prev) => ({
      ...prev,
      query,
      is_searching:
        query.length >= 2 && query !== prev.query ? true : prev.is_searching,
      results: query !== prev.query ? [] : prev.results,
    }));
  }, []);

  const start_index_build = useCallback(
    (include_body: boolean) => {
      build_search_index(user?.email || "", include_body, ttl).catch(() => {
        // first real search will surface the error
      });
    },
    [user?.email, ttl],
  );

  return {
    state,
    autocomplete_state,
    search,
    clear_results,
    clear_index,
    start_index_build,
    load_more: () => {},
    set_query,
    navigate_to_result: (_id: string) => {},
    get_autocomplete: (_query: string, _field?: string) => {},
    select_autocomplete: (_index: number) => {},
    clear_autocomplete: () => {},
  };
}

export function use_advanced_search() {
  const [raw_query, set_raw_query_state] = useState("");
  const [sort_option, set_sort_option_state] =
    useState<SortOption>("relevance");
  const [search_scope, set_search_scope_state] = useState<SearchScope>({
    type: "all",
  });

  const {
    state: underlying,
    search: underlying_search,
    clear_results: underlying_clear,
  } = use_search();

  const parsed = parse_search_query(raw_query);

  const state: AdvancedSearchState = {
    raw_query,
    text_query: parsed.text_query,
    results: underlying.results,
    is_loading: underlying.is_loading,
    is_searching: underlying.is_searching,
    has_more: underlying.has_more,
    total_results: underlying.total_results,
    search_time_ms: underlying.search_time_ms,
    error: underlying.error,
    active_filters: parsed.operators.map((op) => ({
      id: `${op.type}-${op.value}`,
      label: `${op.negated ? "-" : ""}${op.type}:${op.value}`,
      removable: true,
    })),
    sort_option,
    search_scope,
    result_folders: new Map(),
  };

  const quick_filters: QuickFilter[] = get_quick_filters();

  const search = useCallback(
    (query: string) => {
      underlying_search(query, { fields: ["all"] });
    },
    [underlying_search],
  );

  return {
    state,
    search,
    clear_results: () => {
      set_raw_query_state("");
      underlying_clear();
    },
    remove_filter: (_id: string) => {},
    add_quick_filter: (operator: string) => {
      set_raw_query_state((prev) => {
        if (prev.includes(operator)) return prev;
        const next = prev ? `${prev} ${operator}` : operator;

        underlying_search(next, { fields: ["all"] });

        return next;
      });
    },
    set_sort_option: set_sort_option_state,
    set_search_scope: set_search_scope_state,
    set_raw_query: set_raw_query_state,
    quick_filters,
    navigate_to_result: (_id: string) => {},
    load_more: () => {},
  };
}
