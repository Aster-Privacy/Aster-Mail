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
import { useState, useEffect, useCallback } from "react";

import {
  cancel_send as cancel_queue_send,
  send_now as send_queue_now,
  cancel_server_queued_email,
  send_server_queued_immediately,
} from "@/services/send_queue";

export interface PendingSend {
  id: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  scheduled_time: number;
  total_seconds: number;
  timeout_id?: number;
  is_external?: boolean;
  is_server_queued?: boolean;
  server_queue_id?: string;
  on_send_immediately?: () => void;
}

type UndoSendListener = (pending_sends: PendingSend[]) => void;

const STORAGE_KEY = "astermail:pending_sends";

function persist_to_storage(sends: PendingSend[]): void {
  try {
    const serializable = sends.map(
      ({ timeout_id, on_send_immediately, ...rest }) => rest,
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

    return parsed.filter((p) => p.scheduled_time > now);
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
    this.notify();
  }

  remove(id: string): PendingSend | undefined {
    const pending = this.pending_sends.get(id);

    if (pending) {
      if (pending.timeout_id !== undefined) {
        window.clearTimeout(pending.timeout_id);
      }
      this.pending_sends.delete(id);
      this.notify();
    }

    if (this.pending_sends.size === 0) {
      clear_storage();
    }

    return pending;
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
    this.pending_sends.clear();
    this.notify();
  }
}

export const undo_send_manager = new UndoSendManager();

export interface UndoSendEvent {
  id: string;
  pending: PendingSend;
}

export function dispatch_undo_send_event(
  id: string,
  pending: PendingSend,
): void {
  window.dispatchEvent(
    new CustomEvent<UndoSendEvent>("astermail:undo-send", {
      detail: { id, pending },
    }),
  );
}

interface UseUndoSendReturn {
  pending_sends: PendingSend[];
  cancel_send: (id: string) => boolean;
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

  const cancel_send = useCallback((id: string): boolean => {
    const pending = undo_send_manager.get(id);

    if (!pending) return false;

    undo_send_manager.remove(id);

    if (pending.is_server_queued && pending.server_queue_id) {
      cancel_server_queued_email(pending.server_queue_id).catch(() => {});
    } else {
      cancel_queue_send(id);
    }

    dispatch_undo_send_event(id, pending);

    return true;
  }, []);

  const send_immediately = useCallback((id: string): void => {
    const pending = undo_send_manager.get(id);

    if (!pending) return;

    undo_send_manager.remove(id);

    if (pending.is_server_queued && pending.server_queue_id) {
      send_server_queued_immediately(pending.server_queue_id).catch(() => {});
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
