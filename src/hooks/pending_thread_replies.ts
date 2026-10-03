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
import { useEffect, useSyncExternalStore } from "react";

import { MAIL_EVENTS, on_mail_event } from "./mail_events";

export const SETTLED_REPLY_TTL_MS = 15_000;

interface PendingThread {
  ids: Set<string>;
  baseline: number | undefined;
}

const pending = new Map<string, PendingThread>();
const owner_of = new Map<string, string>();
const settle_timers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let version = 0;
let events_bound = false;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function add_pending_thread_reply(
  thread_token: string,
  reply_id: string,
): void {
  if (!thread_token || !reply_id || owner_of.has(reply_id)) return;

  const entry = pending.get(thread_token) ?? {
    ids: new Set<string>(),
    baseline: undefined,
  };

  entry.ids.add(reply_id);
  pending.set(thread_token, entry);
  owner_of.set(reply_id, thread_token);
  notify();
}

export function remove_pending_thread_reply(reply_id: string): void {
  const thread_token = owner_of.get(reply_id);

  if (!thread_token) return;

  const timer = settle_timers.get(reply_id);

  if (timer) clearTimeout(timer);
  settle_timers.delete(reply_id);
  owner_of.delete(reply_id);

  const entry = pending.get(thread_token);

  if (entry) {
    entry.ids.delete(reply_id);
    if (entry.ids.size === 0) pending.delete(thread_token);
  }
  notify();
}

export function settle_pending_thread_reply(reply_id: string): void {
  if (!owner_of.has(reply_id) || settle_timers.has(reply_id)) return;

  settle_timers.set(
    reply_id,
    setTimeout(
      () => remove_pending_thread_reply(reply_id),
      SETTLED_REPLY_TTL_MS,
    ),
  );
}

export function note_thread_count_baseline(
  thread_token: string | undefined,
  server_count: number,
): void {
  if (!thread_token) return;

  const entry = pending.get(thread_token);

  if (entry && entry.baseline === undefined) entry.baseline = server_count;
}

export function shown_thread_count(
  thread_token: string | undefined,
  server_count: number | null | undefined,
): number {
  const server = server_count ?? 1;

  if (!thread_token) return server;

  const entry = pending.get(thread_token);

  if (!entry || entry.ids.size === 0) return server;

  return Math.max(server, (entry.baseline ?? server) + entry.ids.size);
}

export function reset_pending_thread_replies(): void {
  settle_timers.forEach((timer) => clearTimeout(timer));
  settle_timers.clear();
  pending.clear();
  owner_of.clear();
  notify();
}

function bind_reply_events(): void {
  if (events_bound || typeof window === "undefined") return;
  events_bound = true;

  on_mail_event(MAIL_EVENTS.THREAD_REPLY_OPTIMISTIC, (detail) => {
    add_pending_thread_reply(detail.thread_token, detail.optimistic_id);
  });
  on_mail_event(MAIL_EVENTS.THREAD_REPLY_CANCELLED, (detail) => {
    remove_pending_thread_reply(detail.optimistic_id);
  });
  on_mail_event(MAIL_EVENTS.THREAD_REPLY_SENT, (detail) => {
    if (detail.optimistic_id) settle_pending_thread_reply(detail.optimistic_id);
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_version(): number {
  return version;
}

export function use_shown_thread_count(
  thread_token: string | undefined,
  server_count: number | null | undefined,
): number {
  bind_reply_events();
  useSyncExternalStore(subscribe, get_version, get_version);

  const shown = shown_thread_count(thread_token, server_count);

  useEffect(() => {
    note_thread_count_baseline(thread_token, server_count ?? 1);
  }, [thread_token, server_count, shown]);

  return shown;
}
