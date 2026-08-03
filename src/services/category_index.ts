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
import type { EmailCategory, InboxEmail } from "@/types/email";

import {
  secure_encrypt,
  secure_decrypt,
} from "@/services/crypto/secure_storage";
import {
  has_vault_in_memory,
  on_vault_cleared,
} from "@/services/crypto/memory_key_store";
import { get_current_account_id } from "@/services/account_manager";
import {
  list_mail_items,
  sync_mail_items,
  type MailItem,
} from "@/services/api/mail";
import {
  decrypt_mail_metadata,
  update_item_metadata,
} from "@/services/crypto/mail_metadata";
import { classify, CATEGORY_TABS } from "@/services/mail_categorizer";
import {
  BUILTIN_CATEGORY_IDS,
  fold_builtin,
  is_custom_category_id,
  type CustomCategoryRule,
} from "@/data/category_catalog";
import { decrypt_envelope } from "@/hooks/email_list_helpers";
import { on_mail_event, MAIL_EVENTS } from "@/hooks/mail_events";

const DB_NAME = "astermail_category_index";
const STORE_NAME = "indexes";
const BUILD_FETCH_SIZE = 1000;
const BUILD_DECRYPT_CHUNK = 100;
const BUILD_CAP = 50000;
const MAX_ENTRIES = 60000;
const CAP_TARGET = 50000;
const PERSIST_DEBOUNCE_MS = 1500;
const NOTIFY_THROTTLE_MS = 350;
const RESYNC_DEBOUNCE_MS = 4000;
const RESYNC_MIN_INTERVAL_MS = 20000;
const DELETE_SYNC_TOKEN_PREFIX = "aster_delete_sync_token_";
const FUTURE_NEW_SKEW_MS = 15 * 60 * 1000;
// A build that makes no forward progress for this long is considered wedged
// (e.g. an in-flight request whose abort timer was frozen while the tab was
// backgrounded and never settled). Recovery paths may then supersede it
// instead of deferring forever to a dead `build_in_progress` latch.
const BUILD_STALE_MS = 90000;
const BUILD_FETCH_DEADLINE_MS = 75000;

export interface CategoryIndexEntry {
  id: string;
  thread_token?: string;
  message_ts: string;
  is_read: boolean;
  category: EmailCategory;
  category_pinned?: boolean;
  snoozed_until?: string;
}

export interface CategoryCount {
  total: number;
  unread: number;
  new_count: number;
}

export type CategoryCounts = Partial<Record<EmailCategory, CategoryCount>>;

interface PersistedIndex {
  entries: CategoryIndexEntry[];
  built_at_ms: number;
  fully_built: boolean;
  seen_ts?: Record<string, number>;
}

interface PersistedMeta {
  chunked: true;
  chunk_count: number;
  built_at_ms: number;
  fully_built: boolean;
  seen_ts?: Record<string, number>;
}

const PERSIST_CHUNK_COUNT = 32;

const dirty_chunks = new Set<number>();
let persist_running = false;
let persist_rerun = false;

function chunk_of(id: string): number {
  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }

  return hash % PERSIST_CHUNK_COUNT;
}

function chunk_record_key(account_key: string, index: number): string {
  return `${account_key}:c${index}`;
}

function mark_dirty(id: string): void {
  dirty_chunks.add(chunk_of(id));
}

function mark_all_dirty(): void {
  for (let i = 0; i < PERSIST_CHUNK_COUNT; i++) {
    dirty_chunks.add(i);
  }
}

let active_account_id: string | null = null;
let index_generation = 0;
let entries_map: Map<string, CategoryIndexEntry> = new Map();
let fully_built = false;
let last_build_ms = 0;
let seen_ts: Record<string, number> = {};
let loaded_for_account: string | null = null;
let build_in_progress = false;
let build_capped = false;
let build_progress_ms = 0;
let build_token = 0;
let version = 0;
let sort_order: "asc" | "desc" = "desc";
let ensure_loaded_promise: Promise<boolean> | null = null;
let ensure_loaded_account: string | null = null;
let persist_timer: ReturnType<typeof setTimeout> | null = null;
let notify_timer: ReturnType<typeof setTimeout> | null = null;
let resync_timer: ReturnType<typeof setTimeout> | null = null;
let resync_failures = 0;
let listeners_started = false;

const MAX_RESYNC_FAILURES = 5;

const BUILTIN_CATEGORY_ID_SET = new Set(BUILTIN_CATEGORY_IDS);

// The set of tabs actually rendered right now (built-ins the user enabled,
// plus their custom categories). Defaults to the classic 4-tab layout until
// use_inbox_categories pushes the real preference-derived list.
let active_tabs: string[] = [...(CATEGORY_TABS as readonly string[])];
let custom_categories: CustomCategoryRule[] = [];

export function set_active_tabs(tabs: string[]): void {
  const next = tabs.includes("primary") ? tabs : ["primary", ...tabs];

  if (
    next.length === active_tabs.length &&
    next.every((t, i) => t === active_tabs[i])
  ) {
    return;
  }

  active_tabs = next;
  derived = null;
  version += 1;
  notify();
}

export function get_active_tabs(): readonly string[] {
  return active_tabs;
}

export function set_custom_categories(rules: CustomCategoryRule[]): void {
  custom_categories = rules;
  // Existing entries were classified with the previous rule set, so a full
  // reconcile is needed to pick up new/changed custom-category matches.
  void build_index({ force: true });
}

// Maps a raw classify() result onto one of the currently active tabs, walking
// the built-in fold_target chain (e.g. Forums -> Updates -> Primary) until it
// lands on a tab the user actually has enabled. Disabled custom categories
// fold to Primary rather than disappearing silently.
function fold_category(raw: EmailCategory): EmailCategory {
  if (active_tabs.includes(raw)) return raw;

  if (is_custom_category_id(raw)) return "primary";

  if (!BUILTIN_CATEGORY_ID_SET.has(raw)) return "primary";

  let target = fold_builtin(raw);
  let guard = 0;

  while (!active_tabs.includes(target) && target !== "primary" && guard < 8) {
    target = fold_builtin(target);
    guard += 1;
  }

  return active_tabs.includes(target) ? target : "primary";
}

