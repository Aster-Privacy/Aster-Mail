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
import { remove_pending_thread_reply } from "@/hooks/pending_thread_replies";
import type { Attachment } from "@/components/compose/compose_shared";
import type { DraftType } from "@/services/api/multi_drafts";
import type { TerminalSendStatus } from "@/services/undo_send_manager";

import { useState, useEffect, useCallback } from "react";

import { undo_send_manager as server_undo_manager } from "@/services/undo_send_manager";
import { ignore_error } from "@/lib/ignore_error";
import { emit_email_sent, emit_thread_reply_sent } from "@/hooks/mail_events";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { show_toast } from "@/components/toast/simple_toast";
import { get_active_translations } from "@/lib/i18n/translations";
import {
  cancel_send as cancel_queue_send,
  send_now as send_queue_now,
  cancel_server_queued_email_with_reason,
  send_server_queued_immediately,
} from "@/services/send_queue";
import {
  mark_send_queued,
  play_iconic_sound,
  release_queued_send,
} from "@/services/iconic_sounds";

export interface PendingSend {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  sender_email?: string;
  scheduled_time: number;
  total_seconds: number;
  timeout_id?: number;
  is_external?: boolean;
  is_server_queued?: boolean;
  server_queue_id?: string;
  on_send_immediately?: () => void;
  optimistic_id?: string;
  thread_token?: string;
  is_restored?: boolean;
  is_in_flight?: boolean;
}

export interface PendingSendPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  sender_email?: string;
  thread_token?: string;
  draft_type?: DraftType;
  reply_to_id?: string;
  rfc_message_id?: string;
  forward_from_id?: string;
  expires_at?: string;
  expiry_password?: string;
  attachments?: Attachment[];
  restore_verbatim?: boolean;
  is_plain_text?: boolean;
}

const pending_send_payloads = new Map<string, PendingSendPayload>();

export function store_pending_send_payload(
  id: string,
  payload: PendingSendPayload,
): void {
  pending_send_payloads.set(id, payload);
}

export function take_pending_send_payload(
  id: string,
): PendingSendPayload | undefined {
  const payload = pending_send_payloads.get(id);

  pending_send_payloads.delete(id);

  return payload;
}

type UndoSendListener = (pending_sends: PendingSend[]) => void;

const STORAGE_KEY = "astermail:pending_sends";

function persist_to_storage(sends: PendingSend[]): void {
  try {
    const serializable = sends.map(
      ({
        timeout_id,
        on_send_immediately,
        subject,
        body,
        to,
        cc,
        bcc,
        ...rest
      }) => ({ ...rest, to: [], subject: "", body: "" }),
    );

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    return;
  }
}

function load_from_storage(): PendingSend[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw) as PendingSend[];
    const now = Date.now();

    return parsed
      .filter(
        (p) =>
          p.scheduled_time > now && !!p.is_server_queued && !!p.server_queue_id,
      )
      .map((p) => ({ ...p, is_restored: true }));
  } catch {
    return [];
  }
}

function clear_storage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

const TAB_ID_KEY = "astermail:tab_id";
const WAITING_TAB_SENDS_KEY = "astermail:waiting_tab_sends";
const OTHER_TAB_GRACE_MS = 60_000;

interface WaitingTabSend {
  id: string;
  tab: string;
  due: number;
}

let cached_tab_id: string | null = null;

function get_tab_id(): string {
  if (cached_tab_id) return cached_tab_id;

  let tab_id = "";

  try {
    tab_id = sessionStorage.getItem(TAB_ID_KEY) ?? "";
    if (!tab_id) {
      tab_id = crypto.randomUUID();
      sessionStorage.setItem(TAB_ID_KEY, tab_id);
    }
  } catch {
    tab_id = tab_id || crypto.randomUUID();
  }

  cached_tab_id = tab_id;

  return tab_id;
}

function read_waiting_tab_sends(): WaitingTabSend[] {
  try {
    const raw = localStorage.getItem(WAITING_TAB_SENDS_KEY);

    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is WaitingTabSend =>
        !!entry &&
        typeof (entry as WaitingTabSend).id === "string" &&
        typeof (entry as WaitingTabSend).tab === "string" &&
        typeof (entry as WaitingTabSend).due === "number",
    );
  } catch {
    return [];
  }
}

function write_waiting_tab_sends(entries: WaitingTabSend[]): void {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(WAITING_TAB_SENDS_KEY);
    } else {
      localStorage.setItem(WAITING_TAB_SENDS_KEY, JSON.stringify(entries));
    }
  } catch {
    return;
  }
}

