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
import { useState, useEffect, useCallback, useRef } from "react";

import {
  MAIL_EVENTS,
  type InboxUnreadIndexedEventDetail,
  type MailItemUpdatedEventDetail,
} from "./mail_events";
import { is_low_network } from "@/services/low_network_state";

import { get_contacts_count } from "@/services/api/contacts";
import { list_snoozed_emails } from "@/services/api/snooze";
import { get_mail_stats } from "@/services/api/mail";
import { use_auth } from "@/contexts/auth_context";
import {
  has_passphrase_in_memory,
  on_keys_ready,
} from "@/services/crypto/memory_key_store";
import { sync_widget_data } from "@/native/widget_bridge";
import { update_pwa_badge } from "@/native/pwa_badge";
import { update_tray_badge } from "@/native/tauri_tray";

import { ignore_error } from "@/lib/ignore_error";

export interface MailStats {
  total_items: number;
  total_items_collapsed: number;
  inbox: number;
  sent: number;
  drafts: number;
  scheduled: number;
  snoozed: number;
  starred: number;
  archived: number;
  spam: number;
  trash: number;
  unread: number;
  contacts: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
}

interface UseMailStatsReturn {
  stats: MailStats;
  is_loading: boolean;
  error: string | null;
  refresh: () => void;
  has_initialized: boolean;
}

const DEFAULT_STATS: MailStats = {
  total_items: 0,
  total_items_collapsed: 0,
  inbox: 0,
  sent: 0,
  drafts: 0,
  scheduled: 0,
  snoozed: 0,
  starred: 0,
  archived: 0,
  spam: 0,
  trash: 0,
  unread: 0,
  contacts: 0,
  storage_used_bytes: 0,
  storage_total_bytes: 1073741824,
};

const LOW_NETWORK_TTL_MS = 20 * 60 * 1000;
const NORMAL_TTL_MS = 120_000;
const DEBOUNCE_MS = 500;

//
// Most read paths (auto-read on open, mark-as-read) only emit item-level
// events, none of which trigger a stats refetch, so a lone optimistic +/- is
// otherwise never reconciled until the TTL lapses or an unrelated event fires.
// Reading messages one at a time then leaves the badge running on accumulated
// guesses. After any adjustment we therefore force a debounced reconcile
// against the server (the source of truth for the thread-collapsed count). The
// timer resets on each edit, so a burst settles into a single fetch.
//
const RECONCILE_DELAY_MS = 1_500;
const LATE_RECONCILE_DELAY_MS = 6_000;

//
// A server stats fetch issued right after an optimistic edit can race the write
// that triggered it and come back reflecting the pre-edit state, clobbering the
// optimistic value (a read message whose unread badge silently pops back). For
// this long, a field that was just adjusted locally keeps its optimistic value
// instead of being overwritten by the server; a later reconcile (once the write
// has propagated) corrects any thread-collapse discrepancy.
//
const OPTIMISTIC_HOLD_MS = 4_000;

//
// The hold above only covers a reconcile issued within 4s of the edit. When the
// server write is slow to become visible, the 6s late reconcile drops the hold
// and adopts a stale server value, undoing the edit - and nothing further is
// scheduled, so the badge stays wrong until a manual refresh. A post-hold
// reconcile that contradicts a recent edit therefore keeps the optimistic value
// and re-verifies a bounded number of times; once spent, the server value wins
// so a genuinely wrong guess still self-corrects.
//
const CONFIRM_WINDOW_MS = 45_000;
const MAX_CONFIRM_RETRIES = 3;

const INITIAL_STATS_DELAY_MS = 1_000;
const STORAGE_KEY_PREFIX = "aster_mail_stats_";
const STORAGE_SCHEMA_VERSION = 3;

interface PersistedStats {
  version: number;
  data: MailStats;
  timestamp: number;
}

interface StatsCache {
  data: MailStats;
  timestamp: number;
  fetching: boolean;
  has_initialized: boolean;
}

