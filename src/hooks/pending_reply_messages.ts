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
import type { Dispatch, SetStateAction } from "react";
import type { DecryptedThreadMessage } from "@/types/thread";
import type {
  ThreadReplyCancelledEventDetail,
  ThreadReplyOptimisticEventDetail,
  ThreadReplySentEventDetail,
} from "@/hooks/mail_events";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { MAIL_EVENTS } from "@/hooks/mail_events";
import { request_cache } from "@/services/api/request_cache";
import {
  clear_pending_send_attachments,
  set_pending_send_attachments,
} from "@/services/pending_send_attachments";

export const SETTLED_REPLY_MESSAGE_TTL_MS = 30_000;
export const SENT_COPY_CLOCK_SKEW_MS = 120_000;

export type PendingReplyPhase = "sending" | "offline" | "failed" | "sent";

export interface PendingReplyStatus {
  phase: PendingReplyPhase;
  error?: string;
  can_retry: boolean;
}

export interface PendingReplyEntry {
  thread_token: string;
  original_email_id?: string;
  message: DecryptedThreadMessage;
  is_settled: boolean;
  status: PendingReplyStatus;
  sent_id?: string;
}

export type PendingReplyRetry = () => void;

interface UndoSendDetail {
  pending?: { optimistic_id?: string };
}

const pending_entries = new Map<string, PendingReplyEntry>();
const settle_timers = new Map<string, ReturnType<typeof setTimeout>>();
const retry_handlers = new Map<string, PendingReplyRetry>();
const listeners = new Set<() => void>();
let version = 0;
let events_bound = false;

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function add_pending_reply_message(
  detail: ThreadReplyOptimisticEventDetail,
): void {
  if (!detail.optimistic_id || !detail.thread_token) return;
  if (pending_entries.has(detail.optimistic_id)) return;

  set_pending_send_attachments(detail.optimistic_id, detail.attachments);

  pending_entries.set(detail.optimistic_id, {
    thread_token: detail.thread_token,
    original_email_id: detail.original_email_id,
    is_settled: false,
    status: { phase: "sending", can_retry: false },
    message: {
      id: detail.optimistic_id,
      item_type: "sent",
      sender_name: detail.sender_name,
      sender_email: detail.sender_email,
      subject: detail.subject,
      body: detail.body,
      html_content: detail.body,
      timestamp: new Date().toISOString(),
      is_read: true,
      is_starred: false,
      is_deleted: false,
      is_external: false,
      is_sending: true,
      to_recipients: detail.to_recipients,
      cc_recipients: detail.cc_recipients ?? [],
    },
  });
  notify();
}

export function remove_pending_reply_message(optimistic_id: string): void {
  const timer = settle_timers.get(optimistic_id);

  if (timer) clearTimeout(timer);
  settle_timers.delete(optimistic_id);
  retry_handlers.delete(optimistic_id);
  clear_pending_send_attachments(optimistic_id);

  if (pending_entries.delete(optimistic_id)) notify();
}

export function set_pending_reply_status(
  optimistic_id: string,
  phase: Exclude<PendingReplyPhase, "sent">,
  options: { error?: string; retry?: PendingReplyRetry } = {},
): void {
  const entry = pending_entries.get(optimistic_id);

  if (!entry || entry.is_settled) return;

  if (options.retry) retry_handlers.set(optimistic_id, options.retry);
  if (phase === "sending") retry_handlers.delete(optimistic_id);

  pending_entries.set(optimistic_id, {
    ...entry,
    status: {
      phase,
      error: phase === "failed" ? options.error : undefined,
      can_retry:
        (phase === "failed" || phase === "offline") &&
        retry_handlers.has(optimistic_id),
    },
  });
  notify();
}

export function retry_pending_reply(optimistic_id: string): boolean {
  const entry = pending_entries.get(optimistic_id);
  const retry = retry_handlers.get(optimistic_id);

  if (!entry || entry.is_settled || !retry) return false;
  if (entry.status.phase !== "failed" && entry.status.phase !== "offline") {
    return false;
  }

  set_pending_reply_status(optimistic_id, "sending");
  retry();

  return true;
}

export function retry_offline_pending_replies(): void {
  const waiting = [...pending_entries.entries()]
    .filter(([, entry]) => entry.status.phase === "offline")
    .map(([optimistic_id]) => optimistic_id);

  waiting.forEach((optimistic_id) => retry_pending_reply(optimistic_id));
}

