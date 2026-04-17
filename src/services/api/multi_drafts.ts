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

import { invalidate_mail_counts } from "@/hooks/use_mail_counts";

const HASH_ALG = ["SHA", "256"].join("-");

export type DraftType = "new" | "reply" | "forward";

export interface DraftAttachmentData {
  id: string;
  name: string;
  size: string;
  size_bytes: number;
  mime_type: string;
  data_base64: string;
  content_id?: string;
}

export interface DraftContent {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
  attachments?: DraftAttachmentData[];
}

export interface Draft {
  id: string;
  draft_type: DraftType;
  reply_to_id?: string;
  forward_from_id?: string;
  thread_token?: string;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface DraftWithContent extends Draft {
  content: DraftContent;
}

interface DraftApiResponse {
  id: string;
  draft_type: string;
  encrypted_content: string;
  content_nonce: string;
  reply_to_id?: string;
  forward_from_id?: string;
  thread_token?: string;
  version: number;
  content_hash: string;
  size_bytes: number;
  has_attachments: boolean;
  attachment_count: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

interface ListDraftsApiResponse {
  items: DraftApiResponse[];
  next_cursor?: string;
  has_more: boolean;
}

interface CreateDraftApiResponse {
  id: string;
  version: number;
  success: boolean;
}

interface UpdateDraftApiResponse {
  success: boolean;
  version: number;
  current_version?: number;
}

interface DeleteDraftApiResponse {
  success: boolean;
  deleted_count: number;
}

interface EncryptedDraftPayload {
  encrypted: string;
  nonce: string;
}

interface CreateDraftRequest {
  draft_type: DraftType;
  encrypted_content: string;
  content_nonce: string;
  content_hash: string;
  reply_to_id?: string;
  forward_from_id?: string;
  thread_token?: string;
  size_bytes: number;
  has_attachments: boolean;
  attachment_count: number;
}

interface UpdateDraftRequest {
  encrypted_content: string;
  content_nonce: string;
  content_hash: string;
  version: number;
  size_bytes: number;
  has_attachments: boolean;
  attachment_count: number;
}

export interface ListDraftsResult {
  drafts: Draft[];
  next_cursor?: string;
  has_more: boolean;
}

export interface DeleteDraftResult {
  success: boolean;
}

export class DraftEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftEncryptionError";
  }
}

export class DraftDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftDecryptionError";
  }
}

const DRAFT_KEY_VERSION = "astermail-draft-v2";
const NONCE_LENGTH = 12;
const DRAFT_EXPIRATION_DAYS = 7;

function transform_api_response_to_draft(response: DraftApiResponse): Draft {
  return {
    id: response.id,
    draft_type: response.draft_type as DraftType,
    reply_to_id: response.reply_to_id,
    forward_from_id: response.forward_from_id,
    thread_token: response.thread_token,
    version: response.version,
    created_at: response.created_at,
    updated_at: response.updated_at,
    expires_at: response.expires_at,
  };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function uint8_array_to_base64(array: Uint8Array): string {
  const len = array.length;
  const remainder = len % 3;
  const main_len = len - remainder;
  const parts: string[] = [];

  for (let i = 0; i < main_len; i += 3) {
    const triplet = (array[i] << 16) | (array[i + 1] << 8) | array[i + 2];

    parts.push(
      B64[(triplet >> 18) & 63] +
        B64[(triplet >> 12) & 63] +
        B64[(triplet >> 6) & 63] +
        B64[triplet & 63],
    );
  }

  if (remainder === 1) {
    const b = array[main_len];

    parts.push(B64[b >> 2] + B64[(b & 3) << 4] + "==");
  } else if (remainder === 2) {
    const b0 = array[main_len];
    const b1 = array[main_len + 1];

    parts.push(
      B64[b0 >> 2] +
        B64[((b0 & 3) << 4) | (b1 >> 4)] +
        B64[(b1 & 15) << 2] +
        "=",
    );
  }

  return parts.join("");
}

const B64_LOOKUP = new Uint8Array(128);

for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charCodeAt(i)] = i;

