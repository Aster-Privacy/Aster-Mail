import { useState, useEffect, useCallback, useRef } from "react";

import { MAIL_EVENTS } from "./mail_events";

import {
  get_mail_stats,
  type MailUserStatsResponse,
} from "@/services/api/mail";
import { get_contacts_count } from "@/services/api/contacts";
import { list_snoozed_emails } from "@/services/api/snooze";
import { use_auth } from "@/contexts/auth_context";

export interface MailStats {
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

interface StatsCache {
  data: MailStats;
  timestamp: number;
  fetching: boolean;
}

interface SubscriberCallback {
  (): void;
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
      const [response, contacts_response, snoozed_response] =
        await Promise.allSettled([
          get_mail_stats(),
          get_contacts_count(),
          list_snoozed_emails(),
        ]);

      const mail_stats =
        response.status === "fulfilled" ? response.value.data : null;
      const contacts_count =
        contacts_response.status === "fulfilled"
          ? (contacts_response.value.data?.count ?? 0)
          : 0;
      const snoozed_count =
        snoozed_response.status === "fulfilled" && !snoozed_response.value.error
          ? (snoozed_response.value.data?.length ?? 0)
          : 0;

      if (mail_stats) {
        const data: MailUserStatsResponse = mail_stats;

        this.cache.data = {
          inbox: data.inbox,
          sent: data.sent,
          drafts: data.drafts,
          scheduled: data.scheduled,
          snoozed: snoozed_count,
          starred: data.starred,
          archived: data.archived,
          spam: data.spam,
          trash: data.trash,
          unread: data.unread,
          contacts: contacts_count,
          storage_used_bytes: data.storage_used_bytes,
          storage_total_bytes: data.storage_total_bytes ?? 1073741824,
        };
        this.cache.timestamp = Date.now();
      }

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
}

const stats_store = new MailStatsStore();

export function use_mail_stats(): UseMailStatsReturn {
  const mounted_ref = useRef(true);
  const { user } = use_auth();
  const prev_user_id_ref = useRef<string | null>(null);
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

    if (prev_user_id !== null && prev_user_id !== current_user_id) {
      stats_store.clear();
      set_state({
        stats: DEFAULT_STATS,
        is_loading: false,
        error: null,
      });
    }

    prev_user_id_ref.current = current_user_id;

    const unsubscribe = stats_store.subscribe(sync_state);

    sync_state();

    if (stats_store.is_stale()) {
      stats_store.fetch();
    }

    return () => {
      mounted_ref.current = false;
      unsubscribe();
    };
  }, [sync_state, user?.id]);

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
