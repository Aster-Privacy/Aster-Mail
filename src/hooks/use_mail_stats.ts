import { useState, useEffect, useCallback, useRef } from "react";

import { MAIL_EVENTS } from "./mail_events";

import { get_contacts_count } from "@/services/api/contacts";
import { list_snoozed_emails } from "@/services/api/snooze";
import { sync_mail_items, type MailItem } from "@/services/api/mail";
import { get_subscription } from "@/services/api/billing";
import {
  decrypt_mail_metadata_batch,
  has_encryption_key,
} from "@/services/crypto/mail_metadata";
import { use_auth } from "@/contexts/auth_context";
import { has_passphrase_in_memory } from "@/services/crypto/memory_key_store";

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

const CACHE_TTL_MS = 30_000;
const DEBOUNCE_MS = 500;
const SYNC_BATCH_SIZE = 500;

interface StatsCache {
  data: MailStats;
  timestamp: number;
  fetching: boolean;
}

interface SubscriberCallback {
  (): void;
}

interface ClientStatsResult {
  total_items: number;
  inbox: number;
  sent: number;
  drafts: number;
  scheduled: number;
  starred: number;
  archived: number;
  spam: number;
  trash: number;
  unread: number;
  storage_used_bytes: number;
}

async function fetch_all_mail_metadata(): Promise<MailItem[]> {
  const all_items: MailItem[] = [];
  let cursor: string | undefined;
  let has_more = true;

  while (has_more) {
    const response = await sync_mail_items({
      limit: SYNC_BATCH_SIZE,
      cursor,
    });

    if (response.error || !response.data) {
      break;
    }

    all_items.push(...response.data.items);
    cursor = response.data.next_cursor;
    has_more = response.data.has_more;
  }

  return all_items;
}

async function compute_stats_from_metadata(
  items: MailItem[],
): Promise<ClientStatsResult> {
  const stats: ClientStatsResult = {
    total_items: 0,
    inbox: 0,
    sent: 0,
    drafts: 0,
    scheduled: 0,
    starred: 0,
    archived: 0,
    spam: 0,
    trash: 0,
    unread: 0,
    storage_used_bytes: 0,
  };

  if (items.length === 0) {
    return stats;
  }

  const items_with_metadata = items.filter(
    (item) => item.encrypted_metadata && item.metadata_nonce,
  );

  const decrypted_map = await decrypt_mail_metadata_batch(items_with_metadata);

  for (const item of items) {
    const metadata = decrypted_map.get(item.id);

    if (!metadata) {
      continue;
    }

    stats.total_items++;
    stats.storage_used_bytes += metadata.size_bytes || 0;

    if (metadata.is_trashed) {
      stats.trash++;
      continue;
    }

    if (metadata.is_spam) {
      stats.spam++;
      continue;
    }

    if (metadata.is_archived) {
      stats.archived++;
      if (metadata.is_starred) {
        stats.starred++;
      }
      continue;
    }

    const item_type = metadata.item_type || item.item_type;

    if (item_type === "received") {
      stats.inbox++;
      if (!metadata.is_read) {
        stats.unread++;
      }
    } else if (item_type === "sent") {
      stats.sent++;
    } else if (item_type === "draft") {
      stats.drafts++;
    } else if (item_type === "scheduled") {
      stats.scheduled++;
    }

    if (metadata.is_starred) {
      stats.starred++;
    }
  }

  return stats;
}

class MailStatsStore {
  private cache: StatsCache = {
    data: DEFAULT_STATS,
    timestamp: 0,
    fetching: false,
  };

  private subscribers = new Set<SubscriberCallback>();
  private active_request: Promise<MailStats | null> | null = null;
  private debounce_timer: ReturnType<typeof setTimeout> | null = null;

  get_cache(): StatsCache {
    return this.cache;
  }

