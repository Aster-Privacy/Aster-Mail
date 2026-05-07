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
import { api_client, type ApiResponse } from "./client";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  array_to_base64,
  base64_to_array,
  normalize_email,
} from "./sender_utils";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { get_key, store_key } from "@/services/crypto/crypto_key_cache";

const HASH_ALG = ["SHA", "256"].join("-");
const BLOCKED_SENDERS_HMAC_KEY_ID = "blocked_senders_hmac_key";

async function get_hmac_key(): Promise<CryptoKey> {
  const cached = get_key(BLOCKED_SENDERS_HMAC_KEY_ID);

  if (cached) {
    return cached;
  }

  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("blocked-senders-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  const hmac_key = await crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign", "verify"],
  );

  store_key(BLOCKED_SENDERS_HMAC_KEY_ID, hmac_key, "hmac");

  return hmac_key;
}

async function get_blocked_senders_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export async function generate_sender_token(
  email: string,
  is_domain: boolean = false,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const normalized = is_domain ? email.toLowerCase().trim() : normalize_email(email);
  const prefix = is_domain ? "domain:" : "";
  const encoder = new TextEncoder();
  const data = encoder.encode(prefix + normalized);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function generate_integrity_hash(
  encrypted_data: string,
  nonce: string,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:blocked-senders-v1`;
  const data = encoder.encode(combined);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function verify_integrity_hash(
  encrypted_data: string,
  nonce: string,
  hash: string,
): Promise<boolean> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:blocked-senders-v1`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  return crypto.subtle.verify("HMAC", hmac_key, expected_hash, data);
}

export interface BlockedSenderData {
  email: string;
  name?: string;
  blocked_at: string;
  is_domain?: boolean;
}

export async function encrypt_block_data(data: BlockedSenderData): Promise<{
  encrypted_sender_data: string;
  sender_data_nonce: string;
  integrity_hash: string;
}> {
  const key = await get_blocked_senders_encryption_key();
  const encoder = new TextEncoder();
  const payload = {
    ...data,
    _encrypted_at: new Date().toISOString(),
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const encrypted_sender_data = array_to_base64(new Uint8Array(ciphertext));
  const sender_data_nonce = array_to_base64(nonce);
  const integrity_hash = await generate_integrity_hash(
    encrypted_sender_data,
    sender_data_nonce,
  );

  return { encrypted_sender_data, sender_data_nonce, integrity_hash };
}

export async function decrypt_block_data(
  encrypted_sender_data: string,
  sender_data_nonce: string,
  integrity_hash?: string,
): Promise<BlockedSenderData> {
  if (integrity_hash) {
    const is_valid = await verify_integrity_hash(
      encrypted_sender_data,
      sender_data_nonce,
      integrity_hash,
    );

    if (!is_valid) {
      throw new Error("Blocked sender data integrity check failed");
    }
  }

  const key = await get_blocked_senders_encryption_key();
  const ciphertext = base64_to_array(encrypted_sender_data);
  const nonce = base64_to_array(sender_data_nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, nonce);
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  return {
    email: parsed.email,
    name: parsed.name,
    blocked_at: parsed.blocked_at,
    is_domain: parsed.is_domain ?? false,
  };
}

export interface BlockedSenderResponse {
  id: string;
  sender_token: string;
  encrypted_sender_data: string;
  sender_data_nonce: string;
  integrity_hash: string;
  is_domain: boolean;
  action: string;
  created_at: string;
}

export interface DecryptedBlockedSender {
  id: string;
  sender_token: string;
  email: string;
  name?: string;
  blocked_at: string;
  is_domain: boolean;
  action: string;
  created_at: string;
}

export async function list_blocked_senders(): Promise<
  ApiResponse<DecryptedBlockedSender[]>
> {
  try {
    const response = await api_client.get<{
      blocked_senders: BlockedSenderResponse[];
      total: number;
    }>("/contacts/v1/blocked_senders");

    if (response.error) {
      return { error: response.error };
    }

    if (!response.data) {
      return { data: [] };
    }

    const results = await Promise.allSettled(
      response.data.blocked_senders.map(async (item) => {
        const data = await decrypt_block_data(
          item.encrypted_sender_data,
          item.sender_data_nonce,
          item.integrity_hash,
        );

        return {
          id: item.id,
          sender_token: item.sender_token,
          email: data.email,
          name: data.name,
          blocked_at: data.blocked_at,
          is_domain: item.is_domain,
          action: item.action,
          created_at: item.created_at,
        };
      }),
    );

    const decrypted: DecryptedBlockedSender[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        decrypted.push(result.value);
      }
    }

    return { data: decrypted };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to list blocked senders",
    };
  }
}