const listeners = new Set<() => void>();
const in_flight_reclassify = new Map<string, boolean>();
const recent_reclassify_meta = new Map<string, string>();
const recently_read = new Map<string, number>();

const RECENT_READ_GUARD_MS = 30000;

function note_recently_read(id: string): void {
  recently_read.set(id, now_ms());
  if (recently_read.size > 500) {
    const oldest = recently_read.keys().next().value;

    if (oldest) recently_read.delete(oldest);
  }
}

function now_ms(): number {
  return new Date().getTime();
}

function safe_ts(value: string | undefined): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();

  return Number.isNaN(ms) ? 0 : ms;
}

function open_db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function notify(): void {
  version += 1;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      return;
    }
  });
}

function notify_soon(): void {
  if (notify_timer) clearTimeout(notify_timer);

  notify_timer = setTimeout(() => {
    notify_timer = null;
    notify();
  }, NOTIFY_THROTTLE_MS);
}

function schedule_persist(): void {
  if (persist_timer) {
    clearTimeout(persist_timer);
  }

  persist_timer = setTimeout(() => {
    persist_timer = null;
    void persist_now();
  }, PERSIST_DEBOUNCE_MS);
}

async function persist_now(): Promise<void> {
  if (!active_account_id) return;
  if (loaded_for_account !== active_account_id) return;

  if (persist_running) {
    persist_rerun = true;

    return;
  }

  persist_running = true;

  const account_key = active_account_id;
  const writing = Array.from(dirty_chunks);

  dirty_chunks.clear();

  try {
    const chunk_entries: CategoryIndexEntry[][] = writing.map(() => []);

    if (writing.length > 0) {
      const slot_by_chunk = new Map<number, number>();

      writing.forEach((chunk_index, slot) => slot_by_chunk.set(chunk_index, slot));

      for (const entry of entries_map.values()) {
        const slot = slot_by_chunk.get(chunk_of(entry.id));

        if (slot !== undefined) chunk_entries[slot].push(entry);
      }
    }

    const meta: PersistedMeta = {
      chunked: true,
      chunk_count: PERSIST_CHUNK_COUNT,
      built_at_ms: last_build_ms,
      fully_built,
      seen_ts,
    };
    const encrypted_meta = await secure_encrypt(JSON.stringify(meta));
    const encrypted_chunks: [number, string][] = [];

    for (let slot = 0; slot < writing.length; slot++) {
      encrypted_chunks.push([
        writing[slot],
        await secure_encrypt(JSON.stringify(chunk_entries[slot])),
      ]);
    }

    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.put(encrypted_meta, account_key);
      for (const [chunk_index, blob] of encrypted_chunks) {
        store.put(blob, chunk_record_key(account_key, chunk_index));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch (e) {
    for (const chunk_index of writing) {
      dirty_chunks.add(chunk_index);
    }

    const is_quota = e instanceof DOMException && e.name === "QuotaExceededError";

    console.warn(
      `category_index: failed to persist index${is_quota ? " (quota exceeded)" : ""}`,
      e,
    );
  } finally {
    persist_running = false;

    if (persist_rerun) {
      persist_rerun = false;
      void persist_now();
    }
  }
}

function read_store_record(
  db: IDBDatabase,
  key: string,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);

    request.onsuccess = () => resolve(request.result as string | undefined);
    request.onerror = () => reject(request.error);
  });
}

function clean_seen_map(raw_seen: unknown): Record<string, number> {
  const clean_seen: Record<string, number> = Object.create(null);

  if (raw_seen && typeof raw_seen === "object") {
    for (const [tab, value] of Object.entries(
      raw_seen as Record<string, unknown>,
    )) {
      if (
        (BUILTIN_CATEGORY_ID_SET.has(tab) || is_custom_category_id(tab)) &&
        typeof value === "number" &&
        Number.isFinite(value)
      ) {
        clean_seen[tab] = value;
      }
    }
  }

  return clean_seen;
}

function collect_valid_entries(
  raw_entries: unknown,
  into: [string, CategoryIndexEntry][],
): void {
  if (!Array.isArray(raw_entries)) return;

  for (const e of raw_entries as CategoryIndexEntry[]) {
    if (e && typeof e.id === "string" && typeof e.message_ts === "string") {
      into.push([e.id, e]);
    }
  }
}

async function load_from_disk(account_id: string): Promise<void> {
  let db: IDBDatabase | null = null;

  try {
    db = await open_db();

    const encrypted = await read_store_record(db, account_id);

    if (!encrypted) return;
    if (active_account_id !== account_id) return;

    const decrypted = await secure_decrypt(encrypted);

    if (active_account_id !== account_id) return;

    // Defense in depth: the blob is HMAC-authenticated, but still validate the
    // decoded shape before trusting it. Build a null-prototype seen map keyed
    // only by known tabs, and accept only well-formed entries.
    const payload = JSON.parse(decrypted) as Partial<PersistedIndex> &
      Partial<PersistedMeta>;
    const valid_entries: [string, CategoryIndexEntry][] = [];

    if (payload.chunked === true) {
      const chunk_count =
        Number.isInteger(payload.chunk_count) &&
        (payload.chunk_count as number) > 0 &&
        (payload.chunk_count as number) <= 256
          ? (payload.chunk_count as number)
          : 0;

      if (chunk_count === 0) return;

      for (let i = 0; i < chunk_count; i++) {
        const encrypted_chunk = await read_store_record(
          db,
          chunk_record_key(account_id, i),
        );

        if (!encrypted_chunk) continue;
        if (active_account_id !== account_id) return;

        const decrypted_chunk = await secure_decrypt(encrypted_chunk);

        if (active_account_id !== account_id) return;

        collect_valid_entries(JSON.parse(decrypted_chunk), valid_entries);
      }
    } else {
      if (!Array.isArray(payload.entries)) return;

      collect_valid_entries(payload.entries, valid_entries);
      mark_all_dirty();
    }

    entries_map = new Map(valid_entries);
    fully_built = payload.fully_built === true;
    last_build_ms =
      typeof payload.built_at_ms === "number" ? payload.built_at_ms : 0;
    seen_ts = clean_seen_map(payload.seen_ts);
  } catch {
    return;
  } finally {
    db?.close();
  }
}

