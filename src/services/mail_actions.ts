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
  queue_email,
  queue_email_to_server,
  cancel_send,
  send_now,
  cancel_server_queued_email,
  send_server_queued_immediately,
  parse_undo_send_period,
} from "./send_queue";
import { get_or_create_thread_token } from "./thread_service";

import { get_aster_footer } from "@/components/compose/compose_shared";
import { en } from "@/lib/i18n/translations/en";

export type MailActionType = "reply" | "reply_all" | "forward";

export interface OriginalEmail {
  sender_email: string;
  sender_name: string;
  subject: string;
  body: string;
  timestamp: string;
  cc?: string[];
  to?: string[];
}

export interface ReplyParams {
  original: OriginalEmail;
  message: string;
  reply_all?: boolean;
  thread_token?: string;
  original_email_id?: string;
  expires_at?: string;
  sender_email?: string;
  sender_alias_hash?: string;
}

export interface ForwardParams {
  original: OriginalEmail;
  recipients: string[];
  cc_recipients?: string[];
  bcc_recipients?: string[];
  message: string;
  badge_html?: string;
  expires_at?: string;
  sender_email?: string;
  sender_alias_hash?: string;
  attachments?: import("@/components/compose/compose_shared").Attachment[];
  forward_original_mail_id?: string;
}

export interface MailActionResult {
  success: boolean;
  queued_id?: string;
  thread_token?: string;
  error?: string;
  is_server_queued?: boolean;
}

export interface MailActionCallbacks {
  on_complete: () => void;
  on_cancel: () => void;
  on_error?: (error: string) => void;
}

function build_reply_subject(original_subject: string): string {
  const trimmed = original_subject.trim();

  if (/^re:/i.test(trimmed)) {
    return trimmed;
  }

  return `${en.mail.reply_subject_prefix} ${trimmed}`;
}

function build_reply_recipients(
  params: ReplyParams,
  current_user_email: string,
): string[] {
  const sender_is_self =
    params.original.sender_email.toLowerCase().trim() ===
    current_user_email.toLowerCase().trim();

  const primary_recipient = sender_is_self
    ? (params.original.to?.[0] ?? params.original.sender_email)
    : params.original.sender_email;

  const recipients: string[] = [primary_recipient];

  if (params.reply_all) {
    const original_to = params.original.to || [];
    const original_cc = params.original.cc || [];
    const all_addresses = [...original_to, ...original_cc];

    for (const addr of all_addresses) {
      const normalized = addr.toLowerCase().trim();

      if (
        normalized !== current_user_email.toLowerCase() &&
        !recipients.some((r) => r.toLowerCase() === normalized)
      ) {
        recipients.push(addr);
      }
    }
  }

  return recipients;
}