function base64_to_uint8_array(base64: string): Uint8Array {
  let len = base64.length;

  while (len > 0 && base64[len - 1] === "=") len--;

  const out_len = (len * 3) >> 2;
  const bytes = new Uint8Array(out_len);
  let j = 0;

  for (let i = 0; i < len; i += 4) {
    const a = B64_LOOKUP[base64.charCodeAt(i)];
    const b = i + 1 < len ? B64_LOOKUP[base64.charCodeAt(i + 1)] : 0;
    const c = i + 2 < len ? B64_LOOKUP[base64.charCodeAt(i + 2)] : 0;
    const d = i + 3 < len ? B64_LOOKUP[base64.charCodeAt(i + 3)] : 0;
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;

    if (j < out_len) bytes[j++] = (triplet >> 16) & 255;
    if (j < out_len) bytes[j++] = (triplet >> 8) & 255;
    if (j < out_len) bytes[j++] = triplet & 255;
  }

  return bytes;
}

function secure_clear_array(array: Uint8Array): void {
  const max_chunk = 65536;

  for (let i = 0; i < array.length; i += max_chunk) {
    const chunk = array.subarray(i, Math.min(i + max_chunk, array.length));

    crypto.getRandomValues(chunk);
  }
  array.fill(0);
}

async function derive_draft_encryption_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + DRAFT_KEY_VERSION,
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

async function encrypt_content(
  content: DraftContent,
  vault: EncryptedVault,
): Promise<EncryptedDraftPayload> {
  const key = await derive_draft_encryption_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const plaintext = new TextEncoder().encode(JSON.stringify(content));

  let ciphertext: ArrayBuffer;

  try {
    ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      plaintext,
    );
  } catch {
    throw new DraftEncryptionError("Failed to encrypt draft content");
  } finally {
    secure_clear_array(plaintext);
  }

  return {
    encrypted: uint8_array_to_base64(new Uint8Array(ciphertext)),
    nonce: uint8_array_to_base64(nonce),
  };
}

async function decrypt_content(
  encrypted: string,
  nonce: string,
  vault: EncryptedVault,
): Promise<DraftContent> {
  const key = await derive_draft_encryption_key(vault);
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
    throw new DraftDecryptionError("Failed to decrypt draft content");
  }

  const plaintext = new Uint8Array(plaintext_buffer);

  try {
    const decoded = new TextDecoder().decode(plaintext);

    return JSON.parse(decoded) as DraftContent;
  } finally {
    secure_clear_array(plaintext);
  }
}

async function compute_content_hash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hash_buffer = await crypto.subtle.digest(HASH_ALG, data);

  return uint8_array_to_base64(new Uint8Array(hash_buffer));
}

function calculate_draft_expiration(): string {
  const expiration_ms = DRAFT_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;

  return new Date(Date.now() + expiration_ms).toISOString();
}

function build_list_drafts_params(
  limit: number,
  draft_type?: DraftType,
): URLSearchParams {
  const params = new URLSearchParams({ limit: limit.toString() });

  if (draft_type) {
    params.append("draft_type", draft_type);
  }

  return params;
}

function create_error_response<T>(
  error: string | undefined,
  code: ApiErrorCode | undefined,
): ApiResponse<T> {
  return { error, code };
}