async function ensure_loaded(): Promise<boolean> {
  const account_id = await get_current_account_id();

  if (!account_id) return false;

  if (loaded_for_account === account_id) {
    active_account_id = account_id;

    return true;
  }

  // Deduplicate concurrent calls for the same account. Without this, two
  // simultaneous callers (e.g. React StrictMode or rapid auth state changes)
  // each increment build_token, which aborts the other caller's in-progress
  // build and leaves the index stuck in an unbuilt state.
  if (ensure_loaded_promise && ensure_loaded_account === account_id) {
    return ensure_loaded_promise;
  }

  ensure_loaded_account = account_id;
  ensure_loaded_promise = (async (): Promise<boolean> => {
    try {
      build_token += 1;
      index_generation += 1;
      active_account_id = account_id;
      entries_map = new Map();
      dirty_chunks.clear();
      fully_built = false;
      last_build_ms = 0;

      // Stamps recorded before hydration (the boot-time mark_category_seen)
      // must survive the disk load, or already-viewed tabs flash "new" again.
      const pre_load_seen = seen_ts;

      seen_ts = {};
      await load_from_disk(account_id);

      if (active_account_id !== account_id) return false;

      for (const [tab, pending] of Object.entries(pre_load_seen)) {
        if (typeof pending === "number" && pending > (seen_ts[tab] ?? 0)) {
          seen_ts[tab] = pending;
        }
      }

      loaded_for_account = account_id;
      schedule_persist();
      notify();

      return true;
    } finally {
      if (ensure_loaded_account === account_id) {
        ensure_loaded_promise = null;
        ensure_loaded_account = null;
      }
    }
  })();

  return ensure_loaded_promise;
}

function apply_upsert(
  incoming: CategoryIndexEntry[],
  guard_recent_read = false,
): boolean {
  let changed = false;

  for (const raw of incoming) {
    if (!raw.id) continue;
    const existing = entries_map.get(raw.id);
    let entry = raw;

    if (guard_recent_read && existing?.is_read && !raw.is_read) {
      const noted = recently_read.get(raw.id);

      if (noted && now_ms() - noted < RECENT_READ_GUARD_MS) {
        entry = { ...raw, is_read: true };
      }
    }

    if (
      !existing ||
      existing.category !== entry.category ||
      existing.is_read !== entry.is_read ||
      existing.message_ts !== entry.message_ts ||
      (existing.category_pinned ?? false) !==
        (entry.category_pinned ?? false) ||
      (existing.snoozed_until ?? "") !== (entry.snoozed_until ?? "")
    ) {
      entries_map.set(entry.id, entry);
      mark_dirty(entry.id);
      changed = true;
    }
  }

  return changed;
}

// Bounds memory over a long session: keep only the most recent CAP_TARGET
// entries once the map grows past MAX_ENTRIES (tabs care about recent mail).
function enforce_cap(): void {
  // Never reshape entries_map while a full build is iterating/pruning against it.
  if (build_in_progress) return;
  if (entries_map.size <= MAX_ENTRIES) return;

  const newest = Array.from(entries_map.values())
    .sort((a, b) => safe_ts(b.message_ts) - safe_ts(a.message_ts))
    .slice(0, CAP_TARGET);

  entries_map = new Map(newest.map((e) => [e.id, e]));
  build_capped = true;
  fully_built = false;
  mark_all_dirty();
}

export function get_index_generation(): number {
  return index_generation;
}

export function upsert_entries(
  incoming: CategoryIndexEntry[],
  generation?: number,
  guard_recent_read = false,
): void {
  if (incoming.length === 0) return;
  if (generation !== undefined && generation !== index_generation) return;

  if (apply_upsert(incoming, guard_recent_read)) {
    enforce_cap();
    schedule_persist();
    notify_soon();
  }
}

export function set_ids_read(ids: string[], is_read: boolean): void {
  let changed = false;

  for (const id of ids) {
    const entry = entries_map.get(id);

    if (entry && entry.is_read !== is_read) {
      entries_map.set(id, { ...entry, is_read });
      mark_dirty(id);
      if (is_read) note_recently_read(id);
      changed = true;
    }
  }

  if (changed) {
    schedule_persist();
    notify();
  }
}

export function mark_thread_read_entries(thread_token: string): void {
  if (!thread_token) return;

  let changed = false;

  for (const [id, entry] of entries_map) {
    if (entry.thread_token === thread_token && !entry.is_read) {
      entries_map.set(id, { ...entry, is_read: true });
      mark_dirty(id);
      note_recently_read(id);
      changed = true;
    }
  }

  if (changed) {
    schedule_persist();
    notify();
  }
}

export function remove_thread_entries(thread_token: string): string[] {
  if (!thread_token) return [];

  const removed: string[] = [];

  for (const [id, entry] of entries_map) {
    if (entry.thread_token === thread_token) {
      entries_map.delete(id);
      mark_dirty(id);
      removed.push(id);
    }
  }

  if (removed.length > 0) {
    schedule_persist();
    notify();
  }

  return removed;
}

export function remove_ids(ids: string[]): void {
  let changed = false;

  for (const id of ids) {
    if (entries_map.delete(id)) {
      mark_dirty(id);
      changed = true;
    }
  }

  if (changed) {
    schedule_persist();
    notify();
  }
}

interface DerivedData {
  version: number;
  counts: CategoryCounts;
  pages: Map<EmailCategory, string[]>;
  unread_reps: Set<string>;
  thread_reps: Map<string, string>;
}

let derived: DerivedData | null = null;

function empty_counts(): CategoryCounts {
  const counts: CategoryCounts = {};

  for (const tab of active_tabs) {
    counts[tab] = { total: 0, unread: 0, new_count: 0 };
  }

  return counts;
}

// Derived view (thread dedup, per-tab counts, pre-sorted page lists) is built
// in a single pass and cached per `version`, so repeated get_counts /
// get_page_ids calls during rendering are O(1) lookups, not O(n log n) rebuilds.
let thread_grouping = true;
let wake_timer: ReturnType<typeof setTimeout> | null = null;

export function set_thread_grouping(enabled: boolean): void {
  if (enabled === thread_grouping) return;
  thread_grouping = enabled;
  version += 1;
  notify();
}

