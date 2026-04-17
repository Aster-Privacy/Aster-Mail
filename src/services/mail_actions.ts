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
  cancel_send,
  send_now,
  parse_undo_send_period,
} from "./send_queue";
import { get_or_create_thread_token } from "./thread_service";

import { get_aster_footer } from "@/components/compose/compose_shared";

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

  return `Re: ${trimmed}`;
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
    const error = "No active account found";

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  const current_user_email = current_account.user.email;
  const recipients = build_reply_recipients(params, current_user_email);
  const subject = build_reply_subject(params.original.subject);
  const delay_ms = parse_undo_send_period(undo_send_period);

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
    delay_ms,
  );

  if (!queued_id) {
    const error = "Failed to queue reply";

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
    const error = "No recipients specified";

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  const subject = params.original.subject.trim().startsWith("Fwd:")
    ? params.original.subject
    : `Fwd: ${params.original.subject}`;

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
    `---------- Forwarded message ---------<br>` +
    `From: ${safe_name} &lt;${safe_email}&gt;<br>` +
    `Date: ${params.original.timestamp}<br>` +
    `Subject: ${safe_subject}<br><br>` +
    params.original.body;

  const badge_block = params.badge_html ?? "";
  const full_body = params.message
    ? `${params.message}<br><br>${forwarded_header}${badge_block}${get_aster_footer(undefined, show_aster_branding)}`
    : `${forwarded_header}${badge_block}${get_aster_footer(undefined, show_aster_branding)}`;

  const delay_ms = parse_undo_send_period(undo_send_period);

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
    delay_ms,
  );

  if (!queued_id) {
    const error = "Failed to queue forward";

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  return { success: true, queued_id };
}

export function cancel_mail_action(queued_id: string): boolean {
  const cancelled = cancel_send(queued_id);

  return cancelled !== null;
}

export function send_mail_now(queued_id: string): void {
  send_now(queued_id);
}