function remember_waiting_tab_send(id: string, due: number): void {
  const entries = read_waiting_tab_sends().filter((entry) => entry.id !== id);

  entries.push({ id, tab: get_tab_id(), due });
  write_waiting_tab_sends(entries);
}

function forget_waiting_tab_send(id: string): void {
  const entries = read_waiting_tab_sends();
  const remaining = entries.filter((entry) => entry.id !== id);

  if (remaining.length !== entries.length) write_waiting_tab_sends(remaining);
}

function is_tab_timer_send(pending: PendingSend): boolean {
  return !pending.is_server_queued && pending.timeout_id !== undefined;
}

class UndoSendManager {
  private pending_sends: Map<string, PendingSend> = new Map();
  private listeners: Set<UndoSendListener> = new Set();

  constructor() {
    const restored = load_from_storage();

    for (const pending of restored) {
      this.pending_sends.set(pending.id, pending);
    }
  }

  subscribe(listener: UndoSendListener): () => void {
    this.listeners.add(listener);
    listener(this.get_all());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const sends = this.get_all();

    persist_to_storage(sends);
    this.listeners.forEach((listener) => listener(sends));
  }

  add(pending: PendingSend): void {
    this.pending_sends.set(pending.id, pending);
    if (is_tab_timer_send(pending)) {
      remember_waiting_tab_send(pending.id, pending.scheduled_time);
    }
    mark_send_queued(pending.scheduled_time);
    play_iconic_sound("send");
    this.notify();
  }

  remove(id: string): PendingSend | undefined {
    const pending = this.pending_sends.get(id);

    if (pending) {
      if (pending.timeout_id !== undefined) {
        window.clearTimeout(pending.timeout_id);
      }
      this.pending_sends.delete(id);
      pending_send_payloads.delete(id);
      if (is_tab_timer_send(pending)) forget_waiting_tab_send(id);
      this.notify();
    }

    if (this.pending_sends.size === 0) {
      clear_storage();
    }

    return pending;
  }

  begin_tab_timer_send(id: string): boolean {
    const pending = this.pending_sends.get(id);

    if (!pending || pending.is_in_flight) return false;

    if (pending.timeout_id !== undefined) {
      window.clearTimeout(pending.timeout_id);
    }
    this.pending_sends.set(id, { ...pending, is_in_flight: true });
    forget_waiting_tab_send(id);
    this.notify();

    return true;
  }

  get(id: string): PendingSend | undefined {
    return this.pending_sends.get(id);
  }

  get_all(): PendingSend[] {
    return Array.from(this.pending_sends.values()).sort(
      (a, b) => a.scheduled_time - b.scheduled_time,
    );
  }

  get_time_remaining(id: string): number {
    const pending = this.pending_sends.get(id);

    if (!pending) return 0;
    const remaining = Math.max(
      0,
      Math.ceil((pending.scheduled_time - Date.now()) / 1000),
    );

    return remaining;
  }

  clear(): void {
    for (const pending of this.pending_sends.values()) {
      if (pending.timeout_id !== undefined) {
        window.clearTimeout(pending.timeout_id);
      }
    }
    this.pending_sends.clear();
    pending_send_payloads.clear();
    this.notify();
  }
}

export const undo_send_manager = new UndoSendManager();

export function handle_restored_send_settled(
  queue_id: string,
  status: TerminalSendStatus,
): void {
  const restored = undo_send_manager
    .get_all()
    .find((pending) => pending.server_queue_id === queue_id);

  if (restored) {
    undo_send_manager.remove(restored.id);
  }

  if (status !== "sent") return;

  invalidate_mail_stats();
  emit_email_sent();

  if (restored?.thread_token) {
    emit_thread_reply_sent({
      thread_token: restored.thread_token,
      optimistic_id: restored.optimistic_id,
    });
  }
}

export function settle_restored_sends_missing_from_server(): void {
  const known_queue_ids = new Set(
    server_undo_manager.get_all_sends().map((pending) => pending.queue_id),
  );

  for (const pending of undo_send_manager.get_all()) {
    if (!pending.is_restored || !pending.server_queue_id) continue;
    if (known_queue_ids.has(pending.server_queue_id)) continue;

    handle_restored_send_settled(pending.server_queue_id, "sent");
  }
}

export function has_tab_timer_sends(): boolean {
  return undo_send_manager.get_all().some(is_tab_timer_send);
}