interface SubscriberCallback {
  (): void;
}

class MailStatsStore {
  private cache: StatsCache = {
    data: DEFAULT_STATS,
    timestamp: 0,
    fetching: false,
    has_initialized: false,
  };

  private subscribers = new Set<SubscriberCallback>();
  private active_request: Promise<MailStats | null> | null = null;
  private debounce_timer: ReturnType<typeof setTimeout> | null = null;
  private reconcile_timer: ReturnType<typeof setTimeout> | null = null;
  private late_reconcile_timer: ReturnType<typeof setTimeout> | null = null;
  private user_id: string | null = null;
  private account_generation = 0;
  private refetch_queued = false;
  private in_flight_deltas: Partial<Record<keyof MailStats, number>> | null =
    null;
  private last_adjust_at: Partial<Record<keyof MailStats, number>> = {};
  private confirm_retries: Partial<Record<keyof MailStats, number>> = {};
  private authoritative_unread: number | null = null;
  private needs_revalidate = false;

  get_cache(): StatsCache {
    return this.cache;
  }

  is_stale(): boolean {
    if (this.needs_revalidate) return true;

    const effective_ttl = is_low_network() ? LOW_NETWORK_TTL_MS : NORMAL_TTL_MS;
    return Date.now() - this.cache.timestamp > effective_ttl;
  }

  prime(id: string | null): void {
    if (!id || this.user_id !== null) return;
    this.user_id = id;
    this.load_from_storage(true);
  }

  set_user_id(id: string | null): void {
    if (this.user_id === id) return;
    if (this.user_id !== null && id !== null) {
      this.reset_account_state();
    }
    this.user_id = id;
    this.load_from_storage();
  }

  private clear_timers(): void {
    if (this.debounce_timer) {
      clearTimeout(this.debounce_timer);
      this.debounce_timer = null;
    }

    if (this.reconcile_timer) {
      clearTimeout(this.reconcile_timer);
      this.reconcile_timer = null;
    }

    if (this.late_reconcile_timer) {
      clearTimeout(this.late_reconcile_timer);
      this.late_reconcile_timer = null;
    }
  }

  private reset_account_state(): void {
    this.account_generation += 1;
    this.clear_timers();

    const key = this.get_storage_key();

    if (key) {
      try {
        localStorage.removeItem(key);
      } catch (caught) {
        ignore_error("hooks/use_mail_stats:set_user_id", caught);
      }
    }

    this.active_request = null;
    this.refetch_queued = false;
    this.in_flight_deltas = null;
    this.last_adjust_at = {};
    this.confirm_retries = {};
    this.authoritative_unread = null;
    this.needs_revalidate = false;
    this.cache = {
      data: DEFAULT_STATS,
      timestamp: 0,
      fetching: false,
      has_initialized: false,
    };
    this.notify();
  }

  private get_storage_key(): string | null {
    if (!this.user_id) return null;

    return STORAGE_KEY_PREFIX + this.user_id;
  }

  private load_from_storage(silent = false): void {
    const key = this.get_storage_key();

    if (!key) return;

    try {
      const raw = localStorage.getItem(key);

      if (!raw) return;

      const persisted: PersistedStats = JSON.parse(raw);

      if (persisted.version !== STORAGE_SCHEMA_VERSION) {
        localStorage.removeItem(key);

        return;
      }

      this.cache.data = persisted.data;
      this.cache.timestamp = persisted.timestamp;
      this.cache.has_initialized = true;
      this.needs_revalidate = true;

      if (silent) return;

      this.notify();
      this.sync_external_surfaces();
    } catch {
      const storage_key = this.get_storage_key();

      if (storage_key) localStorage.removeItem(storage_key);
    }
  }

  private save_to_storage(): void {
    const key = this.get_storage_key();

    if (!key) return;

    try {
      const persisted: PersistedStats = {
        version: STORAGE_SCHEMA_VERSION,
        data: this.cache.data,
        timestamp: this.cache.timestamp,
      };

      localStorage.setItem(key, JSON.stringify(persisted));
    } catch {
      return;
    }
  }