function arm_wake_timer(deadline_ms: number): void {
  if (wake_timer) clearTimeout(wake_timer);
  const delay = Math.min(
    Math.max(deadline_ms - now_ms(), 0) + 1000,
    6 * 60 * 60 * 1000,
  );

  wake_timer = setTimeout(() => {
    wake_timer = null;
    version += 1;
    notify();
  }, delay);
}

function compute_derived(): DerivedData {
  const best = new Map<
    string,
    {
      entry: CategoryIndexEntry;
      ts: number;
      any_unread: boolean;
      pinned_category?: EmailCategory;
      pinned_ts: number;
    }
  >();
  const derive_wall = now_ms();
  let earliest_wake = 0;

  for (const entry of entries_map.values()) {
    if (entry.snoozed_until) {
      const wake = safe_ts(entry.snoozed_until);

      if (wake > derive_wall) {
        if (earliest_wake === 0 || wake < earliest_wake) earliest_wake = wake;

        continue;
      }
    }
    const key =
      entry.thread_token && thread_grouping
        ? `t:${entry.thread_token}`
        : `i:${entry.id}`;
    const ts = safe_ts(entry.message_ts);
    const current = best.get(key);

    if (!current) {
      best.set(key, {
        entry,
        ts,
        any_unread: !entry.is_read,
        pinned_category: entry.category_pinned ? entry.category : undefined,
        pinned_ts: entry.category_pinned ? ts : 0,
      });

      continue;
    }

    current.any_unread = current.any_unread || !entry.is_read;
    if (entry.category_pinned && ts >= current.pinned_ts) {
      current.pinned_category = entry.category;
      current.pinned_ts = ts;
    }
    if (ts > current.ts) {
      current.entry = entry;
      current.ts = ts;
    }
  }

  const counts = empty_counts();
  const grouped = new Map<EmailCategory, { id: string; ts: number }[]>();
  const unread_reps = new Set<string>();
  const thread_reps = new Map<string, string>();
  const wall = derive_wall;

  for (const tab of active_tabs) {
    grouped.set(tab, []);
  }

  for (const [key, rep] of best) {
    const tab = fold_category(rep.pinned_category ?? rep.entry.category);
    const bucket = counts[tab];
    const list = grouped.get(tab);

    if (!bucket || !list) continue;
    thread_reps.set(key, rep.entry.id);
    bucket.total += 1;
    if (rep.any_unread) {
      bucket.unread += 1;
      unread_reps.add(rep.entry.id);
      if (
        rep.ts > (seen_ts[tab] ?? 0) &&
        rep.ts <= wall + FUTURE_NEW_SKEW_MS
      ) {
        bucket.new_count += 1;
      }
    }
    list.push({ id: rep.entry.id, ts: rep.ts });
  }

  const pages = new Map<EmailCategory, string[]>();

  for (const [tab, list] of grouped) {
    list.sort((a, b) => (sort_order === "asc" ? a.ts - b.ts : b.ts - a.ts));
    pages.set(
      tab,
      list.map((item) => item.id),
    );
  }

  if (earliest_wake > 0) {
    arm_wake_timer(earliest_wake);
  } else if (wake_timer) {
    clearTimeout(wake_timer);
    wake_timer = null;
  }

  return { version, counts, pages, unread_reps, thread_reps };
}

function ensure_derived(): DerivedData {
  if (!derived || derived.version !== version) {
    derived = compute_derived();
  }

  return derived;
}

export function get_counts(): CategoryCounts {
  return ensure_derived().counts;
}

export function is_index_loaded(): boolean {
  return loaded_for_account !== null;
}

export function mark_category_seen(category: EmailCategory): void {
  // Stamp "seen" at the client clock, and absorb only entries whose timestamp
  // is at or before now. message_ts is derived from the sender-controlled Date
  // header, so a single future-dated message must NOT push the stamp forward -
  // that would blind the "new" badge to genuinely new mail arriving later.
  const wall = now_ms();
  let newest_seen_ts = 0;

  for (const entry of entries_map.values()) {
    if (fold_category(entry.category) !== category) continue;
    const ts = safe_ts(entry.message_ts);

    if (ts <= wall && ts > newest_seen_ts) newest_seen_ts = ts;
  }

  const stamp = Math.max(wall, newest_seen_ts);

  if ((seen_ts[category] ?? 0) >= stamp) return;
  seen_ts[category] = stamp;
  void persist_now();
  notify();
}

export function get_page_ids(
  category: EmailCategory,
  page: number,
  page_size: number,
): string[] {
  const ids = ensure_derived().pages.get(category) ?? [];
  const start = page * page_size;

  return ids.slice(start, start + page_size);
}

export function get_category_total(category: EmailCategory): number {
  return ensure_derived().counts[category]?.total ?? 0;
}

export function is_representative_unread(id: string): boolean {
  return ensure_derived().unread_reps.has(id);
}

export function get_category_action_ids(category: EmailCategory): {
  rep_ids: string[];
  all_ids: string[];
} {
  const rep_ids = ensure_derived().pages.get(category) ?? [];
  const rep_set = new Set(rep_ids);
  const thread_tokens = new Set<string>();

  if (thread_grouping) {
    for (const id of rep_ids) {
      const entry = entries_map.get(id);

      if (entry?.thread_token) thread_tokens.add(entry.thread_token);
    }
  }

  const all_ids: string[] = [];

  for (const [id, entry] of entries_map) {
    if (rep_set.has(id)) {
      all_ids.push(id);
    } else if (entry.thread_token && thread_tokens.has(entry.thread_token)) {
      all_ids.push(id);
    }
  }

  return { rep_ids: [...rep_ids], all_ids };
}

export function is_index_capped(): boolean {
  return build_capped;
}

export function get_thread_rep_id(id: string): string | null {
  const entry = entries_map.get(id);

  if (!entry) return null;
  const key = entry.thread_token ? `t:${entry.thread_token}` : `i:${entry.id}`;

  return ensure_derived().thread_reps.get(key) ?? null;
}

