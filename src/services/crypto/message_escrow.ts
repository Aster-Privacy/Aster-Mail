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
import { api_client } from "@/services/api/client";
import { get_derived_encryption_key } from "./memory_key_store";
import {
  set_cached_ratchet_plaintext,
} from "./ratchet_plaintext_cache";

const HASH_ALG = ["SHA", "256"].join("-");
const API_BASE = "/crypto/v1/ratchet";
const MAX_ESCROW_PLAINTEXT_BYTES = 100 * 1024;

interface EscrowEntry {
  message_id: string;
  encrypted_plaintext: string;
  plaintext_nonce: string;
}

function array_to_base64(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64_to_array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function derive_escrow_key(master_key: Uint8Array): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    master_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode("Aster_Mail_Plaintext_Escrow"),
      info: new TextEncoder().encode("plaintext_escrow_key"),
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function get_escrow_key(): Promise<CryptoKey | null> {
  const master_key = get_derived_encryption_key();

  if (!master_key) return null;

  const key = await derive_escrow_key(master_key);

  master_key.fill(0);

  return key;
}

export async function upload_to_escrow(
  dedupe_key: string,
  plaintext: string,
): Promise<void> {
  if (!dedupe_key || !plaintext) return;

  const plaintext_bytes = new TextEncoder().encode(plaintext);

  if (plaintext_bytes.length > MAX_ESCROW_PLAINTEXT_BYTES) return;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return;

  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    escrow_key,
    plaintext_bytes,
  );

  await api_client.post(`${API_BASE}/plaintext`, {
    message_id: dedupe_key,
    encrypted_plaintext: array_to_base64(new Uint8Array(ciphertext)),
    plaintext_nonce: array_to_base64(nonce),
  });
}

export async function fetch_from_escrow(
  dedupe_key: string,
): Promise<string | null> {
  if (!dedupe_key) return null;

  const escrow_key = await get_escrow_key();

  if (!escrow_key) return null;

  const response = await api_client.get<EscrowEntry>(
    `${API_BASE}/plaintext/${encodeURIComponent(dedupe_key)}`,
  );

  if (response.code === "NOT_FOUND" || response.error || !response.data) {
    return null;
  }

  try {
    const ciphertext = base64_to_array(response.data.encrypted_plaintext);
    const nonce = base64_to_array(response.data.plaintext_nonce);

    const plaintext_bytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      escrow_key,
      ciphertext,
    );

    const plaintext = new TextDecoder().decode(plaintext_bytes);

    await set_cached_ratchet_plaintext(dedupe_key, plaintext);

    return plaintext;
  } catch {
    return null;
  }
}

export async function sync_escrow_to_cache(): Promise<void> {
  const escrow_key = await get_escrow_key();

  if (!escrow_key) return;

  const response = await api_client.get<EscrowEntry[]>(
    `${API_BASE}/plaintexts`,
  );

  if (response.error || !response.data) return;

  for (const entry of response.data) {
    try {
      const ciphertext = base64_to_array(entry.encrypted_plaintext);
      const nonce = base64_to_array(entry.plaintext_nonce);

      const plaintext_bytes = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce },
        escrow_key,
        ciphertext,
      );

      const plaintext = new TextDecoder().decode(plaintext_bytes);

      await set_cached_ratchet_plaintext(entry.message_id, plaintext);
    } catch {
      /* skip entries that fail to decrypt */
    }
  }
}