export function get_pending_reply_status(
  optimistic_id: string | null | undefined,
): PendingReplyStatus | null {
  if (!optimistic_id) return null;

  return pending_entries.get(optimistic_id)?.status ?? null;
}

export function settle_pending_reply_message(
  optimistic_id: string,
  sent_id?: string,
): void {
  const entry = pending_entries.get(optimistic_id);

  if (!entry) return;
  if (entry.is_settled) {
    if (sent_id && !entry.sent_id) {
      pending_entries.set(optimistic_id, { ...entry, sent_id });
      notify();
    }

    return;
  }

  retry_handlers.delete(optimistic_id);
  pending_entries.set(optimistic_id, {
    ...entry,
    sent_id: sent_id ?? entry.sent_id,
    is_settled: true,
    status: { phase: "sent", can_retry: false },
  });
  settle_timers.set(
    optimistic_id,
    setTimeout(
      () => remove_pending_reply_message(optimistic_id),
      SETTLED_REPLY_MESSAGE_TTL_MS,
    ),
  );
  notify();
}

export function has_pending_reply_message(optimistic_id: string): boolean {
  return pending_entries.has(optimistic_id);
}

export function reset_pending_reply_messages(): void {
  settle_timers.forEach((timer) => clearTimeout(timer));
  settle_timers.clear();
  retry_handlers.clear();
  pending_entries.forEach((_entry, optimistic_id) =>
    clear_pending_send_attachments(optimistic_id),
  );

  if (pending_entries.size === 0) return;
  pending_entries.clear();
  notify();
}

export function get_pending_reply_entries(
  thread_token: string | null | undefined,
  email_id: string | null | undefined,
): PendingReplyEntry[] {
  const matches: PendingReplyEntry[] = [];

  for (const entry of pending_entries.values()) {
    const matches_thread =
      !!thread_token && entry.thread_token === thread_token;
    const matches_email =
      !!email_id &&
      !!entry.original_email_id &&
      entry.original_email_id === email_id;

    if (matches_thread || matches_email) matches.push(entry);
  }

  return matches;
}

function has_sent_copy(
  current: DecryptedThreadMessage[],
  pending: DecryptedThreadMessage,
): boolean {
  const earliest =
    new Date(pending.timestamp).getTime() - SENT_COPY_CLOCK_SKEW_MS;

  return current.some(
    (message) =>
      message.id !== pending.id &&
      message.item_type === "sent" &&
      message.is_sending !== true &&
      new Date(message.timestamp).getTime() >= earliest,
  );
}

function is_server_copy(message: DecryptedThreadMessage): boolean {
  return (
    message.item_type === "sent" &&
    message.is_sending !== true &&
    message.send_status !== "pending_server"
  );
}

