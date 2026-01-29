import type { MailItemMetadata } from "@/types/email";

import { send_simple_email, send_external_email } from "./api/send";
import {
  get_recipient_public_key,
  extract_username_from_email,
  is_internal_email,
} from "./api/keys";
import { encrypt_message_multi } from "./crypto/key_manager";
import {
  get_vault_from_memory,
  get_passphrase_bytes,
  has_passphrase_in_memory,
} from "./crypto/memory_key_store";
import {
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
} from "./crypto/ratchet_manager";
import { get_current_account } from "./account_manager";
import {
  encrypt_envelope_with_bytes,
  array_to_base64,
} from "./crypto/envelope";
import { zero_uint8_array } from "./crypto/secure_memory";
import {
  undo_send_manager,
  type PendingSend,
  type QueueEmailOptions,
} from "./undo_send_manager";
import { type QueueEmailRequest } from "./api/undo_send";
import { encrypt_mail_metadata } from "./crypto/mail_metadata";

import { invalidate_mail_counts } from "@/hooks/use_mail_counts";
import { emit_email_sent } from "@/hooks/mail_events";

const FIELD_ID_RECIPIENTS = 0x01;
const FIELD_ID_SUBJECT = 0x02;
const FIELD_ID_BODY = 0x03;

function derive_field_nonce(
  base_nonce: Uint8Array,
  field_id: number,
): Uint8Array {
  const derived = new Uint8Array(12);

  derived.set(base_nonce.subarray(0, 11));
  derived[11] = base_nonce[11] ^ field_id;

  return derived;
}

async function encrypt_with_ephemeral_key(
  recipients: { to: string[]; cc?: string[]; bcc?: string[] },
  subject: string,
  body: string,
): Promise<{
  encrypted_recipients: string;
  encrypted_subject: string;
  encrypted_body: string;
  ephemeral_key: string;
  nonce: string;
}> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );

  const base_nonce = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();

  const recipients_nonce = derive_field_nonce(base_nonce, FIELD_ID_RECIPIENTS);
  const recipients_data = encoder.encode(JSON.stringify(recipients));
  const encrypted_recipients_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: recipients_nonce },
    key,
    recipients_data,
  );

  const subject_nonce = derive_field_nonce(base_nonce, FIELD_ID_SUBJECT);
  const subject_data = encoder.encode(subject);
  const encrypted_subject_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: subject_nonce },
    key,
    subject_data,
  );

  const body_nonce = derive_field_nonce(base_nonce, FIELD_ID_BODY);
  const body_data = encoder.encode(body);
  const encrypted_body_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: body_nonce },
    key,
    body_data,
  );

  const raw_key = await crypto.subtle.exportKey("raw", key);

  return {
    encrypted_recipients: array_to_base64(
      new Uint8Array(encrypted_recipients_buffer),
    ),
    encrypted_subject: array_to_base64(
      new Uint8Array(encrypted_subject_buffer),
    ),
    encrypted_body: array_to_base64(new Uint8Array(encrypted_body_buffer)),
    ephemeral_key: array_to_base64(new Uint8Array(raw_key)),
    nonce: array_to_base64(base_nonce),
  };
}

export type SendErrorType =
  | "vault_unavailable"
  | "encryption_failed"
  | "send_failed"
  | "recipient_error"
  | "mixed_recipients";

export class SendError extends Error {
  type: SendErrorType;

  constructor(message: string, type: SendErrorType = "send_failed") {
    super(message);
    this.type = type;
    this.name = "SendError";
  }
}

export interface EmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  thread_id?: string;
  sender_email?: string;
  sender_alias_hash?: string;
}

export interface QueueCallbacks {
  on_complete: () => void;
  on_cancel: () => void;
  on_error?: (error: SendError) => void;
}

interface QueuedEmailInternal extends EmailParams {
  id: string;
  scheduled_time: number;
  timeout_id: number;
  callbacks: QueueCallbacks;
}

