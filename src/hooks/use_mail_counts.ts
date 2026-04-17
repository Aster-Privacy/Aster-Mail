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
/**
 * @deprecated This hook is deprecated. Use `use_mail_stats` instead.
 * This file will be removed in a future version.
 *
 * This hook now acts as a thin wrapper around use_mail_stats for backwards
 * compatibility. All counting is now done client-side by decrypting metadata.
 */

import type { InboxEmail } from "@/types/email";

import { useEffect, useSyncExternalStore } from "react";

import { MAIL_EVENTS } from "./mail_events";
import {
  adjust_stats_inbox,
  adjust_stats_unread,
  adjust_stats_trash,
  adjust_stats_sent,
  adjust_stats_starred,
  invalidate_mail_stats,
} from "./use_mail_stats";

export interface MailStats {
  total_items: number;
  inbox: number;
  unread: number;
  starred: number;
  sent: number;
  drafts: number;
  scheduled: number;
  archived: number;
  spam: number;
  trash: number;
  storage_used_bytes: number;
  storage_total_bytes: number;
}

interface MailCountsState {
  counts: MailStats;
  is_loading: boolean;
}

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

const CACHE_TTL_MS = 30_000;
const REFETCH_DEBOUNCE_MS = 500;

interface Cache {
  data: MailStats;
  timestamp: number;
  fetching: boolean;
}

const cache: Cache = { data: EMPTY_STATS, timestamp: 0, fetching: false };
const subscribers = new Set<() => void>();
let refetch_timeout: ReturnType<typeof setTimeout> | null = null;
let snapshot: MailCountsState = { counts: EMPTY_STATS, is_loading: false };

function broadcast(): void {
  snapshot = { counts: cache.data, is_loading: cache.fetching };
  subscribers.forEach((fn) => fn());
}

function subscribe_store(callback: () => void): () => void {
  subscribers.add(callback);

  return () => {
    subscribers.delete(callback);
  };
}

function get_snapshot(): MailCountsState {
  return snapshot;
}

export function adjust_unread_count(delta: number): void {
  cache.data = {
    ...cache.data,
    unread: Math.max(0, cache.data.unread + delta),
  };
  adjust_stats_unread(delta);
  broadcast();
}

export function adjust_inbox_count(delta: number): void {
  cache.data = {
    ...cache.data,
    inbox: Math.max(0, cache.data.inbox + delta),
  };
  adjust_stats_inbox(delta);
  broadcast();
}

export function adjust_trash_count(delta: number): void {
  cache.data = {
    ...cache.data,
    trash: Math.max(0, cache.data.trash + delta),
  };
  adjust_stats_trash(delta);
  broadcast();
}

export function adjust_sent_count(delta: number): void {
  cache.data = {
    ...cache.data,
    sent: Math.max(0, cache.data.sent + delta),
  };
  adjust_stats_sent(delta);
  broadcast();
}

export function adjust_starred_count(delta: number): void {
  cache.data = {
    ...cache.data,
    starred: Math.max(0, cache.data.starred + delta),
  };
  adjust_stats_starred(delta);
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
    broadcast();
  }, REFETCH_DEBOUNCE_MS);
}

export function invalidate_mail_counts(): void {
  cache.timestamp = 0;
  invalidate_mail_stats();
}

export function use_mail_counts(): MailCountsState {
  const state = useSyncExternalStore(
    subscribe_store,
    get_snapshot,
    get_snapshot,
  );

  useEffect(() => {
    if (Date.now() - cache.timestamp > CACHE_TTL_MS) {
      invalidate_mail_stats();
    }
  }, []);

  useEffect(() => {
    const handle_mail_changed = () => {
      debounced_refetch();
    };

    const handle_refresh_requested = () => {
      invalidate_mail_stats();
    };

    window.addEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_mail_changed);
    window.addEventListener(MAIL_EVENTS.MAIL_SOFT_REFRESH, handle_mail_changed);
    window.addEventListener(
      MAIL_EVENTS.REFRESH_REQUESTED,
      handle_refresh_requested,
    );

    return () => {
      window.removeEventListener(MAIL_EVENTS.MAIL_CHANGED, handle_mail_changed);
      window.removeEventListener(
        MAIL_EVENTS.MAIL_SOFT_REFRESH,
        handle_mail_changed,
      );
      window.removeEventListener(
        MAIL_EVENTS.REFRESH_REQUESTED,
        handle_refresh_requested,
      );
    };
  }, []);

  return state;
}
