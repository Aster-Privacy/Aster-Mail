import { useState, useEffect, useCallback } from "react";

import {
  cancel_send as cancel_queue_send,
  send_now as send_queue_now,
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
  on_send_immediately?: () => void;
}

type UndoSendListener = (pending_sends: PendingSend[]) => void;

class UndoSendManager {
  private pending_sends: Map<string, PendingSend> = new Map();
  private listeners: Set<UndoSendListener> = new Set();

  subscribe(listener: UndoSendListener): () => void {
    this.listeners.add(listener);
    listener(this.get_all());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const sends = this.get_all();

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
    cancel_queue_send(id);
    dispatch_undo_send_event(id, pending);

    return true;
  }, []);

  const send_immediately = useCallback((id: string): void => {
    const pending = undo_send_manager.get(id);

    if (pending?.on_send_immediately) {
      undo_send_manager.remove(id);
      pending.on_send_immediately();
    } else {
      undo_send_manager.remove(id);
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
