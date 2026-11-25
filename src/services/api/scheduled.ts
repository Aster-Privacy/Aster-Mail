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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { api_client, type ApiResponse, type ApiErrorCode } from "./client";
import {
  classify_recipients,
  is_internal_recipient,
} from "../recipient_classification";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import { account_data_write_key } from "@/services/crypto/account_data_writer";
import { encrypt_with_private_bcc } from "@/services/send_private_bcc";
import { plain_text_to_html } from "@/services/send_queue_recipients";
import { describe_sender_refusal } from "@/services/send_refusal";
import { is_internal_email } from "@/services/api/keys";
import { build_subject_bundle } from "@/utils/email_crypto";
import { build_sealed_details } from "@/utils/sealed_message_details";
import { exceeds_sealed_schedule_window } from "@/lib/schedule_window";
import { is_future_instant } from "@/utils/schedule_targets";
import { sanitize_header_value } from "@/services/pgp_protected_mime";
import { strip_outgoing_markers } from "@/lib/outgoing_markers";
import { HASH_ALG } from "@/services/crypto/constants";
import {
  is_usable_identity_key,
  with_identity_key,
} from "@/services/crypto/identity_key_required";
import {
  SCHEDULED_TAG_FIELD,
  compute_scheduled_content_tag,
  verify_scheduled_content_tag,
} from "@/services/crypto/scheduled_content_tag";
import { ensure_untagged_snapshot } from "@/services/crypto/scheduled_untagged_allowlist";
import {
  has_untagged_snapshot,
  untagged_open_allowed,
} from "@/services/crypto/scheduled_untagged_snapshot";
import { invalidate_mail_stats } from "@/hooks/use_mail_stats";
import { get_active_translations } from "@/lib/i18n/translations";

export interface ScheduledEnvelopeSender {
  name: string;
  email: string;
}

export interface ScheduledEmailContent {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  body: string;
  scheduled_at: string;
  from?: ScheduledEnvelopeSender;
  in_reply_to?: string;
  thread_id?: string;
  reply_to_id?: string;
  is_plain_text?: boolean;
  plain_body?: string;
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
  content_verified?: boolean;
}

export interface ScheduledEmailResponse
  extends ApiResponse<ScheduledEmailWithContent | null> {
  unreadable?: boolean;
}

export type ScheduledEmailStatus =
  "pending" | "sending" | "sent" | "cancelled" | "failed";

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
  sender_alias_hash?: string;
  delivery?: ScheduledDelivery;
}

export interface ScheduledDelivery {
  to: string[];
  cc: string[];
  bcc: string[];
  sender_email?: string;
  sender_display_name?: string;
  internal_encrypted_body: string;
  recipient_bodies: Record<string, string>;
  hosted_recipients: string[];
}

export interface ScheduledSendOptions {
  sender_alias_hash?: string;
  sender_email: string;
  sender_display_name?: string;
  allow_non_post_quantum?: boolean;
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
  const max = 65536;

  for (let i = 0; i < array.length; i += max) {
    crypto.getRandomValues(array.subarray(i, Math.min(i + max, array.length)));
  }
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
    hash_buffer = await crypto.subtle.digest(HASH_ALG, key_material);
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

async function scheduled_write_key(vault: EncryptedVault): Promise<CryptoKey> {
  return (
    (await account_data_write_key(SCHEDULED_KEY_VERSION)) ??
    derive_scheduled_encryption_key(with_identity_key(vault))
  );
}

function scheduled_envelope_data(content: ScheduledEmailContent) {
  return {
    to_recipients: content.to_recipients,
    cc_recipients: content.cc_recipients,
    bcc_recipients: content.bcc_recipients,
    subject: content.subject,
    body: content.body,
    scheduled_at: content.scheduled_at,
    ...(content.from ? { from: content.from } : {}),
    ...(content.in_reply_to ? { in_reply_to: content.in_reply_to } : {}),
    ...(content.thread_id ? { thread_id: content.thread_id } : {}),
    ...(content.reply_to_id ? { reply_to_id: content.reply_to_id } : {}),
    ...(content.is_plain_text ? { is_plain_text: true } : {}),
    ...(content.plain_body !== undefined
      ? { plain_body: content.plain_body }
      : {}),
  };
}

async function seal_with_key(
  key: CryptoKey,
  value: unknown,
): Promise<{ ciphertext: string; nonce: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));

  try {
    const sealed = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      plaintext,
    );

    return {
      ciphertext: uint8_array_to_base64(new Uint8Array(sealed)),
      nonce: uint8_array_to_base64(nonce),
    };
  } finally {
    secure_clear_array(plaintext);
  }
}

