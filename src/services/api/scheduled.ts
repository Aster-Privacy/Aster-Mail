import type { EncryptedVault } from "@/services/crypto/key_manager";

import { api_client, type ApiResponse, type ApiErrorCode } from "./client";
import { is_internal_email } from "./keys";

import { invalidate_mail_counts } from "@/hooks/use_mail_counts";

export interface ScheduledEmailContent {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
}

export interface ScheduledEmail {
  id: string;
  scheduled_at: string;
  status: ScheduledEmailStatus;
  created_at: string;
  updated_at: string;
}

export interface ScheduledEmailWithContent extends ScheduledEmail {
  content: ScheduledEmailContent;
}

export type ScheduledEmailStatus =
  | "pending"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

interface CreateScheduledApiResponse {
  id: string;
  scheduled_at: string;
  success: boolean;
}

export interface ListScheduledResult {
  emails: ScheduledEmail[];
  total: number;
  has_more: boolean;
  next_cursor?: string;
}

export interface CancelScheduledResult {
  success: boolean;
}

export interface CreateScheduledRequest {
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_recipients: string;
  recipients_nonce: string;
  recipient_count: number;
  scheduled_at: string;
  folder_token?: string;
  thread_token?: string;
  reply_to_id?: string;
  has_attachments?: boolean;
  attachment_count?: number;
  size_bytes?: number;
  is_external?: boolean;
  ephemeral_key?: string;
  base_nonce?: string;
}

export class ScheduledEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledEncryptionError";
  }
}

export class ScheduledDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledDecryptionError";
  }
}

const SCHEDULED_KEY_VERSION = "astermail-scheduled-v1";
const NONCE_LENGTH = 12;

function uint8_array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_uint8_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function secure_clear_array(array: Uint8Array): void {
  crypto.getRandomValues(array);
  array.fill(0);
}

async function derive_scheduled_encryption_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + SCHEDULED_KEY_VERSION,
  );

  let hash_buffer: ArrayBuffer;

  try {
    hash_buffer = await crypto.subtle.digest("SHA-256", key_material);
  } finally {
    secure_clear_array(key_material);
  }

  return crypto.subtle.importKey(
    "raw",
    hash_buffer,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function decrypt_scheduled_content(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<ScheduledEmailContent> {
  const key = await derive_scheduled_encryption_key(vault);
  const ciphertext = base64_to_uint8_array(encrypted);
  const nonce_bytes = base64_to_uint8_array(nonce);

  let plaintext_buffer: ArrayBuffer;

  try {
    plaintext_buffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce_bytes },
      key,
      ciphertext,
    );
  } catch {
    throw new ScheduledDecryptionError(
      "Failed to decrypt scheduled email content",
    );
  }

  const plaintext = new Uint8Array(plaintext_buffer);

  try {
    const decoded = new TextDecoder().decode(plaintext);

    return JSON.parse(decoded) as ScheduledEmailContent;
  } finally {
    secure_clear_array(plaintext);
  }
}

async function decrypt_with_ephemeral_key(
  encrypted: string,
  nonce: string,
  ephemeral_key_b64: string,
): Promise<ScheduledEmailContent> {
  const raw_key = base64_to_uint8_array(ephemeral_key_b64);

  const key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  secure_clear_array(raw_key);

  const ciphertext = base64_to_uint8_array(encrypted);
  const nonce_bytes = base64_to_uint8_array(nonce);

  let plaintext_buffer: ArrayBuffer;

  try {
    plaintext_buffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce_bytes },
      key,
      ciphertext,
    );
  } catch {
    throw new ScheduledDecryptionError(
      "Failed to decrypt scheduled email with ephemeral key",
    );
  }

  const plaintext = new Uint8Array(plaintext_buffer);

  try {
    const decoded = new TextDecoder().decode(plaintext);

    return JSON.parse(decoded) as ScheduledEmailContent;
  } finally {
    secure_clear_array(plaintext);
  }
}

const FIELD_ID_ENVELOPE = 0x01;
const FIELD_ID_RECIPIENTS = 0x02;

function derive_field_nonce(
  base_nonce: Uint8Array,
  field_id: number,
): Uint8Array {
  const derived = new Uint8Array(12);

  derived.set(base_nonce.slice(0, 11));
  derived[11] = base_nonce[11] ^ field_id;

  return derived;
}

async function encrypt_with_ephemeral_key(
  content: ScheduledEmailContent,
): Promise<{
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_recipients: string;
  recipients_nonce: string;
  ephemeral_key: string;
  base_nonce: string;
}> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );

  const base_nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

  const envelope_data = {
    to_recipients: content.to_recipients,
    cc_recipients: content.cc_recipients,
    bcc_recipients: content.bcc_recipients,
    subject: content.subject,
    body: content.body,
    scheduled_at: content.scheduled_at,
  };

  const envelope_plaintext = new TextEncoder().encode(
    JSON.stringify(envelope_data),
  );
  const envelope_nonce = derive_field_nonce(base_nonce, FIELD_ID_ENVELOPE);

  const encrypted_envelope_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: envelope_nonce },
    key,
    envelope_plaintext,
  );

  const recipients = [
    ...content.to_recipients,
    ...content.cc_recipients,
    ...content.bcc_recipients,
  ];
  const recipients_plaintext = new TextEncoder().encode(
    JSON.stringify(recipients),
  );
  const recipients_nonce = derive_field_nonce(base_nonce, FIELD_ID_RECIPIENTS);

  const encrypted_recipients_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: recipients_nonce },
    key,
    recipients_plaintext,
  );

  const raw_key = await crypto.subtle.exportKey("raw", key);

  secure_clear_array(envelope_plaintext);
  secure_clear_array(recipients_plaintext);

  return {
    encrypted_envelope: uint8_array_to_base64(
      new Uint8Array(encrypted_envelope_buffer),
    ),
    envelope_nonce: uint8_array_to_base64(envelope_nonce),
    encrypted_recipients: uint8_array_to_base64(
      new Uint8Array(encrypted_recipients_buffer),
    ),
    recipients_nonce: uint8_array_to_base64(recipients_nonce),
    ephemeral_key: uint8_array_to_base64(new Uint8Array(raw_key)),
    base_nonce: uint8_array_to_base64(base_nonce),
  };
}