  is_stale(): boolean {
    return Date.now() - this.cache.timestamp > CACHE_TTL_MS;
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

    if (!has_passphrase_in_memory() || !has_encryption_key()) {
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
      const [
        mail_items,
        contacts_response,
        snoozed_response,
        subscription_response,
      ] = await Promise.allSettled([
        fetch_all_mail_metadata(),
        get_contacts_count(),
        list_snoozed_emails(),
        get_subscription(),
      ]);

      const items = mail_items.status === "fulfilled" ? mail_items.value : [];
      const contacts_count =
        contacts_response.status === "fulfilled"
          ? (contacts_response.value.data?.count ?? 0)
          : 0;
      const snoozed_count =
        snoozed_response.status === "fulfilled" && !snoozed_response.value.error
          ? (snoozed_response.value.data?.length ?? 0)
          : 0;
      const storage_total =
        subscription_response.status === "fulfilled" &&
        subscription_response.value.data?.storage
          ? subscription_response.value.data.storage.total_limit_bytes
          : this.cache.data.storage_total_bytes;

      const client_stats = await compute_stats_from_metadata(items);

      this.cache.data = {
        total_items: client_stats.total_items,
        inbox: client_stats.inbox,
        sent: client_stats.sent,
        drafts: client_stats.drafts,
        scheduled: client_stats.scheduled,
        snoozed: snoozed_count,
        starred: client_stats.starred,
        archived: client_stats.archived,
        spam: client_stats.spam,
        trash: client_stats.trash,
        unread: client_stats.unread,
        contacts: contacts_count,
        storage_used_bytes: client_stats.storage_used_bytes,
        storage_total_bytes: storage_total,
      };
      this.cache.timestamp = Date.now();

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
      this.invalidate();
      this.fetch(true);
    }, DEBOUNCE_MS);
  }

  clear(): void {
    if (this.debounce_timer) {
      clearTimeout(this.debounce_timer);
      this.debounce_timer = null;
    }
    this.subscribers.clear();
    this.active_request = null;
    this.cache = { data: DEFAULT_STATS, timestamp: 0, fetching: false };
  }

  adjust(field: keyof MailStats, delta: number): void {
    const current = this.cache.data[field];

    if (typeof current === "number") {
      this.cache.data = {
        ...this.cache.data,
        [field]: Math.max(0, current + delta),
      };
      this.notify();
    }
  }

  set_storage_total(bytes: number): void {
    this.cache.data = {
      ...this.cache.data,
      storage_total_bytes: bytes,
    };
    this.notify();
  }
}

const stats_store = new MailStatsStore();

export function use_mail_stats(): UseMailStatsReturn {
  const mounted_ref = useRef(true);
  const { user, has_keys } = use_auth();
  const prev_user_id_ref = useRef<string | null>(null);
  const prev_has_keys_ref = useRef<boolean>(false);
  const [state, set_state] = useState<{
    stats: MailStats;
    is_loading: boolean;
    error: string | null;
  }>(() => {
    const cache = stats_store.get_cache();

    return {
      stats: cache.data,
      is_loading: cache.fetching,
      error: null,
    };
  });

  const sync_state = useCallback(() => {
    if (!mounted_ref.current) return;
    const cache = stats_store.get_cache();

    set_state((prev) => ({
      ...prev,
      stats: cache.data,
      is_loading: cache.fetching,
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

    if (prev_user_id !== null && prev_user_id !== current_user_id) {
      stats_store.clear();
      set_state({
        stats: DEFAULT_STATS,
        is_loading: false,
        error: null,
      });
    }

    prev_user_id_ref.current = current_user_id;
    prev_has_keys_ref.current = has_keys;

    const unsubscribe = stats_store.subscribe(sync_state);

    sync_state();

    const keys_just_became_available = has_keys && !prev_has_keys;

    if (stats_store.is_stale() || keys_just_became_available) {
      stats_store.fetch(keys_just_became_available);
    }

    return () => {
      mounted_ref.current = false;
      unsubscribe();
    };
  }, [sync_state, user?.id, has_keys]);

  useEffect(() => {
    const handle_change = () => {
      stats_store.fetch_debounced();
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
    window.addEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.CONTACTS_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.SCHEDULED_CHANGED, handle_change);
    window.addEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.EMAIL_SENT, handle_change);
      window.removeEventListener(MAIL_EVENTS.DRAFTS_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.CONTACTS_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.SCHEDULED_CHANGED, handle_change);
      window.removeEventListener(MAIL_EVENTS.SNOOZED_CHANGED, handle_change);
    };
  }, []);

  return {
    stats: state.stats,
    is_loading: state.is_loading,
    error: state.error,
    refresh,
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