export function thread_has_unread_entries(
  thread_token: string,
  exclude_id?: string,
): boolean {
  if (!thread_token) return false;

  for (const [id, entry] of entries_map) {
    if (entry.thread_token !== thread_token) continue;
    if (entry.is_read) continue;
    if (exclude_id && id === exclude_id) continue;

    return true;
  }

  return false;
}

export function reconcile_server_read(
  rows: { id: string; is_read?: boolean }[],
): void {
  let changed = false;

  for (const row of rows) {
    if (row.is_read !== true) continue;
    const entry = entries_map.get(row.id);

    if (entry && !entry.is_read) {
      entries_map.set(row.id, { ...entry, is_read: true });
      mark_dirty(row.id);
      note_recently_read(row.id);
      changed = true;
    }
  }

  if (changed) {
    schedule_persist();
    notify();
  }
}

const sibling_verify_at = new Map<string, number>();
const SIBLING_VERIFY_COOLDOWN_MS = 60000;
const SIBLING_VERIFY_MAP_CAP = 5000;

export function reconcile_unread_thread_siblings(
  rows: { id: string; is_read?: boolean }[],
): void {
  const read_tokens = new Set<string>();
  const row_ids = new Set<string>();

  for (const row of rows) {
    row_ids.add(row.id);
    if (row.is_read !== true) continue;
    const token = entries_map.get(row.id)?.thread_token;

    if (token) read_tokens.add(token);
  }

  if (read_tokens.size === 0) return;

  const wall = now_ms();
  const stale_ids: string[] = [];

  for (const [id, entry] of entries_map) {
    if (entry.is_read) continue;
    if (row_ids.has(id)) continue;
    if (!entry.thread_token || !read_tokens.has(entry.thread_token)) continue;
    const verified = sibling_verify_at.get(id);

    if (verified && wall - verified < SIBLING_VERIFY_COOLDOWN_MS) continue;
    sibling_verify_at.set(id, wall);
    stale_ids.push(id);
  }

  if (sibling_verify_at.size > SIBLING_VERIFY_MAP_CAP) {
    for (const [id, ts] of sibling_verify_at) {
      if (wall - ts >= SIBLING_VERIFY_COOLDOWN_MS) {
        sibling_verify_at.delete(id);
      }
    }
  }

  if (stale_ids.length > 0) {
    reindex_ids(stale_ids);
  }
}

export function is_fully_built(): boolean {
  return fully_built;
}

export function is_build_in_progress(): boolean {
  return build_in_progress;
}

// True when a build claims to be running but has made no progress for longer
// than BUILD_STALE_MS. Used to distinguish a healthy (slow) build from one that
// has wedged behind a dead request, so callers can recover instead of waiting
// on a latch that will never clear without a page reload.
export function is_build_stalled(): boolean {
  return build_in_progress && now_ms() - build_progress_ms > BUILD_STALE_MS;
}

export function get_version(): number {
  return version;
}

export function set_sort_order(order: "asc" | "desc"): void {
  if (order === sort_order) return;
  sort_order = order;
  notify();
}

export function get_sort_order(): "asc" | "desc" {
  return sort_order;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

// Inbox membership is decided by the SERVER columns the API returns, never by
// the encrypted metadata blob. The blob can lag a server-side move (archive,
// trash, spam, snooze) and a stale blob would otherwise resurrect mail that
// has already left the inbox. Labels/folders mirror the server inbox filter.
function is_item_moved_out(item: MailItem): boolean {
  if (
    item.is_archived === true ||
    item.is_trashed === true ||
    item.is_spam === true
  ) {
    return true;
  }
  if ((item.labels?.length ?? 0) > 0 || (item.folders?.length ?? 0) > 0) {
    return true;
  }

  return false;
}

export function is_item_outside_inbox(item: MailItem): boolean {
  if (is_item_moved_out(item)) return true;
  if (item.snoozed_until) {
    const wake_ms = safe_ts(item.snoozed_until);

    if (wake_ms > now_ms()) return true;
  }

  return false;
}

type ItemIndexResult =
  | { kind: "upsert"; entry: CategoryIndexEntry }
  | { kind: "remove" }
  | { kind: "keep" };

async function item_to_entry(item: MailItem): Promise<ItemIndexResult> {
  if (is_item_moved_out(item)) return { kind: "remove" };
  const has_metadata = !!(item.encrypted_metadata && item.metadata_nonce);

  const [envelope, metadata] = await Promise.all([
    decrypt_envelope(item.encrypted_envelope, item.envelope_nonce),
    has_metadata
      ? decrypt_mail_metadata(
          item.encrypted_metadata!,
          item.metadata_nonce!,
          item.metadata_version,
        )
      : Promise.resolve(null),
  ]);

  if (!envelope) return { kind: "keep" };
  if (metadata?.is_trashed || metadata?.is_archived || metadata?.is_spam) {
    return { kind: "remove" };
  }

  const snoozed_until =
    item.snoozed_until && safe_ts(item.snoozed_until) > now_ms()
      ? item.snoozed_until
      : undefined;

  return {
    kind: "upsert",
    entry: {
      id: item.id,
      thread_token: item.thread_token,
      message_ts: item.message_ts || item.created_at,
      is_read: item.is_read === true || (metadata?.is_read ?? false),
      category: classify(envelope, metadata, {
        custom_categories,
        rule_category: item.rule_category,
      }),
      category_pinned:
        metadata?.category_pinned === true && !!metadata?.category,
      ...(snoozed_until ? { snoozed_until } : {}),
    },
  };
}

function with_deadline<T>(
  promise: Promise<T>,
  deadline_ms: number,
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), deadline_ms);
    }),
  ]);
}

async function entries_from_items(
  items: MailItem[],
): Promise<{ upserts: CategoryIndexEntry[]; removals: string[] }> {
  const results = await Promise.allSettled(
    items.map(async (item) => ({ id: item.id, result: await item_to_entry(item) })),
  );
  const upserts: CategoryIndexEntry[] = [];
  const removals: string[] = [];

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { id, result } = r.value;

    if (result.kind === "upsert") {
      upserts.push(result.entry);
    } else if (result.kind === "remove" && entries_map.has(id)) {
      removals.push(id);
    }
  }

  return { upserts, removals };
}