export interface QueuedEmail extends EmailParams {
  id: string;
  scheduled_time: number;
  timeout_id: number;
  on_complete: () => void;
  on_cancel: () => void;
  on_error?: (error: string) => void;
}

interface MailEnvelope {
  version: number;
  subject: string;
  body_text: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  cc: { name: string; email: string }[];
  bcc: { name: string; email: string }[];
  sent_at: string;
}

interface EncryptionResult {
  encrypted_body: string;
  is_encrypted: boolean;
}

interface EnvelopeData {
  encrypted_envelope: string;
  envelope_nonce: string;
  folder_token: string;
  encrypted_metadata?: string;
  metadata_nonce?: string;
}

type SendReadinessResult = { ready: true } | { ready: false; error: SendError };

function create_error(type: SendErrorType, message: string): SendError {
  return new SendError(message, type);
}

function check_send_readiness_internal(): SendReadinessResult {
  const vault = get_vault_from_memory();

  if (!vault || !vault.identity_key) {
    return {
      ready: false,
      error: create_error(
        "vault_unavailable",
        "Your encryption keys are not loaded. Please re-enter your password to unlock your vault.",
      ),
    };
  }

  if (!has_passphrase_in_memory()) {
    return {
      ready: false,
      error: create_error(
        "vault_unavailable",
        "Your session has expired. Please re-enter your password to continue.",
      ),
    };
  }

  return { ready: true };
}

async function encrypt_for_recipients(
  body: string,
  recipients: string[],
  sender_email?: string,
): Promise<EncryptionResult> {
  const internal_recipients = recipients.filter(is_internal_email);

  if (internal_recipients.length === 0) {
    return { encrypted_body: body, is_encrypted: false };
  }

  const external_recipients = recipients.filter((r) => !is_internal_email(r));

  if (external_recipients.length > 0) {
    throw create_error(
      "mixed_recipients",
      "Cannot send to both internal and external recipients. Internal emails are E2E encrypted, external emails are not. Please send separately.",
    );
  }

  const vault = get_vault_from_memory();

  if (
    sender_email &&
    vault?.ratchet_identity_key &&
    vault?.ratchet_identity_public
  ) {
    const ratchet_results: Record<
      string,
      Awaited<ReturnType<typeof encrypt_for_ratchet_recipient>>
    > = {};
    let all_ratchet_ok = true;

    for (const recipient of internal_recipients) {
      const username = extract_username_from_email(recipient);

      if (!username) {
        all_ratchet_ok = false;
        break;
      }

      const result = await encrypt_for_ratchet_recipient(
        sender_email,
        recipient,
        username,
        body,
        vault,
      );

      if (result) {
        ratchet_results[recipient.toLowerCase()] = result;
      } else {
        all_ratchet_ok = false;
        break;
      }
    }

    if (all_ratchet_ok && Object.keys(ratchet_results).length > 0) {
      const envelope = build_ratchet_envelope(
        vault.ratchet_identity_public,
        ratchet_results as Record<
          string,
          NonNullable<(typeof ratchet_results)[string]>
        >,
      );

      return { encrypted_body: envelope, is_encrypted: true };
    }
  }

  const public_keys: string[] = [];

  for (const recipient of internal_recipients) {
    const username = extract_username_from_email(recipient);

    if (!username) {
      throw create_error(
        "recipient_error",
        `Invalid email format: ${recipient}`,
      );
    }

    const key_response = await get_recipient_public_key(username);

    if (key_response.error || !key_response.data) {
      throw create_error(
        "recipient_error",
        `Recipient ${recipient} does not have a public key for encryption`,
      );
    }

    public_keys.push(key_response.data.public_key);
  }

  try {
    const encrypted = await encrypt_message_multi(body, public_keys);

    return { encrypted_body: encrypted, is_encrypted: true };
  } catch {
    throw create_error(
      "encryption_failed",
      "Failed to encrypt message for recipients",
    );
  }
}

