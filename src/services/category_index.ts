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
import { list_mail_items, type MailItem } from "@/services/api/mail";
import {
  decrypt_mail_metadata,
  update_item_metadata,
} from "@/services/crypto/mail_metadata";
import {
  classify,
  category_for_tab,
  CATEGORY_TABS,
} from "@/services/mail_categorizer";
import { decrypt_envelope } from "@/hooks/email_list_helpers";
import { on_mail_event, MAIL_EVENTS } from "@/hooks/mail_events";

const DB_NAME = "astermail_category_index";
const STORE_NAME = "indexes";
const BUILD_PAGE_SIZE = 100;
const BUILD_CAP = 10000;
const MAX_ENTRIES = 20000;
const CAP_TARGET = 12000;
const PERSIST_DEBOUNCE_MS = 1500;
const NOTIFY_THROTTLE_MS = 350;
const RESYNC_DEBOUNCE_MS = 4000;
const RESYNC_MIN_INTERVAL_MS = 20000;
// A build that makes no forward progress for this long is considered wedged
// (e.g. an in-flight request whose abort timer was frozen while the tab was
// backgrounded and never settled). Recovery paths may then supersede it
// instead of deferring forever to a dead `build_in_progress` latch.
const BUILD_STALE_MS = 30000;

export interface CategoryIndexEntry {
  id: string;
  thread_token?: string;
  message_ts: string;
  is_read: boolean;
  category: EmailCategory;
}

export interface CategoryCount {
  total: number;
  unread: number;
  new_count: number;
}

export type CategoryCounts = Record<EmailCategory, CategoryCount>;

interface PersistedIndex {
  entries: CategoryIndexEntry[];
  built_at_ms: number;
  fully_built: boolean;
  seen_ts?: Record<string, number>;
}

let active_account_id: string | null = null;
let entries_map: Map<string, CategoryIndexEntry> = new Map();
let fully_built = false;
let last_build_ms = 0;
let seen_ts: Record<string, number> = {};
let loaded_for_account: string | null = null;
let build_in_progress = false;
let build_progress_ms = 0;
let build_token = 0;
let version = 0;
let ensure_loaded_promise: Promise<boolean> | null = null;
let ensure_loaded_account: string | null = null;
let persist_timer: ReturnType<typeof setTimeout> | null = null;
let notify_timer: ReturnType<typeof setTimeout> | null = null;
let resync_timer: ReturnType<typeof setTimeout> | null = null;
let listeners_started = false;

const listeners = new Set<() => void>();
const in_flight_reclassify = new Set<string>();

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
  if (build_in_progress) return;
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

  const account_key = active_account_id;

  try {
    const payload: PersistedIndex = {
      entries: Array.from(entries_map.values()),
      built_at_ms: last_build_ms,
      fully_built,
      seen_ts,
    };
    const encrypted = await secure_encrypt(JSON.stringify(payload));
    const db = await open_db();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).put(encrypted, account_key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}

