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
import type {
  EmailParams,
  QueueCallbacks,
  QueuedEmailInternal,
  QueuedEmail,
  ServerQueueEmailParams,
  ServerQueueCallbacks,
  ServerQueueResult,
} from "./send_queue_types";

import {
  undo_send_manager,
  type PendingSend,
  type QueueEmailOptions,
} from "./undo_send_manager";
import { type QueueEmailRequest } from "./api/undo_send";
import { array_to_base64 } from "./crypto/envelope";
import { SendError, create_error } from "./send_queue_types";
import {
  check_send_readiness_internal,
  execute_send,
  encrypt_for_recipients,
  create_sent_envelope,
} from "./send_queue_encryption";
import { get_current_account } from "./account_manager";

import { emit_email_sent } from "@/hooks/mail_events";
import { invalidate_mail_counts } from "@/hooks/use_mail_counts";
import { show_toast } from "@/components/toast/simple_toast";
import { en } from "@/lib/i18n/translations/en";

export type {
  SendErrorType,
  EncryptionOptions,
  EmailParams,
  QueueCallbacks,
  QueuedEmail,
  ServerQueueEmailParams,
  ServerQueueCallbacks,
  ServerQueueResult,
} from "./send_queue_types";

export { SendError } from "./send_queue_types";

export { execute_external_send } from "./send_queue_encryption";

class SendQueue {
  private queued_emails: QueuedEmailInternal[] = [];
  private send_mutex: Promise<void> = Promise.resolve();
  private error_handler: ((error: SendError) => void) | null = null;

  set_error_handler(handler: (error: SendError) => void): void {
    this.error_handler = handler;
  }

  private report_error(error: SendError): void {
    if (this.error_handler) {
      this.error_handler(error);
    }
  }

  private async with_send_lock<T>(operation: () => Promise<T>): Promise<T> {
    let release: () => void;
    const acquire = new Promise<void>((resolve) => {
      release = resolve;
    });

    const previous = this.send_mutex;

    this.send_mutex = acquire;

    await previous;

    try {
      return await operation();
    } finally {
      release!();
    }
  }

  private normalize_error(err: unknown): SendError {
    if (err && typeof err === "object" && "type" in err && "message" in err) {
      return err as SendError;
    }
    if (err instanceof Error) {
      return create_error("send_failed", err.message);
    }

    return create_error("send_failed", en.common.unexpected_error);
  }

  private find_and_remove(id: string): QueuedEmailInternal | null {
    const index = this.queued_emails.findIndex((e) => e.id === id);

    if (index === -1) {
      return null;
    }

    return this.queued_emails.splice(index, 1)[0];
  }

  private async process_queued_email(id: string): Promise<void> {
    await this.with_send_lock(async () => {
      const current_email = this.find_and_remove(id);

      if (!current_email) {
        return;
      }

      try {
        await execute_send(current_email);
        invalidate_mail_counts();
        emit_email_sent();
        current_email.callbacks.on_complete();
      } catch (err) {
        const error = this.normalize_error(err);

        this.report_error(error);
        if (current_email.callbacks.on_error) {
          current_email.callbacks.on_error(error);
        }
        current_email.callbacks.on_cancel();
        show_toast(error.message || en.common.failed_to_send_email, "error");
      }
    });
  }

  queue(email: EmailParams & QueueCallbacks, delay_ms: number): string | null {
    const readiness = check_send_readiness_internal();

    if (readiness.ready === false) {
      if (email.on_error) {
        email.on_error(readiness.error);
      }
      this.report_error(readiness.error);

      return null;
    }

    const id = crypto.randomUUID();
    const scheduled_time = Date.now() + delay_ms;

    const timeout_id = window.setTimeout(() => {
      this.process_queued_email(id);
    }, delay_ms);

    this.queued_emails.push({
      id,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      envelope_subject: email.envelope_subject,
      body: email.body,
      thread_id: email.thread_id,
      sender_email: email.sender_email,
      sender_alias_hash: email.sender_alias_hash,
      sender_display_name: email.sender_display_name,
      expires_at: email.expires_at,
      attachments: email.attachments,
      forward_original_mail_id: email.forward_original_mail_id,
      scheduled_time,
      timeout_id,
      callbacks: {
        on_complete: email.on_complete,
        on_cancel: email.on_cancel,
        on_error: email.on_error,
      },
    });

    return id;
  }

  cancel(id: string): QueuedEmailInternal | null {
    const cancelled = this.find_and_remove(id);

    if (!cancelled) {
      return null;
    }

    window.clearTimeout(cancelled.timeout_id);

    return cancelled;
  }