async function create_sent_envelope(
  email: QueuedEmailInternal,
  sender_email: string,
): Promise<EnvelopeData> {
  const vault = get_vault_from_memory();
  const passphrase_bytes = get_passphrase_bytes();

  if (!vault || !vault.identity_key) {
    throw create_error(
      "vault_unavailable",
      "Encryption keys not available. Please log in again.",
    );
  }

  if (!passphrase_bytes) {
    throw create_error(
      "vault_unavailable",
      "Session expired. Please log in again to send emails.",
    );
  }

  const envelope: MailEnvelope = {
    version: 1,
    subject: email.subject,
    body_text: email.body,
    from: { name: "", email: sender_email },
    to: email.to.map((e) => ({ name: "", email: e })),
    cc: (email.cc || []).map((e) => ({ name: "", email: e })),
    bcc: (email.bcc || []).map((e) => ({ name: "", email: e })),
    sent_at: new Date().toISOString(),
  };

  try {
    const { encrypted, nonce } = await encrypt_envelope_with_bytes(
      envelope,
      passphrase_bytes,
    );

    zero_uint8_array(passphrase_bytes);

    const encoder = new TextEncoder();
    const folder_material = encoder.encode(vault.identity_key + "folder:sent");
    const folder_hash = await crypto.subtle.digest("SHA-256", folder_material);

    const metadata: MailItemMetadata = {
      is_read: true,
      is_starred: false,
      is_pinned: false,
      is_trashed: false,
      is_archived: false,
      is_spam: false,
      size_bytes: new TextEncoder().encode(email.body).length,
      has_attachments: false,
      attachment_count: 0,
      message_ts: new Date().toISOString(),
      item_type: "sent",
    };

    const encrypted_metadata_result = await encrypt_mail_metadata(metadata);

    return {
      encrypted_envelope: encrypted,
      envelope_nonce: nonce,
      folder_token: array_to_base64(new Uint8Array(folder_hash)),
      encrypted_metadata: encrypted_metadata_result?.encrypted_metadata,
      metadata_nonce: encrypted_metadata_result?.metadata_nonce,
    };
  } catch (err) {
    zero_uint8_array(passphrase_bytes);
    if ((err as SendError).type) {
      throw err;
    }
    throw create_error("encryption_failed", "Failed to encrypt sent envelope");
  }
}

async function execute_send(email: QueuedEmailInternal): Promise<void> {
  const readiness = check_send_readiness_internal();

  if (readiness.ready === false) {
    throw readiness.error;
  }

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError("No authenticated account found");
  }
  const sender_email = email.sender_email || current_account.user.email;

  const all_recipients = [
    ...email.to,
    ...(email.cc || []),
    ...(email.bcc || []),
  ];

  const { encrypted_body, is_encrypted } = await encrypt_for_recipients(
    email.body,
    all_recipients,
    sender_email,
  );

  const envelope_data = await create_sent_envelope(email, sender_email);

  const request: Parameters<typeof send_simple_email>[0] = {
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    body: encrypted_body,
    is_e2e_encrypted: is_encrypted,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
  };

  if (email.thread_id) {
    request.thread_token = email.thread_id;
  }

  const result = await send_simple_email(request);

  if (!result.data?.success) {
    throw create_error("send_failed", result.error || "Failed to send email");
  }
}