export function take_interrupted_tab_sends(): number {
  const entries = read_waiting_tab_sends();

  if (entries.length === 0) return 0;

  const tab_id = get_tab_id();
  const now = Date.now();
  const remaining = entries.filter((entry) =>
    entry.tab === tab_id
      ? !!undo_send_manager.get(entry.id)
      : entry.due + OTHER_TAB_GRACE_MS > now,
  );
  const interrupted = entries.length - remaining.length;

  if (interrupted > 0) write_waiting_tab_sends(remaining);

  return interrupted;
}

export function next_interrupted_tab_send_check_ms(): number | null {
  const tab_id = get_tab_id();
  const other = read_waiting_tab_sends().filter(
    (entry) => entry.tab !== tab_id,
  );

  if (other.length === 0) return null;

  const latest_due = Math.max(...other.map((entry) => entry.due));

  return Math.max(0, latest_due + OTHER_TAB_GRACE_MS - Date.now()) + 1_000;
}

function install_tab_timer_unload_guards(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeunload", (event) => {
    if (!has_tab_timer_sends()) return;

    event.preventDefault();
    event.returnValue = "";
  });
}

install_tab_timer_unload_guards();

export function clear_undo_send_state(): void {
  undo_send_manager.clear();
  clear_storage();
  write_waiting_tab_sends([]);
}

export interface UndoSendEvent {
  id: string;
  pending: PendingSend;
  payload?: PendingSendPayload;
}

export function dispatch_undo_send_event(
  id: string,
  pending: PendingSend,
  payload?: PendingSendPayload,
): void {
  window.dispatchEvent(
    new CustomEvent<UndoSendEvent>("astermail:undo-send", {
      detail: { id, pending, payload },
    }),
  );
}

interface UseUndoSendReturn {
  pending_sends: PendingSend[];
  cancel_send: (id: string) => Promise<boolean>;
  send_immediately: (id: string) => void;
  get_time_remaining: (id: string) => number;
  remove_pending: (id: string) => void;
}

export function use_undo_send(): UseUndoSendReturn {
  const [pending_sends, set_pending_sends] = useState<PendingSend[]>([]);

  useEffect(() => {
    const unsubscribe = undo_send_manager.subscribe(set_pending_sends);

    return unsubscribe;
  }, []);

  const cancel_send = useCallback(async (id: string): Promise<boolean> => {
    const pending = undo_send_manager.get(id);

    if (!pending) return false;

    let payload: PendingSendPayload | undefined;

    if (pending.is_server_queued && pending.server_queue_id) {
      const outcome = await cancel_server_queued_email_with_reason(
        pending.server_queue_id,
      ).catch((caught) => {
        ignore_error("hooks/use_undo_send:use_undo_send", caught);

        return "failed" as const;
      });

      if (outcome !== "cancelled") {
        show_toast(
          outcome === "failed"
            ? get_active_translations().common.something_went_wrong_try_again
            : get_active_translations().common.undo_send_too_late,
          "error",
        );

        return false;
      }

      payload = take_pending_send_payload(id);
      undo_send_manager.remove(id);
    } else if (pending.timeout_id !== undefined) {
      if (pending.is_in_flight || pending.scheduled_time <= Date.now()) {
        show_toast(
          get_active_translations().common.undo_send_too_late,
          "error",
        );

        return false;
      }

      payload = take_pending_send_payload(id);
      undo_send_manager.remove(id);
    } else {
      const cancelled = cancel_queue_send(id);

      if (!cancelled) {
        show_toast(
          get_active_translations().common.undo_send_too_late,
          "error",
        );

        return false;
      }

      payload = take_pending_send_payload(id);
      undo_send_manager.remove(id);
    }

    remove_pending_thread_reply(id);
    release_queued_send();
    play_iconic_sound("undo_send");
    dispatch_undo_send_event(id, pending, payload);

    return true;
  }, []);

  const send_immediately = useCallback((id: string): void => {
    const pending = undo_send_manager.get(id);

    if (!pending || pending.is_in_flight) return;

    undo_send_manager.remove(id);

    if (pending.is_server_queued && pending.server_queue_id) {
      send_server_queued_immediately(pending.server_queue_id).catch((caught) =>
        ignore_error("hooks/use_undo_send:use_undo_send", caught),
      );
    } else if (pending.on_send_immediately) {
      pending.on_send_immediately();
    } else {
      send_queue_now(id);
    }
  }, []);

  const get_time_remaining = useCallback((id: string): number => {
    return undo_send_manager.get_time_remaining(id);
  }, []);

  const remove_pending = useCallback((id: string): void => {
    undo_send_manager.remove(id);
  }, []);

  return {
    pending_sends,
    cancel_send,
    send_immediately,
    get_time_remaining,
    remove_pending,
  };
}
