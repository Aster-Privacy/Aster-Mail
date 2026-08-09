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
import { HASH_ALG } from "@/services/crypto/constants";
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

const DOMAIN = "astermail-calendar-v1";

export interface EncryptedRecord {
  ciphertext: string;
  nonce: string;
}

async function derive_calendar_key(vault: EncryptedVault): Promise<CryptoKey> {
  const key_material = new TextEncoder().encode(vault.identity_key + DOMAIN);
  const hash = await crypto.subtle.digest(HASH_ALG, key_material);

  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(hash),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt_calendar_payload<T>(
  payload: T,
  vault: EncryptedVault,
): Promise<EncryptedRecord> {
  const key = await derive_calendar_key(vault);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    data,
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

export async function decrypt_calendar_payload<T>(
  record: EncryptedRecord,
  vault: EncryptedVault,
): Promise<T> {
  const key = await derive_calendar_key(vault);
  const ciphertext = Uint8Array.from(atob(record.ciphertext), (c) =>
    c.charCodeAt(0),
  );
  const nonce = Uint8Array.from(atob(record.nonce), (c) => c.charCodeAt(0));

  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, nonce);

  return JSON.parse(new TextDecoder().decode(decrypted)) as T;
}