  async send_now(id: string): Promise<void> {
    const current_email = this.find_and_remove(id);

    if (!current_email) {
      return;
    }

    window.clearTimeout(current_email.timeout_id);

    await this.with_send_lock(async () => {
      try {
        await execute_send(current_email);
        invalidate_mail_counts();
        emit_email_sent();
        current_email.callbacks.on_complete();
      } catch (err) {
        const error = this.normalize_error(err);

        this.report_error(error);
        if (current_email.callbacks.on_error) {
          current_email.callbacks.on_error(error);
        }
        current_email.callbacks.on_cancel();
        show_toast(error.message || en.common.failed_to_send_email, "error");
      }
    });
  }

  get_queued(): QueuedEmailInternal | null {
    return this.queued_emails.length > 0 ? this.queued_emails[0] : null;
  }
}

export const send_queue = new SendQueue();

export function check_send_readiness(): { ready: boolean; error?: string } {
  const result = check_send_readiness_internal();

  if (result.ready === false) {
    return { ready: false, error: result.error.message };
  }

  return { ready: true };
}

export function queue_email(
  email: EmailParams & {
    on_complete: () => void;
    on_cancel: () => void;
    on_error?: (error: string) => void;
  },
  delay_ms: number,
): string | null {
  const wrapped_error_handler = email.on_error
    ? (err: SendError) => email.on_error!(err.message)
    : undefined;

  return send_queue.queue(
    {
      ...email,
      on_error: wrapped_error_handler,
    },
    delay_ms,
  );
}

export function cancel_send(id: string): QueuedEmail | null {
  const result = send_queue.cancel(id);

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    to: result.to,
    cc: result.cc,
    bcc: result.bcc,
    subject: result.subject,
    body: result.body,
    scheduled_time: result.scheduled_time,
    timeout_id: result.timeout_id,
    on_complete: result.callbacks.on_complete,
    on_cancel: result.callbacks.on_cancel,
    on_error: result.callbacks.on_error
      ? (msg: string) =>
          result.callbacks.on_error!(create_error("send_failed", msg))
      : undefined,
  };
}

export async function send_now(id: string): Promise<void> {
  await send_queue.send_now(id);
}

export function get_queued_email(): QueuedEmail | null {
  const result = send_queue.get_queued();

  if (!result) {
    return null;
  }

  return {
    id: result.id,
    to: result.to,
    cc: result.cc,
    bcc: result.bcc,
    subject: result.subject,
    body: result.body,
    scheduled_time: result.scheduled_time,
    timeout_id: result.timeout_id,
    on_complete: result.callbacks.on_complete,
    on_cancel: result.callbacks.on_cancel,
    on_error: result.callbacks.on_error
      ? (msg: string) =>
          result.callbacks.on_error!(create_error("send_failed", msg))
      : undefined,
  };
}

const UNDO_SEND_MIN_SECONDS = 1;
const UNDO_SEND_MAX_SECONDS = 30;
const UNDO_SEND_DEFAULT_SECONDS = 10;

function clamp_undo_seconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < UNDO_SEND_MIN_SECONDS) {
    return UNDO_SEND_DEFAULT_SECONDS;
  }

  return Math.min(seconds, UNDO_SEND_MAX_SECONDS);
}

export function parse_undo_send_period(period: string): number {
  if (!period || typeof period !== "string") {
    return UNDO_SEND_DEFAULT_SECONDS * 1000;
  }

  const match = period.match(/(\d+)\s*second/i);

  if (match) {
    const seconds = clamp_undo_seconds(parseInt(match[1], 10));

    return seconds * 1000;
  }

  return UNDO_SEND_DEFAULT_SECONDS * 1000;
}

export function get_undo_send_delay_ms(
  undo_enabled: boolean | undefined,
  undo_seconds: number | undefined,
  fallback_period?: string,
): number {
  if (undo_enabled === false) {
    return 0;
  }

  if (typeof undo_seconds === "number" && Number.isFinite(undo_seconds)) {
    if (undo_seconds <= 0) {
      return 0;
    }

    return clamp_undo_seconds(undo_seconds) * 1000;
  }

  if (fallback_period) {
    return parse_undo_send_period(fallback_period);
  }

  return UNDO_SEND_DEFAULT_SECONDS * 1000;
}