export async function list_drafts(
  limit: number = 20,
  draft_type?: DraftType,
): Promise<ApiResponse<ListDraftsResult>> {
  const params = build_list_drafts_params(limit, draft_type);

  const response = await api_client.get<ListDraftsApiResponse>(
    `/mail/v1/drafts?${params.toString()}`,
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  return {
    data: {
      drafts: response.data.items.map(transform_api_response_to_draft),
      next_cursor: response.data.next_cursor,
      has_more: response.data.has_more,
    },
  };
}

export async function get_draft(
  draft_id: string,
  vault: EncryptedVault,
): Promise<ApiResponse<DraftWithContent | null>> {
  const response = await api_client.get<DraftApiResponse>(
    `/mail/v1/drafts/${draft_id}`,
  );

  if (response.error || !response.data) {
    return {
      data: null,
      error: response.error,
      code: response.code,
    };
  }

  try {
    const content = await decrypt_content(
      response.data.encrypted_content,
      response.data.content_nonce,
      vault,
    );

    return {
      data: {
        ...transform_api_response_to_draft(response.data),
        content,
      },
    };
  } catch (error) {
    const message =
      error instanceof DraftDecryptionError
        ? error.message
        : "Failed to decrypt draft";

    return { data: null, error: message };
  }
}

export async function create_draft(
  content: DraftContent,
  vault: EncryptedVault,
  draft_type: DraftType = "new",
  reply_to_id?: string,
  forward_from_id?: string,
  thread_token?: string,
): Promise<ApiResponse<Draft>> {
  let payload: EncryptedDraftPayload;

  try {
    payload = await encrypt_content(content, vault);
  } catch (error) {
    const message =
      error instanceof DraftEncryptionError
        ? error.message
        : "Failed to encrypt draft";

    return { error: message };
  }

  const content_hash = await compute_content_hash(payload.encrypted);

  const att_count = content.attachments?.length ?? 0;

  const request: CreateDraftRequest = {
    draft_type,
    encrypted_content: payload.encrypted,
    content_nonce: payload.nonce,
    content_hash,
    reply_to_id,
    forward_from_id,
    thread_token,
    size_bytes: payload.encrypted.length,
    has_attachments: att_count > 0,
    attachment_count: att_count,
  };

  const response = await api_client.post<CreateDraftApiResponse>(
    "/mail/v1/drafts",
    request,
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_counts();

  const now = new Date().toISOString();

  return {
    data: {
      id: response.data.id,
      draft_type,
      reply_to_id,
      forward_from_id,
      thread_token,
      version: response.data.version,
      created_at: now,
      updated_at: now,
      expires_at: calculate_draft_expiration(),
    },
  };
}

export async function update_draft(
  draft_id: string,
  content: DraftContent,
  version: number,
  vault: EncryptedVault,
  draft_type: DraftType = "new",
  reply_to_id?: string,
  forward_from_id?: string,
  thread_token?: string,
): Promise<ApiResponse<Draft>> {
  let payload: EncryptedDraftPayload;

  try {
    payload = await encrypt_content(content, vault);
  } catch (error) {
    const message =
      error instanceof DraftEncryptionError
        ? error.message
        : "Failed to encrypt draft";

    return { error: message };
  }

  const content_hash = await compute_content_hash(payload.encrypted);

  const update_att_count = content.attachments?.length ?? 0;

  const request: UpdateDraftRequest = {
    encrypted_content: payload.encrypted,
    content_nonce: payload.nonce,
    content_hash,
    version,
    size_bytes: payload.encrypted.length,
    has_attachments: update_att_count > 0,
    attachment_count: update_att_count,
  };

  const response = await api_client.put<UpdateDraftApiResponse>(
    `/mail/v1/drafts/${draft_id}`,
    request,
  );

  if (response.error) {
    return create_error_response(response.error, response.code);
  }

  if (!response.data?.success) {
    const current_version = response.data?.current_version;

    if (current_version !== undefined) {
      return {
        error: "Version conflict",
        code: "CONFLICT",
        data: {
          id: draft_id,
          draft_type,
          reply_to_id,
          forward_from_id,
          thread_token,
          version: current_version,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: calculate_draft_expiration(),
        },
      };
    }

    return { error: "Version conflict", code: "CONFLICT" };
  }

  invalidate_mail_counts();

  const now = new Date().toISOString();

  return {
    data: {
      id: draft_id,
      draft_type,
      reply_to_id,
      forward_from_id,
      thread_token,
      version: response.data.version,
      created_at: now,
      updated_at: now,
      expires_at: calculate_draft_expiration(),
    },
  };
}

export async function delete_draft(
  draft_id: string,
): Promise<ApiResponse<DeleteDraftResult>> {
  const response = await api_client.delete<DeleteDraftApiResponse>(
    `/mail/v1/drafts/${draft_id}`,
  );

  if (response.error || !response.data) {
    return create_error_response(response.error, response.code);
  }

  invalidate_mail_counts();

  return { data: { success: response.data.success } };
}

export async function get_draft_by_thread(
  thread_token: string,
  vault: EncryptedVault,
): Promise<ApiResponse<DraftWithContent | null>> {
  const response = await api_client.get<DraftApiResponse | null>(
    `/mail/v1/drafts/thread/${encodeURIComponent(thread_token)}`,
  );

  if (response.error) {
    return {
      data: null,
      error: response.error,
      code: response.code,
    };
  }

  if (!response.data) {
    return { data: null };
  }

  try {
    const content = await decrypt_content(
      response.data.encrypted_content,
      response.data.content_nonce,
      vault,
    );

    return {
      data: {
        ...transform_api_response_to_draft(response.data),
        content,
      },
    };
  } catch (error) {
    const message =
      error instanceof DraftDecryptionError
        ? error.message
        : "Failed to decrypt draft";

    return { data: null, error: message };
  }
}