  subscribe(callback: SubscriberCallback): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notify(): void {
    this.subscribers.forEach((callback) => {
      try {
        callback();
      } catch {
        return;
      }
    });
  }

  async fetch(force: boolean = false): Promise<MailStats | null> {
    if (!force && !this.is_stale() && this.cache.timestamp > 0) {
      return this.cache.data;
    }

    if (!has_passphrase_in_memory()) {
      return this.cache.data;
    }

    if (this.cache.fetching && this.active_request) {
      this.refetch_queued = true;

      return this.active_request;
    }

    this.cache.fetching = true;
    this.notify();

    this.active_request = this.execute_fetch();

    return this.active_request;
  }

  private async execute_fetch(): Promise<MailStats | null> {
    const fetch_generation = this.account_generation;

    this.in_flight_deltas = {};
    const query_started_at = Date.now();
    const has_unconfirmed_adjustments =
      Object.keys(this.last_adjust_at).length > 0;

    try {
      const [stats_response, contacts_response, snoozed_response] =
        await Promise.allSettled([
          get_mail_stats(has_unconfirmed_adjustments),
          get_contacts_count(has_unconfirmed_adjustments),
          list_snoozed_emails(has_unconfirmed_adjustments),
        ]);

      const server_stats =
        stats_response.status === "fulfilled" && !stats_response.value.error
          ? stats_response.value.data
          : null;

      if (!server_stats || fetch_generation !== this.account_generation) {
        return null;
      }

      const contacts_count =
        contacts_response.status === "fulfilled" &&
        !contacts_response.value.error
          ? (contacts_response.value.data?.count ?? this.cache.data.contacts)
          : this.cache.data.contacts;

      const snoozed_count =
        snoozed_response.status === "fulfilled" && !snoozed_response.value.error
          ? (snoozed_response.value.data ?? []).length
          : this.cache.data.snoozed;

      const deltas = this.in_flight_deltas ?? {};
      let needs_confirm_retry = false;
      const reconcile = (field: keyof MailStats, value: number): number => {
        const adjusted_at = this.last_adjust_at[field] ?? 0;
        const held =
          adjusted_at > 0 &&
          Math.abs(query_started_at - adjusted_at) < OPTIMISTIC_HOLD_MS;
        const current = this.cache.data[field];

        if (held) {
          return typeof current === "number" ? current : value;
        }

        const settled = Math.max(0, value + (deltas[field] ?? 0));

        if (
          typeof current === "number" &&
          adjusted_at > 0 &&
          settled !== current &&
          query_started_at - adjusted_at < CONFIRM_WINDOW_MS &&
          (this.confirm_retries[field] ?? 0) < MAX_CONFIRM_RETRIES
        ) {
          this.confirm_retries[field] = (this.confirm_retries[field] ?? 0) + 1;
          needs_confirm_retry = true;

          return current;
        }

        delete this.confirm_retries[field];
        delete this.last_adjust_at[field];

        return settled;
      };

      this.cache.data = {
        total_items: reconcile("total_items", server_stats.total_items),
        total_items_collapsed: reconcile(
          "total_items_collapsed",
          server_stats.total_items_collapsed ?? server_stats.total_items,
        ),
        inbox: reconcile("inbox", server_stats.inbox),
        sent: reconcile("sent", server_stats.sent),
        drafts: reconcile("drafts", server_stats.drafts),
        scheduled: reconcile("scheduled", server_stats.scheduled),
        snoozed: reconcile("snoozed", snoozed_count),
        starred: reconcile("starred", server_stats.starred),
        archived: reconcile("archived", server_stats.archived),
        spam: reconcile("spam", server_stats.spam),
        trash: reconcile("trash", server_stats.trash),
        unread:
          this.authoritative_unread ?? reconcile("unread", server_stats.unread),
        contacts: reconcile("contacts", contacts_count),
        storage_used_bytes: server_stats.storage_used_bytes,
        storage_total_bytes: server_stats.storage_total_bytes,
      };
      this.cache.timestamp = Date.now();
      this.cache.has_initialized = true;
      this.needs_revalidate = false;
      this.save_to_storage();
      this.sync_external_surfaces();

      if (needs_confirm_retry) {
        this.schedule_confirm_retry();
      }

      return this.cache.data;
    } catch {
      return null;
    } finally {
      if (fetch_generation === this.account_generation) {
        this.in_flight_deltas = null;
        this.cache.fetching = false;
        this.active_request = null;
        this.notify();

        if (this.refetch_queued) {
          this.refetch_queued = false;
          this.cache.timestamp = 0;
          this.fetch(true);
        }
      }
    }
  }