async function encrypt_with_local_key(
  content: ScheduledEmailContent,
  vault: EncryptedVault,
): Promise<{
  encrypted_envelope: string;
  envelope_nonce: string;
  encrypted_recipients: string;
  recipients_nonce: string;
}> {
  const key = await scheduled_write_key(vault);
  const envelope = await seal_with_key(key, scheduled_envelope_data(content));
  const recipients = await seal_with_key(key, [
    ...content.to_recipients,
    ...content.cc_recipients,
    ...content.bcc_recipients,
  ]);

  return {
    encrypted_envelope: envelope.ciphertext,
    envelope_nonce: envelope.nonce,
    encrypted_recipients: recipients.ciphertext,
    recipients_nonce: recipients.nonce,
  };
}

async function build_sealed_delivery(
  content: ScheduledEmailContent,
  options: ScheduledSendOptions,
): Promise<ScheduledDelivery> {
  const sealed = await encrypt_with_private_bcc(
    build_subject_bundle(
      content.subject || "",
      content.body,
      [],
      build_sealed_details({
        from_name: options.sender_display_name,
        to: content.to_recipients,
        cc: content.cc_recipients,
        sent_at: content.scheduled_at,
      }),
    ),
    {
      to: content.to_recipients,
      cc: content.cc_recipients,
      bcc: content.bcc_recipients,
    },
    options.sender_email,
    options.allow_non_post_quantum === true,
  );
  const internal_encrypted_body = sealed.is_encrypted
    ? sealed.encrypted_body
    : sealed.internal_encrypted_body;

  if (!internal_encrypted_body) {
    throw new ScheduledEncryptionError(
      get_active_translations().errors.failed_encrypt_envelope,
    );
  }

  return {
    to: content.to_recipients,
    cc: content.cc_recipients,
    bcc: content.bcc_recipients,
    sender_email: content.from?.email,
    sender_display_name: options.sender_display_name || undefined,
    internal_encrypted_body,
    recipient_bodies: sealed.recipient_bodies ?? {},
    hosted_recipients: [
      ...content.to_recipients,
      ...content.cc_recipients,
      ...content.bcc_recipients,
    ].filter((r) => is_internal_recipient(r) && !is_internal_email(r)),
  };
}