function recipient_emails(message: DecryptedThreadMessage): Set<string> {
  return new Set(
    [...(message.to_recipients ?? []), ...(message.cc_recipients ?? [])]
      .map((recipient) => (recipient.email || "").trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

function covers_recipients(
  server: DecryptedThreadMessage,
  pending: DecryptedThreadMessage,
): boolean {
  const wanted = recipient_emails(pending);
  const got = recipient_emails(server);

  if (wanted.size === 0 || got.size === 0) return true;

  return [...wanted].every((email) => got.has(email));
}

function time_of(message: DecryptedThreadMessage): number {
  return new Date(message.timestamp).getTime();
}

export function match_sent_copies(
  current: DecryptedThreadMessage[],
  entries: PendingReplyEntry[],
  baselines?: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, string> {
  const matches = new Map<string, string>();
  const pending_ids = new Set(entries.map((entry) => entry.message.id));
  const servers = current
    .filter(
      (message) => !pending_ids.has(message.id) && is_server_copy(message),
    )
    .sort((a, b) => time_of(a) - time_of(b));
  const server_ids = new Set(servers.map((message) => message.id));
  const claimed = new Set<string>();

  entries.forEach((entry) => {
    if (entry.sent_id && server_ids.has(entry.sent_id)) {
      matches.set(entry.message.id, entry.sent_id);
      claimed.add(entry.sent_id);
    }
  });

  entries
    .filter(
      (entry) =>
        !entry.sent_id &&
        !matches.has(entry.message.id) &&
        !!baselines?.has(entry.message.id),
    )
    .sort((a, b) => time_of(a.message) - time_of(b.message))
    .forEach((entry) => {
      const baseline = baselines?.get(entry.message.id);
      const earliest = time_of(entry.message) - SENT_COPY_CLOCK_SKEW_MS;
      const found = servers.find(
        (server) =>
          !claimed.has(server.id) &&
          !baseline?.has(server.id) &&
          time_of(server) >= earliest &&
          covers_recipients(server, entry.message),
      );

      if (!found) return;
      matches.set(entry.message.id, found.id);
      claimed.add(found.id);
    });

  return matches;
}

export function merge_pending_reply_messages(
  current: DecryptedThreadMessage[],
  entries: PendingReplyEntry[],
  reconciled_ids?: ReadonlySet<string>,
  baselines?: ReadonlyMap<string, ReadonlySet<string>>,
): DecryptedThreadMessage[] {
  if (entries.length === 0) return current;
  if (!current.some((message) => message.is_sending !== true)) return current;

  const matched = match_sent_copies(current, entries, baselines);
  const base =
    matched.size === 0
      ? current
      : current.filter((message) => !matched.has(message.id));
  const present = new Set(base.map((message) => message.id));
  const missing = entries
    .filter((entry) => {
      if (matched.has(entry.message.id)) return false;
      if (present.has(entry.message.id)) return false;
      if (!entry.is_settled) return true;
      if (reconciled_ids?.has(entry.message.id)) return false;

      return !has_sent_copy(base, entry.message);
    })
    .map((entry) => entry.message);

  if (missing.length === 0 && base.length === current.length) return current;

  return [...base, ...missing];
}

export function bind_pending_reply_events(): void {
  if (events_bound || typeof window === "undefined") return;
  events_bound = true;

  window.addEventListener(MAIL_EVENTS.THREAD_REPLY_OPTIMISTIC, ((
    event: CustomEvent<ThreadReplyOptimisticEventDetail>,
  ) => {
    if (event.detail) add_pending_reply_message(event.detail);
  }) as EventListener);

  window.addEventListener(MAIL_EVENTS.THREAD_REPLY_CANCELLED, ((
    event: CustomEvent<ThreadReplyCancelledEventDetail>,
  ) => {
    if (event.detail) remove_pending_reply_message(event.detail.optimistic_id);
  }) as EventListener);

  window.addEventListener(MAIL_EVENTS.UNDO_SEND, ((
    event: CustomEvent<UndoSendDetail>,
  ) => {
    const optimistic_id = event.detail?.pending?.optimistic_id;

    if (optimistic_id) remove_pending_reply_message(optimistic_id);
  }) as EventListener);

  window.addEventListener(MAIL_EVENTS.THREAD_REPLY_SENT, ((
    event: CustomEvent<ThreadReplySentEventDetail>,
  ) => {
    const detail = event.detail;

    if (!detail) return;

    if (detail.thread_token) {
      request_cache.invalidate(
        `messages/threads/${encodeURIComponent(detail.thread_token)}/messages`,
      );
    }
    if (detail.optimistic_id) {
      settle_pending_reply_message(detail.optimistic_id, detail.sent_id);
    }
  }) as EventListener);

  window.addEventListener("online", () => retry_offline_pending_replies());
}

bind_pending_reply_events();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function get_version(): number {
  return version;
}

export function use_pending_reply_version(): number {
  return useSyncExternalStore(subscribe, get_version, get_version);
}

export function use_pending_reply_status(
  optimistic_id: string | null | undefined,
): PendingReplyStatus | null {
  return useSyncExternalStore(
    subscribe,
    () => get_pending_reply_status(optimistic_id),
    () => get_pending_reply_status(optimistic_id),
  );
}

interface UsePendingReplyMessagesOptions {
  thread_token: string | null | undefined;
  email_id: string | null | undefined;
  enabled: boolean;
  reload_drops_pending?: boolean;
  thread_messages: DecryptedThreadMessage[];
  set_thread_messages: Dispatch<SetStateAction<DecryptedThreadMessage[]>>;
}

export function use_pending_reply_messages({
  thread_token,
  email_id,
  enabled,
  reload_drops_pending = false,
  thread_messages,
  set_thread_messages,
}: UsePendingReplyMessagesOptions): void {
  const store_version = useSyncExternalStore(
    subscribe,
    get_version,
    get_version,
  );
  const tracked_email_id_ref = useRef(email_id);
  const shown_ids_ref = useRef(new Set<string>());
  const restored_ids_ref = useRef(new Set<string>());
  const baselines_ref = useRef(new Map<string, ReadonlySet<string>>());

  useLayoutEffect(() => {
    if (tracked_email_id_ref.current !== email_id) {
      tracked_email_id_ref.current = email_id;
      shown_ids_ref.current = new Set();
      restored_ids_ref.current = new Set();
      baselines_ref.current = new Map();
    }

    const expired = [...restored_ids_ref.current].filter(
      (id) => !has_pending_reply_message(id),
    );

    expired.forEach((id) => restored_ids_ref.current.delete(id));

    if (
      expired.some((id) => thread_messages.some((message) => message.id === id))
    ) {
      set_thread_messages((prev) =>
        prev.filter(
          (message) =>
            !expired.includes(message.id) || message.is_sending !== true,
        ),
      );

      return;
    }

    if (!enabled) return;
    if (thread_messages.some((message) => !message)) return;

    const present = new Set(thread_messages.map((message) => message.id));
    const entries = get_pending_reply_entries(
      thread_token,
      email_id && present.has(email_id) ? email_id : undefined,
    );

    const pending_ids = new Set(entries.map((entry) => entry.message.id));
    const loaded_ids = thread_messages
      .filter(
        (message) => !pending_ids.has(message.id) && message.is_sending !== true,
      )
      .map((message) => message.id);

    [...baselines_ref.current.keys()].forEach((id) => {
      if (!has_pending_reply_message(id)) baselines_ref.current.delete(id);
    });
    entries.forEach((entry) => {
      if (present.has(entry.message.id)) {
        shown_ids_ref.current.add(entry.message.id);
      }
      if (loaded_ids.length > 0 && !baselines_ref.current.has(entry.message.id)) {
        baselines_ref.current.set(entry.message.id, new Set(loaded_ids));
      }
    });

    const baselines = baselines_ref.current;
    const matched = match_sent_copies(thread_messages, entries, baselines);

    entries.forEach((entry) => {
      const sent_id = matched.get(entry.message.id);

      if (!sent_id) return;
      shown_ids_ref.current.add(entry.message.id);
      if (!entry.is_settled || !entry.sent_id) {
        settle_pending_reply_message(entry.message.id, sent_id);
      }
    });

    const reconciled_ids = reload_drops_pending
      ? undefined
      : shown_ids_ref.current;
    const merged = merge_pending_reply_messages(
      thread_messages,
      entries,
      reconciled_ids,
      baselines,
    );

    if (merged === thread_messages) return;

    merged.forEach((message) => {
      if (!present.has(message.id)) restored_ids_ref.current.add(message.id);
    });
    set_thread_messages((prev) =>
      merge_pending_reply_messages(prev, entries, reconciled_ids, baselines),
    );
  }, [
    enabled,
    reload_drops_pending,
    thread_token,
    email_id,
    thread_messages,
    set_thread_messages,
    store_version,
  ]);

  useLayoutEffect(() => {
    const drop = (optimistic_id: string | undefined) => {
      if (!optimistic_id) return;

      set_thread_messages((prev) =>
        prev.some((message) => message.id === optimistic_id)
          ? prev.filter((message) => message.id !== optimistic_id)
          : prev,
      );
    };
    const handle_cancelled = (event: Event) => {
      drop(
        (event as CustomEvent<ThreadReplyCancelledEventDetail>).detail
          ?.optimistic_id,
      );
    };
    const handle_undo_send = (event: Event) => {
      drop(
        (event as CustomEvent<UndoSendDetail>).detail?.pending?.optimistic_id,
      );
    };

    window.addEventListener(
      MAIL_EVENTS.THREAD_REPLY_CANCELLED,
      handle_cancelled,
    );
    window.addEventListener(MAIL_EVENTS.UNDO_SEND, handle_undo_send);

    return () => {
      window.removeEventListener(
        MAIL_EVENTS.THREAD_REPLY_CANCELLED,
        handle_cancelled,
      );
      window.removeEventListener(MAIL_EVENTS.UNDO_SEND, handle_undo_send);
    };
  }, [set_thread_messages]);
}