export async function block_sender(
  email: string,
  name?: string,
  action: "spam" | "delete" = "spam",
  is_domain: boolean = false,
): Promise<ApiResponse<DecryptedBlockedSender>> {
  try {
    const sender_token = await generate_sender_token(email, is_domain);
    const normalized = is_domain ? email.toLowerCase().trim() : normalize_email(email);
    const hash_buffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(normalized),
    );
    const sender_hash = Array.from(new Uint8Array(hash_buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const block_data: BlockedSenderData = {
      email: normalized,
      name,
      blocked_at: new Date().toISOString(),
      is_domain,
    };
    const { encrypted_sender_data, sender_data_nonce, integrity_hash } =
      await encrypt_block_data(block_data);

    const response = await api_client.post<BlockedSenderResponse>(
      "/contacts/v1/blocked_senders",
      {
        sender_token,
        sender_hash,
        encrypted_sender_data,
        sender_data_nonce,
        integrity_hash,
        is_domain,
        action,
      },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to block sender" };
    }

    return {
      data: {
        id: response.data.id,
        sender_token: response.data.sender_token,
        email: block_data.email,
        name: block_data.name,
        blocked_at: block_data.blocked_at,
        is_domain: response.data.is_domain,
        action: response.data.action,
        created_at: response.data.created_at,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to block sender",
    };
  }
}

export async function unblock_sender(
  email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const sender_token = await generate_sender_token(email);
    const response = await api_client.delete<{ success: boolean }>(
      `/contacts/v1/blocked_senders?sender_token=${encodeURIComponent(sender_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to unblock sender",
    };
  }
}

export async function unblock_sender_by_token(
  sender_token: string,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const response = await api_client.delete<{ success: boolean }>(
      `/contacts/v1/blocked_senders?sender_token=${encodeURIComponent(sender_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to unblock sender",
    };
  }
}

export async function bulk_unblock_senders(
  emails: string[],
): Promise<ApiResponse<{ success: boolean; unblocked_count: number }>> {
  try {
    const sender_tokens = await Promise.all(
      emails.map((email) => generate_sender_token(email)),
    );

    const response = await api_client.delete<{
      success: boolean;
      unblocked_count: number;
    }>("/contacts/v1/blocked_senders/bulk", {
      body: JSON.stringify({ sender_tokens }),
    });

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to bulk unblock senders",
    };
  }
}

export async function bulk_unblock_senders_by_tokens(
  sender_tokens: string[],
): Promise<ApiResponse<{ success: boolean; unblocked_count: number }>> {
  try {
    const response = await api_client.delete<{
      success: boolean;
      unblocked_count: number;
    }>("/contacts/v1/blocked_senders/bulk", {
      body: JSON.stringify({ sender_tokens }),
    });

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to bulk unblock senders",
    };
  }
}

export async function check_blocked_senders(
  emails: string[],
): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }

  try {
    const token_to_email = new Map<string, string>();

    await Promise.all(
      emails.map(async (email) => {
        const token = await generate_sender_token(email);

        token_to_email.set(token, normalize_email(email));
      }),
    );

    const tokens = Array.from(token_to_email.keys());
    const response = await api_client.get<{ blocked_tokens: string[] }>(
      `/contacts/v1/blocked_senders/check?tokens=${encodeURIComponent(tokens.join(","))}`,
    );

    if (response.error || !response.data) {
      return new Set();
    }

    const blocked_emails = new Set<string>();

    for (const token of response.data.blocked_tokens) {
      const email = token_to_email.get(token);

      if (email) {
        blocked_emails.add(email);
      }
    }

    return blocked_emails;
  } catch {
    return new Set();
  }
}

export async function is_sender_blocked(email: string): Promise<boolean> {
  const blocked = await check_blocked_senders([email]);

  return blocked.has(normalize_email(email));
}