export async function send_reply(
  params: ReplyParams,
  callbacks: MailActionCallbacks,
  undo_send_period: string = "5 seconds",
): Promise<MailActionResult> {
  const { get_current_account } = await import("./account_manager");
  const current_account = await get_current_account();

  if (!current_account) {
    const error = en.errors.no_active_account;

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  const current_user_email = current_account.user.email;
  const recipients = build_reply_recipients(params, current_user_email);
  const subject = build_reply_subject(params.original.subject);
  const delay_ms = parse_undo_send_period(undo_send_period);
  const delay_seconds = delay_ms / 1000;

  let thread_token = params.thread_token;

  if (params.original_email_id) {
    const resolved_token = await get_or_create_thread_token(
      params.original_email_id,
      params.thread_token,
    );

    if (resolved_token) {
      thread_token = resolved_token;
    }
  }

  if (delay_seconds > 0) {
    const result = await queue_email_to_server(
      {
        to: recipients,
        subject,
        envelope_subject: params.original.subject,
        body: params.message,
        thread_id: thread_token,
        expires_at: params.expires_at,
        sender_email: params.sender_email,
        sender_alias_hash: params.sender_alias_hash,
      },
      delay_seconds,
      {
        on_sent: callbacks.on_complete,
        on_cancelled: callbacks.on_cancel,
        on_error: callbacks.on_error,
      },
    );

    if (!result) {
      const error = en.errors.failed_queue_reply;

      callbacks.on_error?.(error);

      return { success: false, error };
    }

    return {
      success: true,
      queued_id: result.queue_id,
      thread_token,
      is_server_queued: true,
    };
  }

  const queued_id = queue_email(
    {
      to: recipients,
      subject,
      envelope_subject: params.original.subject,
      body: params.message,
      thread_id: thread_token,
      expires_at: params.expires_at,
      sender_email: params.sender_email,
      sender_alias_hash: params.sender_alias_hash,
      on_complete: callbacks.on_complete,
      on_cancel: callbacks.on_cancel,
      on_error: callbacks.on_error,
    },
    0,
  );

  if (!queued_id) {
    const error = en.errors.failed_queue_reply;

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  return { success: true, queued_id, thread_token };
}

export async function send_forward(
  params: ForwardParams,
  callbacks: MailActionCallbacks,
  undo_send_period: string = "5 seconds",
  show_aster_branding: boolean = true,
): Promise<MailActionResult> {
  if (params.recipients.length === 0) {
    const error = en.errors.no_recipients;

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  const subject = params.original.subject.trim().startsWith(en.mail.forward_subject_prefix)
    ? params.original.subject
    : `${en.mail.forward_subject_prefix} ${params.original.subject}`;

  const safe_name = params.original.sender_name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const safe_email = params.original.sender_email
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const safe_subject = params.original.subject
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const forwarded_header =
    `${en.common.forwarded_message_header}<br>` +
    `${en.common.from_label} ${safe_name} &lt;${safe_email}&gt;<br>` +
    `${en.common.date_label} ${params.original.timestamp}<br>` +
    `${en.common.subject_label} ${safe_subject}<br><br>` +
    params.original.body;

  const badge_block = params.badge_html ?? "";
  const full_body = params.message
    ? `${params.message}<br><br>${forwarded_header}${badge_block}${get_aster_footer(undefined, show_aster_branding)}`
    : `${forwarded_header}${badge_block}${get_aster_footer(undefined, show_aster_branding)}`;

  const delay_ms = parse_undo_send_period(undo_send_period);
  const delay_seconds = delay_ms / 1000;

  if (delay_seconds > 0) {
    const result = await queue_email_to_server(
      {
        to: params.recipients,
        cc: params.cc_recipients,
        bcc: params.bcc_recipients,
        subject,
        envelope_subject: params.original.subject,
        body: full_body,
        expires_at: params.expires_at,
        sender_email: params.sender_email,
        sender_alias_hash: params.sender_alias_hash,
        attachments: params.attachments,
        forward_original_mail_id: params.forward_original_mail_id,
      },
      delay_seconds,
      {
        on_sent: callbacks.on_complete,
        on_cancelled: callbacks.on_cancel,
        on_error: callbacks.on_error,
      },
    );

    if (!result) {
      const error = en.errors.failed_queue_forward;

      callbacks.on_error?.(error);

      return { success: false, error };
    }

    return { success: true, queued_id: result.queue_id, is_server_queued: true };
  }

  const queued_id = queue_email(
    {
      to: params.recipients,
      cc: params.cc_recipients,
      bcc: params.bcc_recipients,
      subject,
      envelope_subject: params.original.subject,
      body: full_body,
      expires_at: params.expires_at,
      sender_email: params.sender_email,
      sender_alias_hash: params.sender_alias_hash,
      attachments: params.attachments,
      forward_original_mail_id: params.forward_original_mail_id,
      on_complete: callbacks.on_complete,
      on_cancel: callbacks.on_cancel,
      on_error: callbacks.on_error,
    },
    0,
  );

  if (!queued_id) {
    const error = en.errors.failed_queue_forward;

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  return { success: true, queued_id };
}

export function cancel_mail_action(queued_id: string): boolean {
  const cancelled = cancel_send(queued_id);

  if (cancelled !== null) {
    return true;
  }

  cancel_server_queued_email(queued_id).catch(() => {});

  return true;
}

export function send_mail_now(queued_id: string): void {
  send_now(queued_id).catch(() => {
    send_server_queued_immediately(queued_id).catch(() => {});
  });
}