export async function execute_external_send(
  email: EmailParams,
  acknowledge_server_readable: boolean = true,
): Promise<void> {
  const readiness = check_send_readiness_internal();

  if (readiness.ready === false) {
    throw readiness.error;
  }

  const encrypted = await encrypt_with_ephemeral_key(
    { to: email.to, cc: email.cc, bcc: email.bcc },
    email.subject,
    email.body,
  );

  const current_account = await get_current_account();

  if (!current_account?.user?.email) {
    throw new SendError("No authenticated account found");
  }
  const sender_email = email.sender_email || current_account.user.email;

  const internal_email: QueuedEmailInternal = {
    id: crypto.randomUUID(),
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    body: email.body,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
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

  const external_request: Parameters<typeof send_external_email>[0] = {
    encrypted_recipients: encrypted.encrypted_recipients,
    encrypted_subject: encrypted.encrypted_subject,
    encrypted_body: encrypted.encrypted_body,
    ephemeral_key: encrypted.ephemeral_key,
    nonce: encrypted.nonce,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    sender_email: email.sender_email,
    sender_alias_hash: email.sender_alias_hash,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
    acknowledge_server_readable,
  };

  if (email.thread_id) {
    external_request.thread_token = email.thread_id;
  }

  const result = await send_external_email(external_request);

  if (!result.data?.success) {
    throw create_error(
      "send_failed",
      result.error || "Failed to send external email",
    );
  }
}

class SendQueue {
  private queued_email: QueuedEmailInternal | null = null;
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

    return create_error("send_failed", "An unexpected error occurred");
  }

  private async process_queued_email(id: string): Promise<void> {
    await this.with_send_lock(async () => {
      if (!this.queued_email || this.queued_email.id !== id) {
        return;
      }

      const current_email = this.queued_email;

      this.queued_email = null;

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

    if (this.queued_email) {
      this.cancel(this.queued_email.id);
    }

    const id = crypto.randomUUID();
    const scheduled_time = Date.now() + delay_ms;

    const timeout_id = window.setTimeout(() => {
      this.process_queued_email(id);
    }, delay_ms);

    this.queued_email = {
      id,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      subject: email.subject,
      body: email.body,
      thread_id: email.thread_id,
      scheduled_time,
      timeout_id,
      callbacks: {
        on_complete: email.on_complete,
        on_cancel: email.on_cancel,
        on_error: email.on_error,
      },
    };

    return id;
  }

  cancel(id: string): QueuedEmailInternal | null {
    if (!this.queued_email || this.queued_email.id !== id) {
      return null;
    }

    window.clearTimeout(this.queued_email.timeout_id);
    const cancelled = this.queued_email;

    this.queued_email = null;

    return cancelled;
  }

  async send_now(id: string): Promise<void> {
    if (!this.queued_email || this.queued_email.id !== id) {
      return;
    }

    window.clearTimeout(this.queued_email.timeout_id);
    const current_email = this.queued_email;

    this.queued_email = null;

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
      }
    });
  }

  get_queued(): QueuedEmailInternal | null {
    return this.queued_email;
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
const UNDO_SEND_DEFAULT_SECONDS = 3;

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

export interface ServerQueueEmailParams extends EmailParams {
  thread_id?: string;
  in_reply_to?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    size: number;
  }>;
}

export interface ServerQueueCallbacks {
  on_sent?: () => void;
  on_cancelled?: () => void;
  on_error?: (error: string) => void;
}

export interface ServerQueueResult {
  queue_id: string;
  pending_send: PendingSend;
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
    throw new SendError("No authenticated account found");
  }
  const sender_email = current_account.user.email;

  const internal_email: QueuedEmailInternal = {
    id: crypto.randomUUID(),
    to: email.to,
    cc: email.cc,
    bcc: email.bcc,
    subject: email.subject,
    body: email.body,
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

  const request: QueueEmailRequest = {
    recipient: email.to[0],
    subject: email.subject,
    body: encrypted_body,
    is_encrypted,
    cc: email.cc,
    bcc: email.bcc,
    thread_id: email.thread_id,
    in_reply_to: email.in_reply_to,
    attachments: email.attachments,
    encrypted_envelope: envelope_data.encrypted_envelope,
    envelope_nonce: envelope_data.envelope_nonce,
    folder_token: envelope_data.folder_token,
    encrypted_metadata: envelope_data.encrypted_metadata,
    metadata_nonce: envelope_data.metadata_nonce,
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

    callbacks.on_error?.(error.message || "Failed to queue email");

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
