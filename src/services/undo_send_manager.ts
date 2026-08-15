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
import {
  undo_send_api,
  type QueueEmailRequest,
  type QueuedEmailStatus,
} from "./api/undo_send";
import { en } from "@/lib/i18n/translations/en";

export interface PendingSend {
  queue_id: string;
  recipient: string;
  subject: string;
  scheduled_send_at: Date;
  can_cancel_until: Date;
  timeout_id: number;
  status: "pending" | "sending" | "sent" | "cancelled" | "failed";
  on_sent?: () => void;
  on_cancelled?: () => void;
  on_error?: (error: string) => void;
}

export interface QueueEmailOptions {
  on_sent?: () => void;
  on_cancelled?: () => void;
  on_error?: (error: string) => void;
}

type PendingSendListener = (sends: PendingSend[]) => void;

type TerminalSendStatus = "sent" | "cancelled" | "failed";

const FINALIZE_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];

function is_terminal_status(
  status: QueuedEmailStatus["status"],
): status is TerminalSendStatus {
  return status === "sent" || status === "cancelled" || status === "failed";
}

class UndoSendManager {
  private pending_sends: Map<string, PendingSend> = new Map();
  private listeners: Set<PendingSendListener> = new Set();
  private poll_interval: number | null = null;
  private finalizing: Set<string> = new Set();

  async queue_email(
    request: QueueEmailRequest,
    options: QueueEmailOptions = {},
  ): Promise<PendingSend | null> {
    const response = await undo_send_api.queue_email(request);

    if (response.error || !response.data) {
      if (options.on_error) {
        options.on_error(response.error || en.errors.failed_queue_email);
      }

      return null;
    }

    const { queue_id, scheduled_send_time, can_cancel_until } = response.data;

    const pending: PendingSend = {
      queue_id,
      recipient: request.to[0] || "",
      subject: request.subject,
      scheduled_send_at: new Date(scheduled_send_time),
      can_cancel_until: new Date(can_cancel_until),
      timeout_id: 0,
      status: "pending",
      on_sent: options.on_sent,
      on_cancelled: options.on_cancelled,
      on_error: options.on_error,
    };

    this.start_countdown(pending);
    this.pending_sends.set(queue_id, pending);
    this.ensure_polling();
    this.notify_listeners();

    return pending;
  }

  async cancel_send(queue_id: string): Promise<boolean> {
    const pending = this.pending_sends.get(queue_id);

    if (!pending) {
      return false;
    }

    if (pending.status !== "pending") {
      return false;
    }

    const now = new Date();

    if (now > pending.can_cancel_until) {
      return false;
    }

    const response = await undo_send_api.cancel_email(queue_id);

    if (response.error || !response.data?.success) {
      return false;
    }

    window.clearTimeout(pending.timeout_id);
    pending.status = "cancelled";

    if (pending.on_cancelled) {
      pending.on_cancelled();
    }

    this.pending_sends.delete(queue_id);
    this.notify_listeners();

    return true;
  }

  async send_immediately(queue_id: string): Promise<boolean> {
    const pending = this.pending_sends.get(queue_id);

    if (!pending) {
      return false;
    }

    if (pending.status !== "pending") {
      return false;
    }

    window.clearTimeout(pending.timeout_id);
    pending.status = "sending";
    this.notify_listeners();

    const response = await undo_send_api.send_now(queue_id);

    if (response.error || !response.data?.success) {
      pending.status = "failed";
      if (pending.on_error) {
        pending.on_error(response.error || en.errors.failed_send_email);
      }
      this.notify_listeners();

      return false;
    }

    pending.status = "sent";

    if (pending.on_sent) {
      pending.on_sent();
    }

    this.pending_sends.delete(queue_id);
    this.notify_listeners();

    return true;
  }

  get_pending_sends(): PendingSend[] {
    return Array.from(this.pending_sends.values()).filter(
      (send) => send.status === "pending",
    );
  }

  get_all_sends(): PendingSend[] {
    return Array.from(this.pending_sends.values());
  }

  get_send(queue_id: string): PendingSend | undefined {
    return this.pending_sends.get(queue_id);
  }

  subscribe(listener: PendingSendListener): () => void {
    this.listeners.add(listener);
    listener(this.get_pending_sends());

    return () => {
      this.listeners.delete(listener);
    };
  }

  get_time_remaining(queue_id: string): number {
    const pending = this.pending_sends.get(queue_id);

    if (!pending || pending.status !== "pending") {
      return 0;
    }

    const now = Date.now();
    const cancel_deadline = pending.can_cancel_until.getTime();
    const remaining = cancel_deadline - now;

    return Math.max(0, remaining);
  }

  get_time_remaining_seconds(queue_id: string): number {
    return Math.ceil(this.get_time_remaining(queue_id) / 1000);
  }

  can_cancel(queue_id: string): boolean {
    const pending = this.pending_sends.get(queue_id);

    if (!pending || pending.status !== "pending") {
      return false;
    }

    return this.get_time_remaining(queue_id) > 0;
  }

  private start_countdown(pending: PendingSend): void {
    const time_until_send = pending.scheduled_send_at.getTime() - Date.now();

    const delay = Math.max(0, time_until_send);

    pending.timeout_id = window.setTimeout(() => {
      this.handle_send_timeout(pending.queue_id);
    }, delay);
  }

