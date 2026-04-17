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
  RecentRecipient,
  DecryptedRecentRecipient,
  RecentRecipientsListResponse,
  SaveRecentRecipientsResponse,
  DeleteAllRecentRecipientsResponse,
} from "@/types/recent_recipients";

import { api_client, type ApiResponse } from "./client";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";

const HASH_ALG = ["SHA", "256"].join("-");

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function get_hmac_key(): Promise<CryptoKey> {
  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("recent-recipients-hmac-v1");
  const combined = new Uint8Array(raw_key.byteLength + info.length);

  combined.set(raw_key, 0);
  combined.set(info, raw_key.byteLength);
  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

async function get_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

async function generate_email_token(email: string): Promise<string> {
  const hmac_key = await get_hmac_key();
  const normalized = email.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function encrypt_email(email: string): Promise<{
  encrypted_email: string;
  email_nonce: string;
}> {
  const key = await get_encryption_key();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(email);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  return {
    encrypted_email: array_to_base64(new Uint8Array(ciphertext)),
    email_nonce: array_to_base64(nonce),
  };
}

async function decrypt_email(
  encrypted_email: string,
  email_nonce: string,
): Promise<string> {
  const key = await get_encryption_key();
  const ciphertext = base64_to_array(encrypted_email);
  const nonce = base64_to_array(email_nonce);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(plaintext);
}

export async function list_recent_recipients(
  limit?: number,
): Promise<ApiResponse<RecentRecipientsListResponse>> {
  const params = new URLSearchParams();

  if (limit) {
    params.set("limit", limit.toString());
  }

  const query = params.toString();
  const url = query
    ? `/contacts/v1/recent_recipients?${query}`
    : "/contacts/v1/recent_recipients";

  return api_client.get<RecentRecipientsListResponse>(url);
}

export async function save_recent_recipients(
  emails: string[],
): Promise<ApiResponse<SaveRecentRecipientsResponse>> {
  const recipients = await Promise.all(
    emails.map(async (email) => {
      const email_token = await generate_email_token(email);
      const { encrypted_email, email_nonce } = await encrypt_email(email);

      return { email_token, encrypted_email, email_nonce };
    }),
  );

  return api_client.post<SaveRecentRecipientsResponse>(
    "/contacts/v1/recent_recipients",
    { recipients },
  );
}

export async function delete_all_recent_recipients(): Promise<
  ApiResponse<DeleteAllRecentRecipientsResponse>
> {
  return api_client.delete<DeleteAllRecentRecipientsResponse>(
    "/contacts/v1/recent_recipients",
  );
}

export async function decrypt_recent_recipients(
  recipients: RecentRecipient[],
): Promise<DecryptedRecentRecipient[]> {
  const results: DecryptedRecentRecipient[] = [];

  for (const recipient of recipients) {
    try {
      const email = await decrypt_email(
        recipient.encrypted_email,
        recipient.email_nonce,
      );

      results.push({
        id: recipient.id,
        email,
        send_count: recipient.send_count,
        last_sent_at: recipient.last_sent_at,
      });
    } catch {
      continue;
    }
  }

  return results;
}