  invalidate(): void {
    this.cache.timestamp = 0;
  }

  fetch_debounced(): void {
    this.invalidate();
    if (this.debounce_timer) {
      clearTimeout(this.debounce_timer);
    }

    this.debounce_timer = setTimeout(() => {
      this.debounce_timer = null;
      this.fetch(true);
    }, DEBOUNCE_MS);
  }

  clear(): void {
    this.reset_account_state();
    this.user_id = null;
  }

  set_authoritative_unread(value: number | null): void {
    if (value === null) {
      this.authoritative_unread = null;

      return;
    }

    const next = Math.max(0, Math.trunc(value));
    const unchanged =
      this.authoritative_unread === next && this.cache.data.unread === next;

    this.authoritative_unread = next;
    delete this.last_adjust_at.unread;
    delete this.confirm_retries.unread;

    if (this.in_flight_deltas) delete this.in_flight_deltas.unread;

    if (unchanged) return;

    this.cache.data = { ...this.cache.data, unread: next };
    this.save_to_storage();
    this.notify();
    this.sync_external_surfaces();
  }

  adjust(field: keyof MailStats, delta: number): void {
    if (field === "unread" && this.authoritative_unread !== null) return;

    const current = this.cache.data[field];

    if (typeof current === "number") {
      this.cache.data = {
        ...this.cache.data,
        [field]: Math.max(0, current + delta),
      };
      this.last_adjust_at[field] = Date.now();
      this.confirm_retries[field] = 0;

      if (this.in_flight_deltas) {
        this.in_flight_deltas[field] =
          (this.in_flight_deltas[field] ?? 0) + delta;
      }

      this.save_to_storage();
      this.notify();
      this.sync_external_surfaces();
      this.schedule_reconcile();
    }
  }

  private schedule_confirm_retry(): void {
    if (this.late_reconcile_timer) return;

    this.late_reconcile_timer = setTimeout(() => {
      this.late_reconcile_timer = null;
      this.cache.timestamp = 0;
      void this.fetch(true);
    }, LATE_RECONCILE_DELAY_MS);
  }

  private schedule_reconcile(): void {
    if (this.reconcile_timer) {
      clearTimeout(this.reconcile_timer);
    }

    this.reconcile_timer = setTimeout(() => {
      this.reconcile_timer = null;
      void this.fetch(true);
    }, RECONCILE_DELAY_MS);

    if (!this.late_reconcile_timer) {
      this.late_reconcile_timer = setTimeout(() => {
        this.late_reconcile_timer = null;
        void this.fetch(true);
      }, LATE_RECONCILE_DELAY_MS);
    }
  }

  set_storage_total(bytes: number): void {
    this.cache.data = {
      ...this.cache.data,
      storage_total_bytes: bytes,
    };
    this.notify();
  }

  private sync_external_surfaces(): void {
    const { unread, starred, drafts } = this.cache.data;

    sync_widget_data(unread, starred, drafts);
    update_pwa_badge(unread);
    update_tray_badge(unread);
  }
}

const stats_store = new MailStatsStore();

const BACKGROUND_RECONCILE_MS = NORMAL_TTL_MS;

export function set_indexed_inbox_unread(value: number | null): void {
  stats_store.set_authoritative_unread(value);
}

