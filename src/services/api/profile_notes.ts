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

import { user_facing_error } from "@/utils/user_facing_error";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";
import {
  get_storage_write_crypto_key,
  get_storage_write_hmac_key,
  sign_with_storage_lookup_keys,
  verify_with_storage_lookup_keys,
} from "@/services/crypto/storage_write_key";
import { get_active_translations } from "@/lib/i18n/translations";

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
    throw new Error(get_active_translations().errors.unexpected_error);
  }
}

function validate_email(email: string): void {
  if (!email || typeof email !== "string") {
    throw new Error(get_active_translations().settings.email_required);
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    throw new Error(get_active_translations().settings.email_required);
  }

  if (trimmed.length > 320) {
    throw new Error(get_active_translations().settings.valid_email_required);
  }
}

const PROFILE_NOTES_HMAC_INFO = "profile-notes-hmac-v1";

async function get_hmac_key(): Promise<CryptoKey> {
  const hmac_key = await get_storage_write_hmac_key(PROFILE_NOTES_HMAC_INFO);

  if (!hmac_key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return hmac_key;
}

async function get_notes_encryption_key(): Promise<CryptoKey> {
  const key = await get_storage_write_crypto_key();

  if (!key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return key;
}

export async function generate_email_token(email: string): Promise<string> {
  validate_email(email);

  const hmac_key = await get_hmac_key();
  const data = new TextEncoder().encode(email.toLowerCase().trim());
  const hash = await crypto.subtle.sign("HMAC", hmac_key, data);

  return array_to_base64(new Uint8Array(hash));
}

async function generate_email_lookup_tokens(email: string): Promise<string[]> {
  validate_email(email);

  const tokens = await sign_with_storage_lookup_keys(
    PROFILE_NOTES_HMAC_INFO,
    new TextEncoder().encode(email.toLowerCase().trim()),
  );

  if (tokens.length === 0) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return tokens;
}

async function delete_note_by_token(
  email_token: string,
): Promise<ApiResponse<{ success: boolean }>> {
  return api_client.delete<{ success: boolean }>(
    `/settings/v1/profile_notes?email_token=${encodeURIComponent(email_token)}`,
  );
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
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:profile-notes-v1`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  return verify_with_storage_lookup_keys(
    PROFILE_NOTES_HMAC_INFO,
    expected_hash,
    data,
  );
}

const MAX_NOTE_LENGTH = 50000;
const MAX_ENCRYPTED_NOTE_LENGTH = 65536;
const GCM_TAG_BYTES = 16;

function build_note_payload(note: string): string {
  return JSON.stringify({
    content: note,
    _encrypted_at: new Date().toISOString(),
  });
}

export function note_exceeds_limit(note: string): boolean {
  if (note.length > MAX_NOTE_LENGTH) return true;

  const plaintext_bytes = new TextEncoder().encode(
    build_note_payload(note),
  ).length;
  const encoded_length = 4 * Math.ceil((plaintext_bytes + GCM_TAG_BYTES) / 3);

  return encoded_length > MAX_ENCRYPTED_NOTE_LENGTH;
}

export async function encrypt_note(note: string): Promise<{
  encrypted_note: string;
  note_nonce: string;
  integrity_hash: string;
}> {
  if (note_exceeds_limit(note)) {
    throw new Error(get_active_translations().errors.note_too_large);
  }

  const key = await get_notes_encryption_key();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(build_note_payload(note));
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
  const key = await get_notes_encryption_key();
  const ciphertext = base64_to_array(encrypted_note);
  const nonce = base64_to_array(note_nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, nonce);
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  if (integrity_hash) {
    const is_valid = await verify_integrity_hash(
      encrypted_note,
      note_nonce,
      integrity_hash,
    );

    if (!is_valid && import.meta.env.DEV) {
      console.warn("profile note integrity hash mismatch (advisory)");
    }
  }

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
    const email_tokens = await generate_email_lookup_tokens(email);
    let response: ApiResponse<ProfileNoteResponse | null> = { data: null };

    for (const email_token of email_tokens) {
      response = await api_client.get<ProfileNoteResponse | null>(
        `/settings/v1/profile_notes?email_token=${encodeURIComponent(email_token)}`,
      );

      if (response.error) {
        return { error: response.error };
      }

      if (response.data) {
        break;
      }
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
      error: user_facing_error(
        err,
        get_active_translations().errors.load_failed,
      ),
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
      return {
        error: response.error || get_active_translations().common.save_failed,
      };
    }

    const lookup_tokens = await generate_email_lookup_tokens(email);

    for (const stale_token of lookup_tokens) {
      if (stale_token === email_token) continue;
      await delete_note_by_token(stale_token);
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
      error: user_facing_error(
        err,
        get_active_translations().common.save_failed,
      ),
    };
  }
}

export async function delete_profile_note(
  email: string,
): Promise<ApiResponse<{ success: boolean }>> {
  try {
    const email_tokens = await generate_email_lookup_tokens(email);
    let response: ApiResponse<{ success: boolean }> | null = null;

    for (const email_token of email_tokens) {
      const attempt = await delete_note_by_token(email_token);

      if (!response || (response.error && !attempt.error)) {
        response = attempt;
      }
    }

    return response ?? { data: { success: false } };
  } catch (err) {
    return {
      error: user_facing_error(err, get_active_translations().errors.generic),
    };
  }
}
