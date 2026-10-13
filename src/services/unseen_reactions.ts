//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { useSyncExternalStore } from "react";

import { mark_reactions_seen } from "@/services/api/reactions";
import { request_cache } from "@/services/api/request_cache";
import { ignore_error } from "@/lib/ignore_error";

export const LOCAL_SEEN_HOLD_MS = 15000;
export const LIVE_SETTLE_MS = 10000;
const MAX_LIVE_REACTIONS = 500;
const MAX_SEEN_TARGETS = 200;
const MAIL_LIST_CACHE_KEY = "/mail/v1/messages";

export interface UnseenReactionListItem {
  id: string;
  thread_token?: string;
  has_unseen_reaction?: boolean;
  is_trashed?: boolean;
  is_spam?: boolean;
}

export interface UnseenReactionRow {
  id: string;
  grouped_email_ids?: string[];
  thread_token?: string;
  is_trashed?: boolean;
  is_spam?: boolean;
}

interface LiveReaction {
  target_id?: string;
  thread_token?: string;
  added_at: number;
}

const server_targets = new Set<string>();
const server_threads = new Set<string>();
const live_reactions = new Map<string, LiveReaction>();
const locally_seen_until = new Map<string, number>();
const in_flight_seen = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function target_key(id: string): string {
  return `i:${id}`;
}

function thread_key(thread_token: string): string {
  return `t:${thread_token}`;
}

function is_held(key: string, now: number): boolean {
  const until = locally_seen_until.get(key);

  if (until === undefined) return false;
  if (until > now) return true;
  locally_seen_until.delete(key);

  return false;
}

function drop_live(
  matches: (reaction: LiveReaction) => boolean,
  min_age_ms: number,
  now: number,
): boolean {
  let changed = false;

  for (const [reaction_id, reaction] of live_reactions) {
    if (now - reaction.added_at < min_age_ms) continue;
    if (!matches(reaction)) continue;
    live_reactions.delete(reaction_id);
    changed = true;
  }

  return changed;
}

export function ingest_unseen_reaction_flags(
  items: UnseenReactionListItem[],
): void {
  const now = Date.now();
  let changed = false;

  for (const item of items) {
    if (!item?.id) continue;

    const thread_token = item.thread_token || undefined;
    const is_hidden = item.is_trashed === true || item.is_spam === true;

    if (item.has_unseen_reaction === true && !is_hidden) {
      if (
        is_held(target_key(item.id), now) ||
        (thread_token !== undefined && is_held(thread_key(thread_token), now))
      ) {
        continue;
      }
      if (!server_targets.has(item.id)) {
        server_targets.add(item.id);
        changed = true;
      }
      if (thread_token !== undefined && !server_threads.has(thread_token)) {
        server_threads.add(thread_token);
        changed = true;
      }
      continue;
    }

    if (server_targets.delete(item.id)) changed = true;
    if (is_hidden) continue;
    if (thread_token !== undefined && server_threads.delete(thread_token)) {
      changed = true;
    }
    if (live_reactions.size > 0) {
      const settled = drop_live(
        (reaction) =>
          reaction.target_id === item.id ||
          (thread_token !== undefined &&
            reaction.thread_token === thread_token),
        LIVE_SETTLE_MS,
        now,
      );

      if (settled) changed = true;
    }
  }

  if (changed) notify();
}

export function note_reaction_added(detail: {
  reaction_id: string;
  target_id?: string;
  thread_token?: string;
}): void {
  if (!detail.reaction_id) return;
  if (!detail.target_id && !detail.thread_token) return;

  if (detail.target_id) locally_seen_until.delete(target_key(detail.target_id));
  if (detail.thread_token) {
    locally_seen_until.delete(thread_key(detail.thread_token));
  }

  if (
    !live_reactions.has(detail.reaction_id) &&
    live_reactions.size >= MAX_LIVE_REACTIONS
  ) {
    const oldest = live_reactions.keys().next().value;

    if (oldest !== undefined) live_reactions.delete(oldest);
  }

  live_reactions.set(detail.reaction_id, {
    target_id: detail.target_id || undefined,
    thread_token: detail.thread_token || undefined,
    added_at: Date.now(),
  });
  request_cache.invalidate(MAIL_LIST_CACHE_KEY);
  notify();
}

