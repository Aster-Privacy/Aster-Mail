import type { InboxEmail } from "@/types/email";

import { useState, useEffect, useCallback, useRef } from "react";

import { MAIL_EVENTS } from "./mail_events";

import {
  get_mail_stats,
  type MailUserStatsResponse as MailStats,
} from "@/services/api/mail";

const CACHE_TTL_MS = 30_000;
const REFETCH_DEBOUNCE_MS = 500;

const EMPTY_STATS: MailStats = {
  total_items: 0,
  inbox: 0,
  unread: 0,
  starred: 0,
  sent: 0,
  drafts: 0,
  scheduled: 0,
  archived: 0,
  spam: 0,
  trash: 0,
  storage_used_bytes: 0,
  storage_total_bytes: 1024 * 1024 * 1024,
};

interface MailCountsState {
  counts: MailStats;
  is_loading: boolean;
}

interface Cache {
  data: MailStats;
  timestamp: number;
  fetching: boolean;
}

const cache: Cache = { data: EMPTY_STATS, timestamp: 0, fetching: false };
const subscribers = new Set<() => void>();
let active_request: Promise<MailStats | null> | null = null;
let refetch_timeout: ReturnType<typeof setTimeout> | null = null;

function broadcast(): void {
  subscribers.forEach((fn) => fn());
}

export function adjust_unread_count(delta: number): void {
  cache.data = {
    ...cache.data,
    unread: Math.max(0, cache.data.unread + delta),
  };
  broadcast();
}

export function adjust_inbox_count(delta: number): void {
  cache.data = {
    ...cache.data,
    inbox: Math.max(0, cache.data.inbox + delta),
  };
  broadcast();
}

export function adjust_trash_count(delta: number): void {
  cache.data = {
    ...cache.data,
    trash: Math.max(0, cache.data.trash + delta),
  };
  broadcast();
}

export function adjust_sent_count(delta: number): void {
  cache.data = {
    ...cache.data,
    sent: Math.max(0, cache.data.sent + delta),
  };
  broadcast();
}

export function adjust_starred_count(delta: number): void {
  cache.data = {
    ...cache.data,
    starred: Math.max(0, cache.data.starred + delta),
  };
  broadcast();
}

export interface ComputedMailStats {
  total_items: number;
  inbox: number;
  sent: number;
  scheduled: number;
  starred: number;
  archived: number;
  spam: number;
  trash: number;
  unread: number;
}

export function compute_stats_from_emails(
  emails: InboxEmail[],
): ComputedMailStats {
  const stats: ComputedMailStats = {
    total_items: emails.length,
    inbox: 0,
    sent: 0,
    scheduled: 0,
    starred: 0,
    archived: 0,
    spam: 0,
    trash: 0,
    unread: 0,
  };

  for (const email of emails) {
    if (email.is_trashed) {
      stats.trash++;
      continue;
    }

    if (email.is_spam) {
      stats.spam++;
      continue;
    }

    if (email.is_archived) {
      stats.archived++;
      if (email.is_starred) stats.starred++;
      continue;
    }

    if (email.item_type === "received") {
      stats.inbox++;
      if (!email.is_read) stats.unread++;
    } else if (email.item_type === "sent") {
      stats.sent++;
    } else if (email.item_type === "scheduled") {
      stats.scheduled++;
    }

    if (email.is_starred) stats.starred++;
  }

  return stats;
}

export function update_stats_from_client(computed: ComputedMailStats): void {
  cache.data = {
    ...cache.data,
    total_items: computed.total_items,
    inbox: computed.inbox,
    sent: computed.sent,
    scheduled: computed.scheduled,
    starred: computed.starred,
    archived: computed.archived,
    spam: computed.spam,
    trash: computed.trash,
    unread: computed.unread,
  };
  cache.timestamp = Date.now();
  broadcast();
}

function debounced_refetch(): void {
  if (refetch_timeout) {
    clearTimeout(refetch_timeout);
  }
  refetch_timeout = setTimeout(() => {
    refetch_timeout = null;
    cache.timestamp = 0;
    fetch_stats();
  }, REFETCH_DEBOUNCE_MS);
}

async function fetch_stats(): Promise<MailStats | null> {
  if (cache.fetching && active_request) {
    return active_request;
  }

  cache.fetching = true;
  broadcast();

  active_request = get_mail_stats()
    .then((res) => {
      if (res.data) {
        cache.data = res.data;
        cache.timestamp = Date.now();
      }

      return cache.data;
    })
    .catch(() => cache.data)
    .finally(() => {
      cache.fetching = false;
      active_request = null;
      broadcast();
    });

  return active_request;
}

export function invalidate_mail_counts(): void {
  cache.timestamp = 0;
  fetch_stats();
}

export function use_mail_counts(): MailCountsState {
  const mounted = useRef(true);

  const [state, set_state] = useState<MailCountsState>(() => ({
    counts: cache.data,
    is_loading: false,
  }));

  const sync = useCallback(() => {
    if (!mounted.current) return;
    set_state({ counts: cache.data, is_loading: cache.fetching });
  }, []);

  useEffect(() => {
    mounted.current = true;
    subscribers.add(sync);
    set_state({ counts: cache.data, is_loading: false });

    if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
      fetch_stats();
    }

    return () => {
      mounted.current = false;
      subscribers.delete(sync);
    };
  }, [sync]);

  useEffect(() => {
    const handle_mail_changed = () => {
      debounced_refetch();
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_mail_changed);

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_mail_changed);
    };
  }, []);

  return state;
}
