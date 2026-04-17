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

import { MAIL_EVENTS } from "./mail_events";

import { get_contacts_count } from "@/services/api/contacts";
import { list_snoozed_emails, type SnoozedItem } from "@/services/api/snooze";
import { get_mail_stats } from "@/services/api/mail";
import { use_auth } from "@/contexts/auth_context";
import {
  has_passphrase_in_memory,
  on_keys_ready,
} from "@/services/crypto/memory_key_store";
import { sync_widget_data } from "@/native/widget_bridge";
import { update_pwa_badge } from "@/native/pwa_badge";
import { update_tray_badge } from "@/native/tauri_tray";

export interface MailStats {
  total_items: number;
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

const CACHE_TTL_MS = 120_000;
const DEBOUNCE_MS = 500;
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
  private user_id: string | null = null;

  get_cache(): StatsCache {
    return this.cache;
  }

  is_stale(): boolean {
    return Date.now() - this.cache.timestamp > CACHE_TTL_MS;
  }

  set_user_id(id: string | null): void {
    if (this.user_id === id) return;
    this.user_id = id;
    this.load_from_storage();
  }

  private get_storage_key(): string | null {
    if (!this.user_id) return null;

    return STORAGE_KEY_PREFIX + this.user_id;
  }

  private load_from_storage(): void {
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
      return this.active_request;
    }

    this.cache.fetching = true;
    this.notify();

    this.active_request = this.execute_fetch();

    return this.active_request;
  }

  private async execute_fetch(): Promise<MailStats | null> {
    try {
      const [stats_response, contacts_response, snoozed_response] =
        await Promise.allSettled([
          get_mail_stats(),
          get_contacts_count(),
          list_snoozed_emails(),
        ]);

      const server_stats =
        stats_response.status === "fulfilled" && !stats_response.value.error
          ? stats_response.value.data
          : null;

      if (!server_stats) {
        return null;
      }

      const contacts_count =
        contacts_response.status === "fulfilled"
          ? (contacts_response.value.data?.count ?? 0)
          : 0;

      const snoozed_items: SnoozedItem[] =
        snoozed_response.status === "fulfilled" && !snoozed_response.value.error
          ? (snoozed_response.value.data ?? [])
          : [];
      const snoozed_count = snoozed_items.length;

      this.cache.data = {
        total_items: server_stats.total_items,
        inbox: server_stats.inbox,
        sent: server_stats.sent,
        drafts: server_stats.drafts,
        scheduled: server_stats.scheduled,
        snoozed: snoozed_count,
        starred: server_stats.starred,
        archived: server_stats.archived,
        spam: server_stats.spam,
        trash: server_stats.trash,
        unread: server_stats.unread,
        contacts: contacts_count,
        storage_used_bytes: server_stats.storage_used_bytes,
        storage_total_bytes: server_stats.storage_total_bytes,
      };
      this.cache.timestamp = Date.now();
      this.cache.has_initialized = true;
      this.save_to_storage();
      this.sync_external_surfaces();

      return this.cache.data;
    } catch {
      return null;
    } finally {
      this.cache.fetching = false;
      this.active_request = null;
      this.notify();
    }
  }

  invalidate(): void {
    this.cache.timestamp = 0;
  }

  fetch_debounced(): void {
    if (this.debounce_timer) {
      clearTimeout(this.debounce_timer);
    }

    this.debounce_timer = setTimeout(() => {
      this.debounce_timer = null;
      this.fetch(false);
    }, DEBOUNCE_MS);
  }

  clear(): void {
    if (this.debounce_timer) {
      clearTimeout(this.debounce_timer);
      this.debounce_timer = null;
    }

    const key = this.get_storage_key();

    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        return;
      }
    }

    this.subscribers.clear();
    this.active_request = null;
    this.user_id = null;
    this.cache = {
      data: DEFAULT_STATS,
      timestamp: 0,
      fetching: false,
      has_initialized: false,
    };
  }

  adjust(field: keyof MailStats, delta: number): void {
    const current = this.cache.data[field];

    if (typeof current === "number") {
      this.cache.data = {
        ...this.cache.data,
        [field]: Math.max(0, current + delta),
      };
      this.cache.timestamp = Date.now();
      this.save_to_storage();
      this.notify();
      this.sync_external_surfaces();
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
      stats_store.clear();
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

    const handle_auth_ready = () => {
      stats_store.invalidate();
      stats_store.fetch(true);
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_change);
    window.addEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.CONTACTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.SCHEDULED_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.FOLDERS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.PROTECTED_FOLDERS_READY, handle_change);
    window.addEventListener("astermail:folder-locked", handle_change);
    window.addEventListener(MAIL_EVENTS.AUTH_READY, handle_auth_ready);

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_RECEIVED, handle_change);
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

export function adjust_stats_scheduled(delta: number): void {
  stats_store.adjust("scheduled", delta);
}

export function adjust_stats_snoozed(delta: number): void {
  stats_store.adjust("snoozed", delta);
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

export function adjust_stats_contacts(delta: number): void {
  stats_store.adjust("contacts", delta);
}

export function adjust_stats_total(delta: number): void {
  stats_store.adjust("total_items", delta);
}

export function clear_mail_stats(): void {
  stats_store.clear();
}

export function set_storage_total_bytes(bytes: number): void {
  stats_store.set_storage_total(bytes);
}
