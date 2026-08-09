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
import { array_to_base64, base64_to_array } from "./base64";

export interface ReEncryptedAlias {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
  alias_address_hash: string;
  encrypted_note?: string;
  note_nonce?: string;
  encrypted_websites?: string;
  websites_nonce?: string;
}

export interface ReEncryptedContact {
  id: string;
  encrypted_data: string;
  data_nonce: string;
  contact_token: string;
}

export interface ReEncryptedPin {
  id: string;
  encrypted_sender: string;
  sender_nonce: string;
}

export interface ReEncryptedAliasContact {
  id: string;
  encrypted_contact: string;
  contact_nonce: string;
}

export interface ReEncryptedDestination {
  id: string;
  encrypted_destination: string;
  destination_nonce: string;
}

export interface ReEncryptedDirectory {
  id: string;
  encrypted_label: string;
  label_nonce: string;
}

export interface ReEncryptedDomainAddress {
  id: string;
  encrypted_local_part: string;
  local_part_nonce: string;
  local_part_hash: string;
  encrypted_display_name?: string;
  display_name_nonce?: string;
}

export async function decrypt_with_candidates(
  candidates: CryptoKey[],
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer> {
  let last_error: unknown = new Error("no_candidate_key");

  for (const candidate of candidates) {
    try {
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        candidate,
        ciphertext,
      );
    } catch (error) {
      last_error = error;
    }
  }

  throw last_error instanceof Error
    ? last_error
    : new Error(String(last_error));
}

export async function re_encrypt_field_with_candidates(
  encrypted_b64: string,
  nonce_b64: string,
  old_keys: CryptoKey[],
  new_key: CryptoKey,
): Promise<{ encrypted: string; nonce: string }> {
  const ciphertext = base64_to_array(encrypted_b64);
  const nonce = base64_to_array(nonce_b64);
  const decrypted = await decrypt_with_candidates(old_keys, ciphertext, nonce);
  const new_nonce = crypto.getRandomValues(new Uint8Array(12));
  const new_ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new_nonce },
    new_key,
    decrypted,
  );

  return {
    encrypted: array_to_base64(new Uint8Array(new_ciphertext)),
    nonce: array_to_base64(new_nonce),
  };
}
