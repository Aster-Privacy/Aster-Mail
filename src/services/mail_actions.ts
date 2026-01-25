import {
  queue_email,
  cancel_send,
  send_now,
  parse_undo_send_period,
} from "./send_queue";
import { get_or_create_thread_token } from "./thread_service";

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
}

export interface ForwardParams {
  original: OriginalEmail;
  recipients: string[];
  message: string;
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
  const recipients: string[] = [params.original.sender_email];

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
      body: params.message,
      thread_id: thread_token,
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
): Promise<MailActionResult> {
  if (params.recipients.length === 0) {
    const error = "No recipients specified";

    callbacks.on_error?.(error);

    return { success: false, error };
  }

  const subject = params.original.subject.trim().startsWith("Fwd:")
    ? params.original.subject
    : `Fwd: ${params.original.subject}`;

  const forwarded_header = [
    "",
    "---------- Forwarded message ---------",
    `From: ${params.original.sender_name} <${params.original.sender_email}>`,
    `Date: ${params.original.timestamp}`,
    `Subject: ${params.original.subject}`,
    "",
    params.original.body,
  ].join("\n");

  const full_body = params.message
    ? `${params.message}\n${forwarded_header}`
    : forwarded_header;

  const delay_ms = parse_undo_send_period(undo_send_period);

  const queued_id = queue_email(
    {
      to: params.recipients,
      subject,
      body: full_body,
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