  private async handle_send_timeout(queue_id: string): Promise<void> {
    const pending = this.pending_sends.get(queue_id);

    if (!pending) {
      return;
    }

    if (pending.status !== "pending") {
      return;
    }

    pending.status = "sending";
    this.notify_listeners();

    await this.finalize_send(queue_id);
  }

  private apply_terminal_status(
    pending: PendingSend,
    status: TerminalSendStatus,
    error_message?: string,
  ): void {
    window.clearTimeout(pending.timeout_id);
    pending.status = status;

    if (status === "sent" && pending.on_sent) {
      pending.on_sent();
    } else if (status === "cancelled" && pending.on_cancelled) {
      pending.on_cancelled();
    } else if (status === "failed" && pending.on_error) {
      pending.on_error(error_message || en.errors.failed_send);
    }

    this.pending_sends.delete(pending.queue_id);
    this.notify_listeners();
  }

  private async finalize_send(queue_id: string): Promise<void> {
    if (this.finalizing.has(queue_id)) {
      return;
    }

    this.finalizing.add(queue_id);

    try {
      for (
        let attempt = 0;
        attempt <= FINALIZE_RETRY_DELAYS_MS.length;
        attempt++
      ) {
        const pending = this.pending_sends.get(queue_id);

        if (!pending) {
          return;
        }

        const response = await undo_send_api
          .get_status(queue_id)
          .catch(() => undefined);

        if (response?.data && is_terminal_status(response.data.status)) {
          this.apply_terminal_status(
            pending,
            response.data.status,
            response.data.error_message,
          );

          return;
        }

        if (response && !response.data && response.code === "NOT_FOUND") {
          this.apply_terminal_status(pending, "sent");

          return;
        }

        const delay = FINALIZE_RETRY_DELAYS_MS[attempt];

        if (delay === undefined) {
          break;
        }

        await new Promise((resolve) => window.setTimeout(resolve, delay));
      }

      const pending = this.pending_sends.get(queue_id);

      if (pending) {
        this.apply_terminal_status(pending, "sent");
      }
    } finally {
      this.finalizing.delete(queue_id);
    }
  }

  private notify_listeners(): void {
    if (this.pending_sends.size === 0) {
      this.stop_polling();
    }

    const pending_list = this.get_pending_sends();

    this.listeners.forEach((listener) => {
      try {
        listener(pending_list);
      } catch {
        return;
      }
    });
  }

  async sync_with_server(): Promise<void> {
    const response = await undo_send_api.get_pending();

    if (response.error || !response.data) {
      return;
    }

    const server_emails = response.data.emails;
    const server_ids = new Set(server_emails.map((e) => e.queue_id));

    for (const queue_id of Array.from(this.pending_sends.keys())) {
      if (!server_ids.has(queue_id)) {
        const pending = this.pending_sends.get(queue_id);

        if (pending && pending.status === "pending") {
          window.clearTimeout(pending.timeout_id);
          pending.status = "sending";
          void this.finalize_send(queue_id);
        }
      }
    }

    for (const server_email of server_emails) {
      if (!this.pending_sends.has(server_email.queue_id)) {
        this.add_from_server_status(server_email);
      } else {
        this.update_from_server_status(server_email);
      }
    }

    this.notify_listeners();
  }

  private add_from_server_status(status: QueuedEmailStatus): void {
    if (status.status !== "pending") {
      return;
    }

    const pending: PendingSend = {
      queue_id: status.queue_id,
      recipient: status.subject_preview || "",
      subject: status.subject_preview || "",
      scheduled_send_at: new Date(status.scheduled_send_time),
      can_cancel_until: new Date(status.can_cancel_until),
      timeout_id: 0,
      status: "pending",
    };

    this.start_countdown(pending);
    this.pending_sends.set(status.queue_id, pending);
    this.ensure_polling();
  }

  private update_from_server_status(status: QueuedEmailStatus): void {
    const pending = this.pending_sends.get(status.queue_id);

    if (!pending) {
      return;
    }

    if (pending.status !== "pending") {
      return;
    }

    if (is_terminal_status(status.status)) {
      this.apply_terminal_status(pending, status.status, status.error_message);

      return;
    }

    if (status.status !== "pending") {
      window.clearTimeout(pending.timeout_id);
      pending.status = "sending";
      void this.finalize_send(status.queue_id);
    }
  }

  private ensure_polling(interval_ms: number = 5000): void {
    if (this.poll_interval !== null || this.pending_sends.size === 0) {
      return;
    }

    this.poll_interval = window.setInterval(async () => {
      await this.sync_with_server();
      if (this.pending_sends.size === 0) {
        this.stop_polling();
      }
    }, interval_ms);
  }

  stop_polling(): void {
    if (this.poll_interval !== null) {
      window.clearInterval(this.poll_interval);
      this.poll_interval = null;
    }
  }

  clear(): void {
    for (const pending of this.pending_sends.values()) {
      window.clearTimeout(pending.timeout_id);
    }

    this.pending_sends.clear();
    this.notify_listeners();
  }

  destroy(): void {
    this.stop_polling();
    this.clear();
    this.listeners.clear();
  }
}

export const undo_send_manager = new UndoSendManager();