// Full reconcile pass. Runs once per account (then `fully_built` latches),
// so it never re-scans the whole mailbox on routine changes; ongoing freshness
// is incremental (event-driven removes + sync_recent). Bounded by BUILD_CAP.
export async function build_index(options?: {
  signal?: AbortSignal;
  force?: boolean;
}): Promise<void> {
  if (!has_vault_in_memory()) return;

  const ok = await ensure_loaded();

  if (!ok) return;
  if (build_in_progress) {
    // A healthy build is left alone; a wedged one is abandoned (bump the token
    // so its loop bails on the next checkpoint) so this call can take over.
    if (!is_build_stalled()) return;
    build_token += 1;
    build_in_progress = false;
  }
  if (fully_built && !options?.force) return;

  const token = build_token;

  build_in_progress = true;
  build_progress_ms = now_ms();

  try {
    let cursor: string | undefined;
    let processed = 0;
    let reached_end = false;
    const seen = new Set<string>();
    const prebuild_ids = new Set(entries_map.keys());

    for (;;) {
      if (options?.signal?.aborted || token !== build_token) return;

      const response = await with_deadline(
        list_mail_items({
          item_type: "received",
          is_trashed: false,
          is_spam: false,
          is_archived: false,
          is_snoozed: false,
          limit: BUILD_FETCH_SIZE,
          ...(cursor ? { cursor } : {}),
        }),
        BUILD_FETCH_DEADLINE_MS,
      );

      if (!response?.data) break;
      if (token !== build_token) return;

      const { items, has_more, next_cursor } = response.data;

      for (const it of items) {
        seen.add(it.id);
      }

      for (let start = 0; start < items.length; start += BUILD_DECRYPT_CHUNK) {
        const chunk = items.slice(start, start + BUILD_DECRYPT_CHUNK);
        const { upserts, removals } = await entries_from_items(chunk);

        if (options?.signal?.aborted || token !== build_token) return;

        let chunk_changed = apply_upsert(upserts, true);

        for (const id of removals) {
          if (entries_map.delete(id)) {
            mark_dirty(id);
            chunk_changed = true;
          }
        }
        if (chunk_changed) {
          notify_soon();
        }

        build_progress_ms = now_ms();

        if (start + BUILD_DECRYPT_CHUNK < items.length) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }

      processed += items.length;
      cursor = next_cursor;

      if (!has_more || !next_cursor) {
        reached_end = true;
        break;
      }

      if (processed >= BUILD_CAP) break;

      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (token !== build_token) return;

    if (reached_end) {
      for (const [id, entry] of Array.from(entries_map.entries())) {
        if (!seen.has(id) && prebuild_ids.has(id)) {
          if (
            entry.snoozed_until &&
            safe_ts(entry.snoozed_until) > now_ms()
          ) {
            continue;
          }
          entries_map.delete(id);
          mark_dirty(id);
        }
      }
    }

    fully_built = reached_end || processed >= BUILD_CAP;
    build_capped = !reached_end && processed >= BUILD_CAP;
    last_build_ms = now_ms();
    build_in_progress = false;
    void persist_now();
    notify();
  } finally {
    build_in_progress = false;
    schedule_persist();
  }
}

// Cheap incremental sync: only the newest page, never the whole mailbox.
// This is what runs on routine mail changes, so it stays O(page) even with
// a million messages. Deletions are handled by the event listeners.
export async function sync_recent(notify_new = false): Promise<void> {
  if (build_in_progress) return;
  if (!has_vault_in_memory()) return;

  const ok = await ensure_loaded();

  if (!ok) return;

  const token = build_token;

  try {
    const response = await with_deadline(
      list_mail_items({
        item_type: "received",
        is_trashed: false,
        is_spam: false,
        is_archived: false,
        is_snoozed: false,
        limit: BUILD_DECRYPT_CHUNK,
      }),
      BUILD_FETCH_DEADLINE_MS,
    );

    if (token !== build_token) return;
    if (!response?.data) {
      resync_failures += 1;
      if (resync_failures < MAX_RESYNC_FAILURES) schedule_resync();

      return;
    }
    resync_failures = 0;

    const items = response.data.items;
    const { upserts, removals } = await entries_from_items(items);

    if (token !== build_token) return;

    const newly_received_ids = notify_new
      ? upserts.filter((e) => e.id && !entries_map.has(e.id)).map((e) => e.id)
      : [];

    let changed = apply_upsert(upserts, true);

    if (newly_received_ids.length > 0) {
      for (const id of newly_received_ids) {
        window.dispatchEvent(
          new CustomEvent(MAIL_EVENTS.EMAIL_RECEIVED, { detail: { email_id: id } }),
        );
      }
    }

    for (const id of removals) {
      if (entries_map.delete(id)) {
        mark_dirty(id);
        changed = true;
      }
    }

    // Prune removals within the freshest window: any indexed entry newer than
    // the oldest item this page returned, but absent from the page, has left the
    // inbox (snoozed / archived / moved / bulk action). Bounded to one page, so
    // it stays O(page) even on huge mailboxes. Skip when the page is empty or
    // when decryption failed for all returned items - mass decrypt failure means
    // we cannot reliably distinguish "removed" from "failed to decrypt".
    if (items.length > 0 && upserts.length + removals.length > 0) {
      const returned = new Set(items.map((i) => i.id));
      let window_start = Infinity;
      let window_end = 0;

      // Only use VALID (>0) timestamps to define the window. A single item with
      // a missing/0 timestamp must not collapse window_start to 0, which would
      // prune everything outside the newest page.
      for (const item of items) {
        const ts = safe_ts(item.message_ts || item.created_at);

        if (ts > 0) {
          window_start = Math.min(window_start, ts);
          window_end = Math.max(window_end, ts);
        }
      }

      if (window_start !== Infinity) {
        const prune_wall = now_ms();

        for (const [id, entry] of entries_map) {
          const ts = safe_ts(entry.message_ts);

          if (ts > window_start && ts <= window_end && !returned.has(id)) {
            if (
              entry.snoozed_until &&
              safe_ts(entry.snoozed_until) > prune_wall
            ) {
              continue;
            }
            entries_map.delete(id);
            mark_dirty(id);
            changed = true;
          }
        }
      }
    }

    const deletions_pruned = await prune_server_deletions();

    if (token !== build_token) return;

    if (changed || deletions_pruned) {
      schedule_persist();
      notify();
    }
    last_build_ms = now_ms();
  } catch {
    resync_failures += 1;
    if (resync_failures < MAX_RESYNC_FAILURES) schedule_resync();
    return;
  }
}

function delete_sync_storage_key(): string | null {
  const account_id = get_current_account_id();

  return account_id ? `${DELETE_SYNC_TOKEN_PREFIX}${account_id}` : null;
}

async function prune_server_deletions(): Promise<boolean> {
  const storage_key = delete_sync_storage_key();

  if (!storage_key) return false;

  try {
    const since = localStorage.getItem(storage_key);

    if (!since) {
      localStorage.setItem(storage_key, new Date().toISOString());

      return false;
    }

    const response = await sync_mail_items({ since, limit: 1 });
    const data = response?.data;

    if (!data) return false;

    let changed = false;

    for (const id of data.deleted_ids ?? []) {
      if (entries_map.delete(id)) {
        mark_dirty(id);
        changed = true;
      }
    }

    if (data.sync_token) localStorage.setItem(storage_key, data.sync_token);

    return changed;
  } catch {
    return false;
  }
}

function schedule_resync(): void {
  if (resync_timer) clearTimeout(resync_timer);

  resync_timer = setTimeout(() => {
    resync_timer = null;
    const since_last = now_ms() - last_build_ms;

    if (since_last < RESYNC_MIN_INTERVAL_MS) {
      resync_timer = setTimeout(() => {
        resync_timer = null;
        void sync_recent();
      }, RESYNC_MIN_INTERVAL_MS - since_last);

      return;
    }
    void sync_recent();
  }, RESYNC_DEBOUNCE_MS);
}

async function reclassify_id(id: string): Promise<void> {
  if (!has_vault_in_memory()) return;
  if (in_flight_reclassify.has(id)) {
    in_flight_reclassify.set(id, true);

    return;
  }
  in_flight_reclassify.set(id, false);

  const generation = index_generation;

  try {
    const response = await list_mail_items({ ids: [id] });

    if (generation !== index_generation) return;

    const item = response.data?.items?.[0];

    if (!item) {
      if (entries_map.has(id)) remove_ids([id]);

      return;
    }

    if (item.item_type !== "received") {
      if (entries_map.has(id)) remove_ids([id]);

      return;
    }

    const result = await item_to_entry(item);

    if (generation !== index_generation) return;

    if (result.kind === "remove") {
      if (entries_map.has(id)) remove_ids([id]);

      return;
    }
    if (result.kind === "keep") return;

    upsert_entries([result.entry], generation, true);
  } catch {
    return;
  } finally {
    const rerun_requested = in_flight_reclassify.get(id) === true;

    in_flight_reclassify.delete(id);
    if (rerun_requested) void reclassify_id(id);
  }
}

const REINDEX_DIRECT_CAP = 20;

// Forces a full reconcile against the server inbox. Used when a thread-level
// action touched more messages than a single thread page could enumerate, so
// the index cannot be kept correct by per-id reclassify alone.
export function request_full_rebuild(): void {
  void build_index({ force: true });
}

const REINDEX_CHUNK_SIZE = 50;
const REINDEX_FULL_REBUILD_CAP = 500;

async function reclassify_many(ids: string[]): Promise<void> {
  if (!has_vault_in_memory()) return;

  const generation = index_generation;
  const pending: string[] = [];

  for (const id of ids) {
    if (in_flight_reclassify.has(id)) {
      in_flight_reclassify.set(id, true);
    } else {
      pending.push(id);
    }
  }

  for (let i = 0; i < pending.length; i += REINDEX_CHUNK_SIZE) {
    const chunk = pending.slice(i, i + REINDEX_CHUNK_SIZE);

    try {
      const response = await list_mail_items({ ids: chunk });

      if (generation !== index_generation) return;
      if (!response.data) continue;

      const items = response.data.items ?? [];
      const returned = new Set(items.map((it) => it.id));
      const gone = chunk.filter(
        (id) => !returned.has(id) && entries_map.has(id),
      );
      const received_items = items.filter(
        (it) => it.item_type === "received",
      );
      const non_received = items
        .filter((it) => it.item_type !== "received")
        .map((it) => it.id)
        .filter((id) => entries_map.has(id));
      const { upserts, removals } = await entries_from_items(received_items);

      if (generation !== index_generation) return;

      upsert_entries(upserts, generation, true);
      remove_ids([...gone, ...non_received, ...removals]);
    } catch {
      continue;
    }
  }
}

export function reindex_ids(ids: string[]): void {
  if (ids.length === 0) return;

  if (ids.length > REINDEX_FULL_REBUILD_CAP) {
    request_full_rebuild();

    return;
  }

  if (ids.length <= REINDEX_DIRECT_CAP) {
    for (const id of ids) {
      void reclassify_id(id);
    }

    return;
  }

  void reclassify_many(ids);
}

const TERMINAL_ACTIONS = new Set([
  "delete",
  "trash",
  "archive",
  "spam",
  "permanent_delete",
  "move",
]);

// Wipes the DECRYPTED index from RAM but leaves the encrypted IndexedDB blob
// intact, so a screen lock / session timeout removes plaintext category data
// from memory immediately, and it reloads instantly once the vault is unlocked.
export function clear_category_index_memory(): void {
  if (persist_timer) {
    clearTimeout(persist_timer);
    persist_timer = null;
  }
  if (notify_timer) {
    clearTimeout(notify_timer);
    notify_timer = null;
  }
  if (resync_timer) {
    clearTimeout(resync_timer);
    resync_timer = null;
  }
  if (wake_timer) {
    clearTimeout(wake_timer);
    wake_timer = null;
  }

  build_token += 1;
  index_generation += 1;
  build_in_progress = false;
  build_capped = false;
  resync_failures = 0;
  entries_map = new Map();
  recently_read.clear();
  sibling_verify_at.clear();
  dirty_chunks.clear();
  derived = null;
  seen_ts = {};
  fully_built = false;
  last_build_ms = 0;
  loaded_for_account = null;
  active_account_id = null;
  ensure_loaded_promise = null;
  ensure_loaded_account = null;
  notify();
}

export function start_event_listeners(): void {
  if (listeners_started) return;
  listeners_started = true;

  on_vault_cleared(() => {
    clear_category_index_memory();
  });

  on_mail_event(MAIL_EVENTS.EMAIL_RECEIVED, (detail) => {
    void reclassify_id(detail.email_id);
  });

  on_mail_event(MAIL_EVENTS.MAIL_ITEMS_REMOVED, (detail) => {
    remove_ids(detail.ids);
  });

  on_mail_event(MAIL_EVENTS.MAIL_ACTION, (detail) => {
    if (!detail?.action) return;

    if (TERMINAL_ACTIONS.has(detail.action)) {
      remove_ids(detail.ids ?? []);

      return;
    }

    if ((detail.action as string) === "label") {
      reindex_ids(detail.ids ?? []);
    }
  });

  on_mail_event(MAIL_EVENTS.SNOOZED_CHANGED, () => {
    resync_failures = 0;
    schedule_resync();
  });

  on_mail_event(MAIL_EVENTS.MAIL_STATS_STALE, () => {
    resync_failures = 0;
    schedule_resync();
  });

  on_mail_event(MAIL_EVENTS.MAIL_CHANGED, () => {
    resync_failures = 0;
    schedule_resync();
  });

  on_mail_event(MAIL_EVENTS.MAIL_SOFT_REFRESH, () => {
    resync_failures = 0;
    schedule_resync();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    last_build_ms = 0;

    // Returning to a backgrounded tab: a build that stalled while the tab was
    // frozen may never settle on some platforms, so supersede it rather than
    // letting the inbox sit on skeletons until a manual reload.
    if (is_build_stalled()) {
      build_token += 1;
      build_in_progress = false;
    }

    if (!fully_built) {
      // The initial reconcile never finished (interrupted or wedged). Resume it
      // instead of only running the cheap incremental sync, which bails while a
      // build is in progress and would leave the index permanently incomplete.
      void build_index();
    } else {
      schedule_resync();
    }
  });

  on_mail_event(MAIL_EVENTS.MAIL_ITEM_UPDATED, (detail) => {
    const existing = entries_map.get(detail.id);

    if (!existing) {
      // Not indexed yet (e.g. updated during the initial build). If it's a
      // substantive change to a message that should be in the inbox, pull it in
      // so read-state / category stay accurate; ignore plain flag toggles.
      const explicit_restore =
        detail.is_trashed === false ||
        detail.is_archived === false ||
        detail.is_spam === false;

      if (
        fully_built &&
        !detail.is_trashed &&
        !detail.is_archived &&
        !detail.is_spam &&
        (!!detail.encrypted_metadata || explicit_restore)
      ) {
        void reclassify_id(detail.id);
      }

      return;
    }

    if (detail.is_trashed || detail.is_archived || detail.is_spam) {
      remove_ids([detail.id]);

      return;
    }

    if (detail.encrypted_metadata && detail.metadata_nonce) {
      if (
        typeof detail.is_read === "boolean" &&
        existing.is_read !== detail.is_read
      ) {
        if (detail.is_read) note_recently_read(detail.id);
        if (apply_upsert([{ ...existing, is_read: detail.is_read }])) {
          schedule_persist();
          notify();
        }
      }

      if (recent_reclassify_meta.get(detail.id) !== detail.encrypted_metadata) {
        recent_reclassify_meta.set(detail.id, detail.encrypted_metadata);
        if (recent_reclassify_meta.size > 200) {
          const oldest = recent_reclassify_meta.keys().next().value;

          if (oldest) recent_reclassify_meta.delete(oldest);
        }
        void reclassify_id(detail.id);
      }

      return;
    }

    if (
      typeof detail.is_read === "boolean" &&
      existing.is_read !== detail.is_read
    ) {
      if (detail.is_read) note_recently_read(detail.id);
      if (apply_upsert([{ ...existing, is_read: detail.is_read }])) {
        schedule_persist();
        notify();
      }
    }
  });
}

export async function init_category_index(): Promise<void> {
  const ok = await ensure_loaded();

  if (!ok) return;
  start_event_listeners();

  if (fully_built && entries_map.size > 0) {
    void sync_recent();

    return;
  }

  void build_index({ force: fully_built && entries_map.size === 0 });
}

export async function set_message_category(
  email: InboxEmail,
  category: EmailCategory,
): Promise<boolean> {
  const result = await update_item_metadata(
    email.id,
    {
      encrypted_metadata: email.encrypted_metadata,
      metadata_nonce: email.metadata_nonce,
      metadata_version: email.metadata_version,
    },
    { category, category_pinned: true },
  );

  if (!result.success) return false;

  const existing = entries_map.get(email.id);

  upsert_entries([
    {
      id: email.id,
      thread_token: email.thread_token,
      message_ts:
        existing?.message_ts || email.raw_timestamp || email.timestamp,
      is_read: email.is_read,
      category,
      category_pinned: true,
    },
  ]);

  return true;
}

export async function clear_category_index(): Promise<void> {
  if (persist_timer) {
    clearTimeout(persist_timer);
    persist_timer = null;
  }
  if (notify_timer) {
    clearTimeout(notify_timer);
    notify_timer = null;
  }
  if (resync_timer) {
    clearTimeout(resync_timer);
    resync_timer = null;
  }
  if (wake_timer) {
    clearTimeout(wake_timer);
    wake_timer = null;
  }

  build_token += 1;
  index_generation += 1;
  entries_map = new Map();
  recently_read.clear();
  sibling_verify_at.clear();
  dirty_chunks.clear();
  fully_built = false;
  build_capped = false;
  resync_failures = 0;
  last_build_ms = 0;
  seen_ts = {};
  loaded_for_account = null;
  active_account_id = null;
  ensure_loaded_promise = null;
  ensure_loaded_account = null;
  notify();

  try {
    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}

export async function delete_category_index_for_account(
  account_id: string,
): Promise<void> {
  clear_category_index_memory();

  if (!account_id) return;

  try {
    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      store.delete(account_id);
      for (let i = 0; i < PERSIST_CHUNK_COUNT; i++) {
        store.delete(chunk_record_key(account_id, i));
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}
