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
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { get_key, store_key } from "@/services/crypto/crypto_key_cache";

const HASH_ALG = ["SHA", "256"].join("-");

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

function base64_to_array(base64: string): Uint8Array {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    throw new Error("Invalid base64 data");
  }
}

function validate_email(email: string): void {
  if (!email || typeof email !== "string") {
    throw new Error("Email is required");
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    throw new Error("Email cannot be empty");
  }

  if (trimmed.length > 320) {
    throw new Error("Email is too long");
  }
}

const PROFILE_NOTES_HMAC_KEY_ID = "profile_notes_hmac_key";

async function get_hmac_key(): Promise<CryptoKey> {
  const cached = get_key(PROFILE_NOTES_HMAC_KEY_ID);

  if (cached) {
    return cached;
  }

  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("profile-notes-hmac-v1");
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

  store_key(PROFILE_NOTES_HMAC_KEY_ID, hmac_key, "hmac");

  return hmac_key;
}

async function get_notes_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export async function generate_email_token(email: string): Promise<string> {
  validate_email(email);

  const hmac_key = await get_hmac_key();
  const normalized = email.toLowerCase().trim();
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function generate_integrity_hash(
  encrypted_data: string,
  nonce: string,
): Promise<string> {
  const hmac_key = await get_hmac_key();
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:profile-notes-v1`;
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
  const combined = `${encrypted_data}:${nonce}:profile-notes-v1`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  return crypto.subtle.verify("HMAC", hmac_key, expected_hash, data);
}

const MAX_NOTE_LENGTH = 50000;

export async function encrypt_note(note: string): Promise<{
  encrypted_note: string;
  note_nonce: string;
  integrity_hash: string;
}> {
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(
      `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters`,
    );
  }

  const key = await get_notes_encryption_key();
  const encoder = new TextEncoder();
  const payload = {
    content: note,
    _encrypted_at: new Date().toISOString(),
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const encrypted_note = array_to_base64(new Uint8Array(ciphertext));
  const note_nonce = array_to_base64(nonce);
  const integrity_hash = await generate_integrity_hash(
    encrypted_note,
    note_nonce,
  );

  return { encrypted_note, note_nonce, integrity_hash };
}

export async function decrypt_note(
  encrypted_note: string,
  note_nonce: string,
  integrity_hash?: string,
): Promise<string> {
  if (integrity_hash) {
    const is_valid = await verify_integrity_hash(
      encrypted_note,
      note_nonce,
      integrity_hash,
    );

    if (!is_valid) {
      throw new Error("Note integrity check failed");
    }
  }

  const key = await get_notes_encryption_key();
  const ciphertext = base64_to_array(encrypted_note);
  const nonce = base64_to_array(note_nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, nonce);
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  return parsed.content || "";
}

export interface ProfileNoteResponse {
  id: string;
  email_token: string;
  encrypted_note: string;
  note_nonce: string;
  integrity_hash: string;
  created_at: string;
  updated_at: string;
}

export interface DecryptedProfileNote {
  id: string;
  email_token: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export async function get_profile_note(
  email: string,
): Promise<ApiResponse<DecryptedProfileNote | null>> {
  try {
    const email_token = await generate_email_token(email);
    const response = await api_client.get<ProfileNoteResponse | null>(
      `/settings/v1/profile_notes?email_token=${encodeURIComponent(email_token)}`,
    );

    if (response.error) {
      return { error: response.error };
    }

    if (!response.data) {
      return { data: null };
    }

    const content = await decrypt_note(
      response.data.encrypted_note,
      response.data.note_nonce,
      response.data.integrity_hash,
    );

    return {
      data: {
        id: response.data.id,
        email_token: response.data.email_token,
        content,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to get profile note",
    };
  }
}

export async function save_profile_note(
  email: string,
  note: string,
): Promise<ApiResponse<DecryptedProfileNote>> {
  try {
    const email_token = await generate_email_token(email);
    const { encrypted_note, note_nonce, integrity_hash } =
      await encrypt_note(note);

    const response = await api_client.put<ProfileNoteResponse>(
      "/settings/v1/profile_notes",
      {
        email_token,
        encrypted_note,
        note_nonce,
        integrity_hash,
      },
    );

    if (response.error || !response.data) {
      return { error: response.error || "Failed to save profile note" };
    }

    return {
      data: {
        id: response.data.id,
        email_token: response.data.email_token,
        content: note,
        created_at: response.data.created_at,
        updated_at: response.data.updated_at,
      },
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to save profile note",
    };
  }
}

export async function delete_profile_note(
  email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const email_token = await generate_email_token(email);
    const response = await api_client.delete<{ success: boolean }>(
      `/settings/v1/profile_notes?email_token=${encodeURIComponent(email_token)}`,
    );

    return response;
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Failed to delete profile note",
    };
  }
}