if (typeof window !== "undefined") {
  window.addEventListener(MAIL_EVENTS.INBOX_UNREAD_INDEXED, (event: Event) => {
    const detail = (event as CustomEvent<InboxUnreadIndexedEventDetail>).detail;

    if (detail === undefined) return;

    stats_store.set_authoritative_unread(detail.total);
  });

  setInterval(() => {
    if (has_passphrase_in_memory() && stats_store.is_stale()) {
      void stats_store.fetch(false);
    }
  }, BACKGROUND_RECONCILE_MS);
}

export function should_reconcile_on_item_update(
  detail: MailItemUpdatedEventDetail | null | undefined,
): boolean {
  if (!detail) return false;

  return (
    detail.is_read !== undefined ||
    detail.is_starred !== undefined ||
    detail.is_archived !== undefined ||
    detail.is_trashed !== undefined ||
    detail.is_spam !== undefined
  );
}

export function use_mail_stats(): UseMailStatsReturn {
  const mounted_ref = useRef(false);
  const { user, has_keys, is_completing_registration } = use_auth();
  const prev_user_id_ref = useRef<string | null>(null);
  const prev_has_keys_ref = useRef<boolean>(false);
  const [state, set_state] = useState<{
    stats: MailStats;
    is_loading: boolean;
    error: string | null;
    has_initialized: boolean;
  }>(() => {
    prime_mail_stats(user?.id || null);

    const cache = stats_store.get_cache();

    return {
      stats: cache.data,
      is_loading: cache.fetching,
      error: null,
      has_initialized: cache.has_initialized,
    };
  });

  const sync_state = useCallback(() => {
    if (!mounted_ref.current) return;
    const cache = stats_store.get_cache();

    set_state((prev) => ({
      ...prev,
      stats: cache.data,
      is_loading: cache.fetching,
      has_initialized: cache.has_initialized,
    }));
  }, []);

  const refresh = useCallback(() => {
    stats_store.invalidate();
    stats_store.fetch(true);
  }, []);

  useEffect(() => {
    mounted_ref.current = true;

    const current_user_id = user?.id || null;
    const prev_user_id = prev_user_id_ref.current;
    const prev_has_keys = prev_has_keys_ref.current;

    if (
      prev_user_id !== null &&
      current_user_id !== null &&
      prev_user_id !== current_user_id
    ) {
      set_state({
        stats: DEFAULT_STATS,
        is_loading: false,
        error: null,
        has_initialized: false,
      });
    }

    if (current_user_id !== null) {
      prev_user_id_ref.current = current_user_id;
    }
    stats_store.set_user_id(current_user_id);
    prev_has_keys_ref.current = has_keys;

    const unsubscribe = stats_store.subscribe(sync_state);

    sync_state();

    if (is_completing_registration) {
      return () => {
        mounted_ref.current = false;
        unsubscribe();
      };
    }

    const keys_just_became_available = has_keys && !prev_has_keys;
    let stats_timer: ReturnType<typeof setTimeout> | null = null;

    if (stats_store.is_stale() || keys_just_became_available) {
      stats_timer = setTimeout(() => {
        stats_store.fetch(keys_just_became_available);
      }, INITIAL_STATS_DELAY_MS);
    }

    return () => {
      mounted_ref.current = false;
      unsubscribe();
      if (stats_timer) clearTimeout(stats_timer);
    };
  }, [sync_state, user?.id, has_keys, is_completing_registration]);

  useEffect(() => {
    const handle_change = () => {
      stats_store.fetch_debounced();
    };

    const handle_item_update = (event: Event) => {
      const detail = (event as CustomEvent<MailItemUpdatedEventDetail>).detail;

      if (should_reconcile_on_item_update(detail)) {
        stats_store.fetch_debounced();
      }
    };

    const handle_auth_ready = () => {
      stats_store.invalidate();
      stats_store.fetch(true);
    };

    let last_revalidate = 0;

    const maybe_revalidate = () => {
      if (!has_passphrase_in_memory()) return;

      const now = Date.now();

      if (now - last_revalidate < 5_000) return;

      last_revalidate = now;
      stats_store.invalidate();
      stats_store.fetch(false);
    };

    const handle_visibility = () => {
      if (document.visibilityState === "visible") {
        maybe_revalidate();
      }
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.MAIL_ITEM_UPDATED, handle_item_update);
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_change);
    window.addEventListener(MAIL_EVENTS.MAIL_STATS_STALE, handle_change);
    window.addEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.CONTACTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.SCHEDULED_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.FOLDERS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.PROTECTED_FOLDERS_READY, handle_change);
    window.addEventListener("astermail:folder-locked", handle_change);
    window.addEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
    document.addEventListener("visibilitychange", handle_visibility);
    window.addEventListener("focus", maybe_revalidate);

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
      window.removeEventListener(
        MAIL_EVENTS.MAIL_ITEM_UPDATED,
        handle_item_update,
      );
      window.removeEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_change);
      window.removeEventListener(MAIL_EVENTS.MAIL_STATS_STALE, handle_change);
      window.removeEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.CONTACTS_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.SCHEDULED_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.FOLDERS_CHANGED, handle_change);
      window.removeEventListener(
        MAIL_EVENTS.PROTECTED_FOLDERS_READY,
        handle_change,
      );
      window.removeEventListener("astermail:folder-locked", handle_change);
      window.removeEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);
      document.removeEventListener("visibilitychange", handle_visibility);
      window.removeEventListener("focus", maybe_revalidate);
    };
  }, []);

  useEffect(() => {
    if (is_completing_registration) {
      return;
    }

    let stats_timer: ReturnType<typeof setTimeout> | null = null;

    if (has_passphrase_in_memory()) {
      if (stats_store.is_stale()) {
        stats_timer = setTimeout(() => {
          stats_store.fetch(true);
        }, INITIAL_STATS_DELAY_MS);
      }
    }

    const unsub = on_keys_ready(() => {
      if (is_completing_registration) {
        return;
      }
      if (stats_store.is_stale()) {
        if (stats_timer) clearTimeout(stats_timer);
        stats_timer = setTimeout(() => {
          stats_store.fetch(true);
        }, INITIAL_STATS_DELAY_MS);
      }
    });

    return () => {
      if (stats_timer) clearTimeout(stats_timer);
      unsub?.();
    };
  }, [is_completing_registration]);

  return {
    stats: state.stats,
    is_loading: state.is_loading,
    error: state.error,
    refresh,
    has_initialized: state.has_initialized,
  };
}