async function prepare_email_for_server_queue(
  email: ServerQueueEmailParams,
): Promise<{
  request: QueueEmailRequest;
  is_encrypted: boolean;
} | null> {
  const readiness = check_send_readiness_internal();

  if (readiness.ready === false) {
    throw readiness.error;
  }

  const all_recipients = [
    ...email.to,
    ...(email.cc || []),
    ...(email.bcc || []),
  ];

  const { encrypted_body, is_encrypted } = await encrypt_for_recipients(
    email.body,
    all_recipients,
  );

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError(en.errors.no_authenticated_account);
  }
  const sender_email = email.sender_email || current_account.user.email;

  const internal_email: QueuedEmailInternal = {
    id: crypto.randomUUID(),
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    envelope_subject: email.envelope_subject,
    body: email.body,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
    sender_display_name: email.sender_display_name,
    scheduled_time: Date.now(),
    timeout_id: 0,
    callbacks: {
      on_complete: () => {},
      on_cancel: () => {},
    },
  };

  const envelope_data = await create_sent_envelope(
    internal_email,
    sender_email,
  );

  let effective_thread_id = email.thread_id;

  if (!effective_thread_id) {
    const random_bytes = crypto.getRandomValues(new Uint8Array(32));

    effective_thread_id = array_to_base64(random_bytes);
  }

  const request: QueueEmailRequest = {
    recipient: email.to[0],
    subject: email.subject,
    body: encrypted_body,
    is_encrypted,
    cc: email.cc,
    bcc: email.bcc,
    thread_id: effective_thread_id,
    in_reply_to: email.in_reply_to,
    attachments: email.server_attachments,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
    sender_display_name: email.sender_display_name,
    forward_original_mail_id: email.forward_original_mail_id,
  };

  return { request, is_encrypted };
}

export async function queue_email_to_server(
  email: ServerQueueEmailParams,
  delay_seconds: number,
  callbacks: ServerQueueCallbacks = {},
): Promise<ServerQueueResult | null> {
  try {
    const prepared = await prepare_email_for_server_queue(email);

    if (!prepared) {
      return null;
    }

    prepared.request.delay_seconds = delay_seconds;

    const options: QueueEmailOptions = {
      on_sent: () => {
        invalidate_mail_counts();
        callbacks.on_sent?.();
      },
      on_cancelled: callbacks.on_cancelled,
      on_error: callbacks.on_error,
    };

    const pending_send = await undo_send_manager.queue_email(
      prepared.request,
      options,
    );

    if (!pending_send) {
      return null;
    }

    return {
      queue_id: pending_send.queue_id,
      pending_send,
    };
  } catch (err) {
    const error = err as SendError;

    callbacks.on_error?.(error.message || en.errors.failed_queue_email);

    return null;
  }
}

export async function cancel_server_queued_email(
  queue_id: string,
): Promise<boolean> {
  return undo_send_manager.cancel_send(queue_id);
}

export async function send_server_queued_immediately(
  queue_id: string,
): Promise<boolean> {
  const result = await undo_send_manager.send_immediately(queue_id);

  if (result) {
    invalidate_mail_counts();
  }

  return result;
}

export function get_server_pending_sends(): PendingSend[] {
  return undo_send_manager.get_pending_sends();
}

export function subscribe_to_server_sends(
  listener: (sends: PendingSend[]) => void,
): () => void {
  return undo_send_manager.subscribe(listener);
}

export function get_server_send_time_remaining(queue_id: string): number {
  return undo_send_manager.get_time_remaining(queue_id);
}

export function get_server_send_time_remaining_seconds(
  queue_id: string,
): number {
  return undo_send_manager.get_time_remaining_seconds(queue_id);
}

export function can_cancel_server_send(queue_id: string): boolean {
  return undo_send_manager.can_cancel(queue_id);
}

export async function send_email_with_undo(
  email: ServerQueueEmailParams & ServerQueueCallbacks,
  delay_seconds: number,
  use_server_queue: boolean = true,
): Promise<{ queue_id: string; is_server_queued: boolean } | null> {
  if (use_server_queue) {
    const result = await queue_email_to_server(email, delay_seconds, {
      on_sent: email.on_sent,
      on_cancelled: email.on_cancelled,
      on_error: email.on_error,
    });

    if (result) {
      return {
        queue_id: result.queue_id,
        is_server_queued: true,
      };
    }
  }

  const delay_ms = delay_seconds * 1000;
  const queue_id = queue_email(
    {
      ...email,
      on_complete: () => {
        email.on_sent?.();
      },
      on_cancel: () => {
        email.on_cancelled?.();
      },
      on_error: email.on_error,
    },
    delay_ms,
  );

  if (!queue_id) {
    return null;
  }

  return {
    queue_id,
    is_server_queued: false,
  };
}

export async function cancel_email_with_undo(
  queue_id: string,
  is_server_queued: boolean,
): Promise<boolean> {
  if (is_server_queued) {
    return cancel_server_queued_email(queue_id);
  }

  const result = cancel_send(queue_id);

  return result !== null;
}

export async function send_email_immediately_with_undo(
  queue_id: string,
  is_server_queued: boolean,
): Promise<void> {
  if (is_server_queued) {
    await send_server_queued_immediately(queue_id);

    return;
  }

  await send_now(queue_id);
}

export { undo_send_manager };

export type { PendingSend, QueueEmailOptions };