function create_error_response<T>(
  error: string | undefined,
  code: ApiErrorCode | undefined,
): ApiResponse<T> {
  return { error, code };
}

interface ScheduledListApiResponse {
  items: Array<{
    id: string;
    recipient_count: number;
    has_attachments: boolean;
    scheduled_at: string;
    status: string;
    created_at: string;
    is_external: boolean;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export async function list_scheduled_emails(
  limit: number = 50,
): Promise<ApiResponse<ListScheduledResult>> {
  const response = await api_client.get<ScheduledListApiResponse>(
    `/scheduled?limit=${limit}`,
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  return {
    data: {
      emails: response.data.items.map((item) => ({
        id: item.id,
        scheduled_at: item.scheduled_at,
        status: item.status as ScheduledEmailStatus,
        created_at: item.created_at,
        updated_at: item.created_at,
      })),
      total: response.data.total,
      has_more:
        response.data.offset + response.data.items.length < response.data.total,
    },
  };
}

interface ScheduledEmailApiFullResponse {
  id: string;
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_recipients: string;
  recipients_nonce: string;
  recipient_count: number;
  scheduled_at: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_external: boolean;
  ephemeral_key: string | null;
  base_nonce: string | null;
}

export async function get_scheduled_email(
  email_id: string,
  vault: EncryptedVault,
): Promise<ApiResponse<ScheduledEmailWithContent | null>> {
  const response = await api_client.get<ScheduledEmailApiFullResponse>(
    `/scheduled/${email_id}`,
  );

  if (response.error || !response.data) {
    return {
      data: null,
      error: response.error,
      code: response.code,
    };
  }

  try {
    let content: ScheduledEmailContent;

    if (response.data.ephemeral_key) {
      content = await decrypt_with_ephemeral_key(
        response.data.encrypted_envelope,
        response.data.envelope_nonce,
        response.data.ephemeral_key,
      );
    } else {
      content = await decrypt_scheduled_content(
        response.data.encrypted_envelope,
        response.data.envelope_nonce,
        vault,
      );
    }

    return {
      data: {
        id: response.data.id,
        scheduled_at: response.data.scheduled_at,
        status: response.data.status as ScheduledEmailStatus,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
        content,
      },
    };
  } catch (error) {
    const message =
      error instanceof ScheduledDecryptionError
        ? error.message
        : "Failed to decrypt scheduled email";

    return { data: null, error: message };
  }
}

export async function cancel_scheduled_email(
  email_id: string,
): Promise<ApiResponse<CancelScheduledResult>> {
  const response = await api_client.patch<{ status: string }>(
    `/scheduled/${email_id}`,
    { cancel: true },
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_counts();

  return { data: { success: true } };
}

export async function reschedule_email(
  email_id: string,
  new_scheduled_at: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const response = await api_client.patch<{ id: string; status: string }>(
    `/scheduled/${email_id}`,
    { scheduled_at: new_scheduled_at },
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_counts();

  return { data: { success: true } };
}

export interface CreateScheduledResponse {
  success: boolean;
  scheduled_email_id: string;
  scheduled_at: string;
}

export async function create_scheduled_email(
  _vault: EncryptedVault,
  content: ScheduledEmailContent,
): Promise<ApiResponse<CreateScheduledResponse>> {
  const all_recipients = [
    ...content.to_recipients,
    ...content.cc_recipients,
    ...content.bcc_recipients,
  ];

  const has_external = all_recipients.some((r) => !is_internal_email(r));
  const recipient_count = all_recipients.length;

  const encrypted = await encrypt_with_ephemeral_key(content);

  const request: CreateScheduledRequest = {
    encrypted_envelope: encrypted.encrypted_envelope,
    envelope_nonce: encrypted.envelope_nonce,
    encrypted_recipients: encrypted.encrypted_recipients,
    recipients_nonce: encrypted.recipients_nonce,
    recipient_count,
    scheduled_at: content.scheduled_at,
    is_external: has_external,
    ephemeral_key: encrypted.ephemeral_key,
    base_nonce: encrypted.base_nonce,
  };

  const response = await api_client.post<CreateScheduledApiResponse>(
    "/scheduled",
    request,
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_counts();

  return {
    data: {
      success: response.data.success,
      scheduled_email_id: response.data.id,
      scheduled_at: response.data.scheduled_at,
    },
  };
}

export async function send_scheduled_now(
  email_id: string,
): Promise<ApiResponse<{ success: boolean }>> {
  const now = new Date().toISOString();

  return reschedule_email(email_id, now);
}