async function decrypt_scheduled_content(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<ScheduledEmailContent> {
  const key = is_usable_identity_key(vault.identity_key)
    ? await derive_scheduled_encryption_key(vault)
    : null;
  const ciphertext = base64_to_uint8_array(encrypted);
  const nonce_bytes = base64_to_uint8_array(nonce);

  let plaintext_buffer: ArrayBuffer;

  try {
    plaintext_buffer = await decrypt_aes_gcm_with_fallback(
      key,
      ciphertext,
      nonce_bytes,
    );
  } catch {
    throw new ScheduledDecryptionError(
      get_active_translations().errors.load_failed,
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
  vault: EncryptedVault,
): Promise<{
  content: ScheduledEmailContent;
  verified: boolean;
  untagged: boolean;
}> {
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
    plaintext_buffer = await decrypt_aes_gcm_with_fallback(
      key,
      ciphertext,
      nonce_bytes,
    );
  } catch {
    throw new ScheduledDecryptionError(
      get_active_translations().errors.load_failed,
    );
  }

  const plaintext = new Uint8Array(plaintext_buffer);

  try {
    const decoded = new TextDecoder().decode(plaintext);
    const { [SCHEDULED_TAG_FIELD]: tag, ...content } = JSON.parse(
      decoded,
    ) as ScheduledEmailContent & { [SCHEDULED_TAG_FIELD]?: unknown };

    if (tag === undefined) {
      return { content, verified: false, untagged: true };
    }

    const verified = await verify_scheduled_content_tag(
      [vault.identity_key, ...(vault.previous_keys ?? [])],
      content,
      tag,
    );

    if (!verified) {
      throw new ScheduledDecryptionError(
        get_active_translations().errors.load_failed,
      );
    }

    return { content, verified: true, untagged: false };
  } finally {
    secure_clear_array(plaintext);
  }
}

async function encrypt_with_ephemeral_key(
  content: ScheduledEmailContent,
  vault: EncryptedVault,
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

  const envelope_nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const recipients_nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));

  const envelope_data = {
    ...scheduled_envelope_data(content),
    [SCHEDULED_TAG_FIELD]: await compute_scheduled_content_tag(
      with_identity_key(vault).identity_key,
      content,
    ),
  };

  const envelope_plaintext = new TextEncoder().encode(
    JSON.stringify(envelope_data),
  );

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
    base_nonce: uint8_array_to_base64(
      crypto.getRandomValues(new Uint8Array(NONCE_LENGTH)),
    ),
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
  offset: number = 0,
): Promise<ApiResponse<ListScheduledResult>> {
  const response = await api_client.get<ScheduledListApiResponse>(
    `/mail/v1/scheduled?limit=${limit}&offset=${offset}`,
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

const SNAPSHOT_PAGE_SIZE = 100;
const SNAPSHOT_MAX_PAGES = 50;

async function list_all_scheduled_ids(): Promise<string[] | null> {
  const ids: string[] = [];

  for (let page = 0; page < SNAPSHOT_MAX_PAGES; page++) {
    const response = await list_scheduled_emails(
      SNAPSHOT_PAGE_SIZE,
      page * SNAPSHOT_PAGE_SIZE,
    );

    if (response.error || !response.data) return null;

    ids.push(...response.data.emails.map((email) => email.id));

    if (!response.data.has_more) return ids;
  }

  return null;
}

export function snapshot_untagged_scheduled(): Promise<boolean> {
  return ensure_untagged_snapshot({ list_ids: list_all_scheduled_ids }).then(
    (snapshot) => snapshot !== null,
  );
}

async function untagged_scheduled_open_allowed(
  email_id: string,
  updated_at: unknown,
  vault: EncryptedVault,
): Promise<boolean> {
  if (has_untagged_snapshot(vault)) {
    return untagged_open_allowed(vault, email_id, updated_at);
  }

  const snapshot = await ensure_untagged_snapshot({
    list_ids: list_all_scheduled_ids,
  });

  return untagged_open_allowed(
    { scheduled_untagged: snapshot ?? undefined },
    email_id,
    updated_at,
  );
}

export async function get_scheduled_email(
  email_id: string,
  vault: EncryptedVault,
): Promise<ScheduledEmailResponse> {
  const response = await api_client.get<ScheduledEmailApiFullResponse>(
    `/mail/v1/scheduled/${email_id}`,
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
    let content_verified = true;

    if (response.data.ephemeral_key) {
      const opened = await decrypt_with_ephemeral_key(
        response.data.encrypted_envelope,
        response.data.envelope_nonce,
        response.data.ephemeral_key,
        vault,
      );

      if (
        opened.untagged &&
        !(await untagged_scheduled_open_allowed(
          response.data.id,
          response.data.updated_at,
          vault,
        ))
      ) {
        throw new ScheduledDecryptionError(
          get_active_translations().errors.load_failed,
        );
      }

      content = opened.content;
      content_verified = opened.verified;
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
        content: { ...content, scheduled_at: response.data.scheduled_at },
        content_verified,
      },
    };
  } catch (error) {
    const message =
      error instanceof ScheduledDecryptionError
        ? error.message
        : get_active_translations().errors.load_failed;

    return { data: null, error: message, unreadable: true };
  }
}

export async function get_scheduled_email_for_edit(
  email_id: string,
  vault: EncryptedVault,
): Promise<ApiResponse<ScheduledEmailWithContent | null>> {
  const response = await get_scheduled_email(email_id, vault);

  if (response.data && response.data.content_verified === false) {
    return {
      data: null,
      error: get_active_translations().errors.scheduled_unverifiable,
    };
  }

  return response;
}

export async function cancel_scheduled_email(
  email_id: string,
): Promise<ApiResponse<CancelScheduledResult>> {
  const response = await api_client.delete<{ success: boolean }>(
    `/mail/v1/scheduled/${email_id}`,
  );

  if (response.code === "NOT_FOUND") {
    invalidate_mail_stats();

    return create_error_response(
      get_active_translations().errors.scheduled_may_have_sent,
      response.code,
    );
  }

  if (response.error) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_stats();

  return { data: { success: true } };
}

export async function reschedule_email(
  email_id: string,
  new_scheduled_at: string,
): Promise<ApiResponse<{ success: boolean }>> {
  if (!is_future_instant(new Date(new_scheduled_at))) {
    return {
      error: get_active_translations().mail_rules.snooze_needs_future,
    };
  }

  if (exceeds_sealed_schedule_window(new Date(new_scheduled_at))) {
    return {
      error: get_active_translations().common.scheduled_too_far_ahead,
    };
  }

  const response = await api_client.patch<{ id: string; status: string }>(
    `/mail/v1/scheduled/${email_id}`,
    { scheduled_at: new_scheduled_at },
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_stats();

  return { data: { success: true } };
}

export function server_readable_content(
  content: ScheduledEmailContent,
): ScheduledEmailContent {
  if (!content.is_plain_text) return content;

  return {
    ...content,
    body: plain_text_to_html(content.body),
    plain_body: content.body,
  };
}

export interface CreateScheduledResponse {
  success: boolean;
  scheduled_email_id: string;
  scheduled_at: string;
}

export async function create_scheduled_email(
  vault: EncryptedVault,
  input_content: ScheduledEmailContent,
  input_options: ScheduledSendOptions,
): Promise<ApiResponse<CreateScheduledResponse>> {
  const content: ScheduledEmailContent = {
    ...input_content,
    subject: sanitize_header_value(input_content.subject),
    body: strip_outgoing_markers(input_content.body),
    ...(input_content.from
      ? {
          from: {
            ...input_content.from,
            name: sanitize_header_value(input_content.from.name),
          },
        }
      : {}),
  };
  const options: ScheduledSendOptions = {
    ...input_options,
    ...(input_options.sender_display_name
      ? {
          sender_display_name: sanitize_header_value(
            input_options.sender_display_name,
          ),
        }
      : {}),
  };
  const sender_alias_hash = options.sender_alias_hash;
  const all_recipients = [
    ...content.to_recipients,
    ...content.cc_recipients,
    ...content.bcc_recipients,
  ];

  await classify_recipients(all_recipients, { require_resolved: true });

  const has_external = all_recipients.some((r) => !is_internal_recipient(r));
  const has_internal = all_recipients.some((r) => is_internal_recipient(r));
  const recipient_count = all_recipients.length;

  if (exceeds_sealed_schedule_window(new Date(content.scheduled_at))) {
    throw new ScheduledEncryptionError(
      get_active_translations().common.scheduled_too_far_ahead,
    );
  }

  const delivery = has_internal
    ? await build_sealed_delivery(content, options)
    : undefined;

  const encrypted: Awaited<ReturnType<typeof encrypt_with_local_key>> & {
    ephemeral_key?: string;
    base_nonce?: string;
  } = has_external
    ? await encrypt_with_ephemeral_key(server_readable_content(content), vault)
    : await encrypt_with_local_key(content, vault);

  const request: CreateScheduledRequest = {
    encrypted_envelope: encrypted.encrypted_envelope,
    envelope_nonce: encrypted.envelope_nonce,
    encrypted_recipients: encrypted.encrypted_recipients,
    recipients_nonce: encrypted.recipients_nonce,
    recipient_count,
    scheduled_at: content.scheduled_at,
    is_external: has_external,
    ...(encrypted.ephemeral_key
      ? {
          ephemeral_key: encrypted.ephemeral_key,
          base_nonce: encrypted.base_nonce,
        }
      : {}),
    ...(delivery ? { delivery } : {}),
    ...(sender_alias_hash ? { sender_alias_hash } : {}),
  };

  const response = await api_client.post<CreateScheduledApiResponse>(
    "/mail/v1/scheduled",
    request,
  );

  if (response.error || !response.data) {
    return {
      error: describe_sender_refusal(response) ?? response.error,
      code: response.code,
      server_code: response.server_code,
    };
  }

  invalidate_mail_stats();

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
  const response = await api_client.patch<{ id: string; status: string }>(
    `/mail/v1/scheduled/${email_id}`,
    { send_now: true },
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_stats();

  return { data: { success: true } };
}