async function load_from_disk(account_id: string): Promise<void> {
  try {
    const db = await open_db();

    const encrypted = await new Promise<string | undefined>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(account_id);

        request.onsuccess = () => resolve(request.result as string | undefined);
        request.onerror = () => reject(request.error);
      },
    );

    db.close();

    if (!encrypted) return;
    if (active_account_id !== account_id) return;

    const decrypted = await secure_decrypt(encrypted);

    if (active_account_id !== account_id) return;

    const payload = JSON.parse(decrypted) as Partial<PersistedIndex>;

    // Defense in depth: the blob is HMAC-authenticated, but still validate the
    // decoded shape before trusting it. Build a null-prototype seen map keyed
    // only by known tabs, and accept only well-formed entries.
    if (!Array.isArray(payload.entries)) return;

    const valid_entries: [string, CategoryIndexEntry][] = [];

    for (const e of payload.entries) {
      if (e && typeof e.id === "string" && typeof e.message_ts === "string") {
        valid_entries.push([e.id, e]);
      }
    }

    const clean_seen: Record<string, number> = Object.create(null);
    const raw_seen = payload.seen_ts;

    if (raw_seen && typeof raw_seen === "object") {
      for (const tab of CATEGORY_TABS) {
        const value = (raw_seen as Record<string, unknown>)[tab];

        if (typeof value === "number" && Number.isFinite(value)) {
          clean_seen[tab] = value;
        }
      }
    }

    entries_map = new Map(valid_entries);
    fully_built = payload.fully_built === true;
    last_build_ms =
      typeof payload.built_at_ms === "number" ? payload.built_at_ms : 0;
    seen_ts = clean_seen;
  } catch {
    return;
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
      active_account_id = account_id;
      entries_map = new Map();
      fully_built = false;
      last_build_ms = 0;

      // Stamps recorded before hydration (the boot-time mark_category_seen)
      // must survive the disk load, or already-viewed tabs flash "new" again.
      const pre_load_seen = seen_ts;

      seen_ts = {};
      await load_from_disk(account_id);

      if (active_account_id !== account_id) return false;

      for (const tab of CATEGORY_TABS) {
        const pending = pre_load_seen[tab];

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

function apply_upsert(incoming: CategoryIndexEntry[]): boolean {
  let changed = false;

  for (const entry of incoming) {
    if (!entry.id) continue;
    const existing = entries_map.get(entry.id);

    if (
      !existing ||
      existing.category !== entry.category ||
      existing.is_read !== entry.is_read ||
      existing.message_ts !== entry.message_ts
    ) {
      entries_map.set(entry.id, entry);
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
}

export function upsert_entries(incoming: CategoryIndexEntry[]): void {
  if (incoming.length === 0) return;

  if (apply_upsert(incoming)) {
    enforce_cap();
    schedule_persist();
    notify_soon();
  }
}

export function remove_ids(ids: string[]): void {
  let changed = false;

  for (const id of ids) {
    if (entries_map.delete(id)) {
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
}

let derived: DerivedData | null = null;

function empty_counts(): CategoryCounts {
  const counts = {} as CategoryCounts;

  for (const tab of CATEGORY_TABS) {
    counts[tab] = { total: 0, unread: 0, new_count: 0 };
  }

  return counts;
}

// Derived view (thread dedup, per-tab counts, pre-sorted page lists) is built
// in a single pass and cached per `version`, so repeated get_counts /
// get_page_ids calls during rendering are O(1) lookups, not O(n log n) rebuilds.
function compute_derived(): DerivedData {
  const best = new Map<
    string,
    { entry: CategoryIndexEntry; ts: number; any_unread: boolean }
  >();

  for (const entry of entries_map.values()) {
    const key = entry.thread_token
      ? `t:${entry.thread_token}`
      : `i:${entry.id}`;
    const ts = safe_ts(entry.message_ts);
    const current = best.get(key);

    if (!current) {
      best.set(key, { entry, ts, any_unread: !entry.is_read });

      continue;
    }

    current.any_unread = current.any_unread || !entry.is_read;
    if (ts > current.ts) {
      current.entry = entry;
      current.ts = ts;
    }
  }

  const counts = empty_counts();
  const grouped = new Map<EmailCategory, { id: string; ts: number }[]>();
  const unread_reps = new Set<string>();

  for (const tab of CATEGORY_TABS) {
    grouped.set(tab, []);
  }

  for (const rep of best.values()) {
    const tab = category_for_tab(rep.entry.category);
    const bucket = counts[tab];
    const list = grouped.get(tab);

    if (!bucket || !list) continue;
    bucket.total += 1;
    if (rep.any_unread) {
      bucket.unread += 1;
      unread_reps.add(rep.entry.id);
      if (rep.ts > (seen_ts[tab] ?? 0)) {
        bucket.new_count += 1;
      }
    }
    list.push({ id: rep.entry.id, ts: rep.ts });
  }

  const pages = new Map<EmailCategory, string[]>();

  for (const [tab, list] of grouped) {
    list.sort((a, b) => b.ts - a.ts);
    pages.set(
      tab,
      list.map((item) => item.id),
    );
  }

  return { version, counts, pages, unread_reps };
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

export function mark_category_seen(category: EmailCategory): void {
  const stamp = now_ms();

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

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

async function item_to_entry(
  item: MailItem,
): Promise<CategoryIndexEntry | null> {
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

  if (!envelope) return null;
  if (metadata?.is_trashed || metadata?.is_archived || metadata?.is_spam) {
    return null;
  }

  return {
    id: item.id,
    thread_token: item.thread_token,
    message_ts: item.message_ts || item.created_at,
    is_read: metadata?.is_read ?? item.is_read ?? false,
    category: classify(envelope, metadata),
  };
}

async function entries_from_items(
  items: MailItem[],
): Promise<CategoryIndexEntry[]> {
  const results = await Promise.allSettled(items.map(item_to_entry));

  return results
    .filter(
      (r): r is PromiseFulfilledResult<CategoryIndexEntry | null> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((e): e is CategoryIndexEntry => e !== null);
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

    for (;;) {
      if (options?.signal?.aborted || token !== build_token) return;

      const response = await list_mail_items({
        item_type: "received",
        is_trashed: false,
        is_spam: false,
        is_archived: false,
        limit: BUILD_PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      });

      if (!response.data) break;
      if (token !== build_token) return;

      const { items, has_more, next_cursor } = response.data;

      for (const it of items) {
        seen.add(it.id);
      }

      const fresh = await entries_from_items(items);

      if (token !== build_token) return;

      if (apply_upsert(fresh)) {
        notify_soon();
      }

      build_progress_ms = now_ms();
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
      for (const id of Array.from(entries_map.keys())) {
        if (!seen.has(id)) {
          entries_map.delete(id);
        }
      }
    }

    fully_built = reached_end;
    last_build_ms = now_ms();
    build_in_progress = false;
    void persist_now();
    notify();
  } finally {
    build_in_progress = false;
  }
}

// Cheap incremental sync: only the newest page, never the whole mailbox.
// This is what runs on routine mail changes, so it stays O(page) even with
// a million messages. Deletions are handled by the event listeners.
export async function sync_recent(): Promise<void> {
  if (build_in_progress) return;
  if (!has_vault_in_memory()) return;

  const ok = await ensure_loaded();

  if (!ok) return;

  const token = build_token;

  try {
    const response = await list_mail_items({
      item_type: "received",
      is_trashed: false,
      is_spam: false,
      is_archived: false,
      limit: BUILD_PAGE_SIZE,
    });

    if (!response.data || token !== build_token) return;

    const items = response.data.items;
    const fresh = await entries_from_items(items);

    if (token !== build_token) return;

    let changed = apply_upsert(fresh);

    // Prune removals within the freshest window: any indexed entry newer than
    // the oldest item this page returned, but absent from the page, has left the
    // inbox (snoozed / archived / moved / bulk action). Bounded to one page, so
    // it stays O(page) even on huge mailboxes. Skip when the page is empty or
    // when decryption failed for all returned items - mass decrypt failure means
    // we cannot reliably distinguish "removed" from "failed to decrypt".
    if (items.length > 0 && fresh.length > 0) {
      const returned = new Set(items.map((i) => i.id));
      let window_start = Infinity;

      // Only use VALID (>0) timestamps to define the window. A single item with
      // a missing/0 timestamp must not collapse window_start to 0, which would
      // prune everything outside the newest page.
      for (const item of items) {
        const ts = safe_ts(item.message_ts || item.created_at);

        if (ts > 0) {
          window_start = Math.min(window_start, ts);
        }
      }

      if (window_start !== Infinity) {
        for (const [id, entry] of entries_map) {
          const ts = safe_ts(entry.message_ts);

          if (ts > window_start && !returned.has(id)) {
            entries_map.delete(id);
            changed = true;
          }
        }
      }
    }

    if (changed) {
      schedule_persist();
      notify();
    }
    last_build_ms = now_ms();
  } catch {
    last_build_ms = 0;
    schedule_resync();
    return;
  }
}

function schedule_resync(): void {
  if (resync_timer) clearTimeout(resync_timer);

  resync_timer = setTimeout(() => {
    resync_timer = null;
    if (now_ms() - last_build_ms < RESYNC_MIN_INTERVAL_MS) return;
    void sync_recent();
  }, RESYNC_DEBOUNCE_MS);
}

async function reclassify_id(id: string): Promise<void> {
  if (!has_vault_in_memory()) return;
  if (in_flight_reclassify.has(id)) return;
  in_flight_reclassify.add(id);

  try {
    const response = await list_mail_items({ ids: [id] });
    const item = response.data?.items?.[0];

    if (!item) {
      if (entries_map.has(id)) remove_ids([id]);

      return;
    }

    if (item.item_type !== "received") {
      if (entries_map.has(id)) remove_ids([id]);

      return;
    }

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

    if (!envelope) return;

    if (metadata?.is_trashed || metadata?.is_archived || metadata?.is_spam) {
      remove_ids([item.id]);

      return;
    }

    upsert_entries([
      {
        id: item.id,
        thread_token: item.thread_token,
        message_ts: item.message_ts || item.created_at,
        is_read: metadata?.is_read ?? item.is_read ?? false,
        category: classify(envelope, metadata),
      },
    ]);
  } catch {
    return;
  } finally {
    in_flight_reclassify.delete(id);
  }
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

  build_token += 1;
  build_in_progress = false;
  entries_map = new Map();
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
    if (detail?.action && TERMINAL_ACTIONS.has(detail.action)) {
      remove_ids(detail.ids ?? []);
    }
  });

  on_mail_event(MAIL_EVENTS.MAIL_CHANGED, () => {
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
      if (
        fully_built &&
        !detail.is_trashed &&
        !detail.is_archived &&
        !detail.is_spam &&
        !!detail.encrypted_metadata
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
      void reclassify_id(detail.id);

      return;
    }

    if (
      typeof detail.is_read === "boolean" &&
      existing.is_read !== detail.is_read
    ) {
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

  upsert_entries([
    {
      id: email.id,
      thread_token: email.thread_token,
      message_ts: email.raw_timestamp || email.timestamp,
      is_read: email.is_read,
      category,
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

  build_token += 1;
  entries_map = new Map();
  fully_built = false;
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

      tx.objectStore(STORE_NAME).delete(account_id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  } catch {
    return;
  }
}