export function invalidate_mail_stats(): void {
  stats_store.invalidate();
  stats_store.fetch(true);
}

export function prefetch_mail_stats(): void {
  stats_store.fetch();
}

export function prime_mail_stats(user_id: string | null): void {
  stats_store.prime(user_id);
}

export function get_mail_stats_snapshot(): MailStats {
  return stats_store.get_cache().data;
}

export function subscribe_mail_stats(callback: () => void): () => void {
  return stats_store.subscribe(callback);
}

export function adjust_stats_inbox(delta: number): void {
  stats_store.adjust("inbox", delta);
}

export function adjust_stats_sent(delta: number): void {
  stats_store.adjust("sent", delta);
}

export function adjust_stats_trash(delta: number): void {
  stats_store.adjust("trash", delta);
}

export function adjust_stats_unread(delta: number): void {
  stats_store.adjust("unread", delta);
}

export function adjust_stats_drafts(delta: number): void {
  stats_store.adjust("drafts", delta);
}

export function adjust_stats_starred(delta: number): void {
  stats_store.adjust("starred", delta);
}

export function adjust_stats_archived(delta: number): void {
  stats_store.adjust("archived", delta);
}

export function adjust_stats_spam(delta: number): void {
  stats_store.adjust("spam", delta);
}

export function clear_mail_stats(): void {
  stats_store.clear();
}
