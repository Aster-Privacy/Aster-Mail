import type { EncryptedVault } from "@/services/crypto/key_manager";

import { api_client, type ApiResponse, type ApiErrorCode } from "./client";

import { invalidate_mail_counts } from "@/hooks/use_mail_counts";

export type DraftType = "new" | "reply" | "forward";

export interface DraftContent {
  to_recipients: string[];
  cc_recipients: string[];
  bcc_recipients: string[];
  subject: string;
  message: string;
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

async function derive_draft_encryption_key(
  vault: EncryptedVault,
): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(
    vault.identity_key + DRAFT_KEY_VERSION,
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
  const hash_buffer = await crypto.subtle.digest("SHA-256", data);

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

  const request: CreateDraftRequest = {
    draft_type,
    encrypted_content: payload.encrypted,
    content_nonce: payload.nonce,
    content_hash,
    reply_to_id,
    forward_from_id,
    thread_token,
    size_bytes: payload.encrypted.length,
    has_attachments: false,
    attachment_count: 0,
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

  const request: UpdateDraftRequest = {
    encrypted_content: payload.encrypted,
    content_nonce: payload.nonce,
    content_hash,
    version,
    size_bytes: payload.encrypted.length,
    has_attachments: false,
    attachment_count: 0,
  };

  const response = await api_client.put<UpdateDraftApiResponse>(
    `/mail/v1/drafts/${draft_id}`,
    request,
  );

  if (response.error) {
    return create_error_response(response.error, response.code);
  }

  if (!response.data?.success) {
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