export function note_reaction_removed(reaction_id: string): void {
  request_cache.invalidate(MAIL_LIST_CACHE_KEY);
  if (!reaction_id) return;
  if (live_reactions.delete(reaction_id)) notify();
}

function forget(target_ids: string[], thread_token: string | undefined): void {
  const target_set = new Set(target_ids);
  let changed = false;

  for (const id of target_ids) {
    if (server_targets.delete(id)) changed = true;
  }
  if (thread_token !== undefined && server_threads.delete(thread_token)) {
    changed = true;
  }
  if (
    drop_live(
      (reaction) =>
        (reaction.target_id !== undefined &&
          target_set.has(reaction.target_id)) ||
        (thread_token !== undefined && reaction.thread_token === thread_token),
      0,
      Date.now(),
    )
  ) {
    changed = true;
  }

  request_cache.invalidate(MAIL_LIST_CACHE_KEY);
  if (changed) notify();
}

export function note_reactions_seen(detail: {
  target_id?: string;
  thread_token?: string;
}): void {
  forget(
    detail.target_id ? [detail.target_id] : [],
    detail.thread_token || undefined,
  );
}

export function has_unseen_reaction(row: UnseenReactionRow): boolean {
  if (row.is_trashed === true || row.is_spam === true) return false;
  if (
    server_targets.size === 0 &&
    server_threads.size === 0 &&
    live_reactions.size === 0
  ) {
    return false;
  }

  const thread_token = row.thread_token || undefined;

  if (thread_token !== undefined && server_threads.has(thread_token)) {
    return true;
  }

  const ids = row.grouped_email_ids?.length ? row.grouped_email_ids : [row.id];

  for (const id of ids) {
    if (server_targets.has(id)) return true;
  }
  if (server_targets.has(row.id)) return true;

  for (const reaction of live_reactions.values()) {
    if (thread_token !== undefined && reaction.thread_token === thread_token) {
      return true;
    }
    if (reaction.target_id === undefined) continue;
    if (reaction.target_id === row.id || ids.includes(reaction.target_id)) {
      return true;
    }
  }

  return false;
}

export function acknowledge_unseen_reactions(detail: {
  target_ids: string[];
  thread_token?: string;
}): void {
  const thread_token = detail.thread_token || undefined;
  const target_ids = Array.from(new Set(detail.target_ids.filter(Boolean)));

  if (target_ids.length === 0 && thread_token === undefined) return;

  const flight_key = thread_token ?? [...target_ids].sort().join(",");

  if (in_flight_seen.has(flight_key)) return;
  in_flight_seen.add(flight_key);

  const hold = () => {
    const until = Date.now() + LOCAL_SEEN_HOLD_MS;

    for (const id of target_ids) locally_seen_until.set(target_key(id), until);
    if (thread_token !== undefined) {
      locally_seen_until.set(thread_key(thread_token), until);
    }
  };

  hold();
  forget(target_ids, thread_token);

  mark_reactions_seen({
    thread_token,
    target_message_ids: target_ids.slice(0, MAX_SEEN_TARGETS),
  })
    .then(() => {
      hold();
      request_cache.invalidate(MAIL_LIST_CACHE_KEY);
    })
    .catch((caught) =>
      ignore_error("services/unseen_reactions:mark_seen", caught),
    )
    .finally(() => {
      in_flight_seen.delete(flight_key);
    });
}

export function reset_unseen_reactions(): void {
  const had_state =
    server_targets.size > 0 ||
    server_threads.size > 0 ||
    live_reactions.size > 0;

  server_targets.clear();
  server_threads.clear();
  live_reactions.clear();
  locally_seen_until.clear();
  in_flight_seen.clear();
  if (had_state) notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function use_has_unseen_reaction(row: UnseenReactionRow): boolean {
  return useSyncExternalStore(
    subscribe,
    () => has_unseen_reaction(row),
    () => false,
  );
}
