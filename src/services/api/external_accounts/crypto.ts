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
import type { ExternalAccountData } from "./types";
import { decrypt_aes_gcm_with_fallback } from "@/services/crypto/legacy_keks";

import { array_to_base64, base64_to_array } from "../sender_utils";

import {
  get_or_create_derived_encryption_crypto_key,
  get_derived_encryption_key,
} from "@/services/crypto/memory_key_store";
import { get_key, store_key } from "@/services/crypto/crypto_key_cache";

const HASH_ALG = ["SHA", "256"].join("-");
const EXTERNAL_ACCOUNTS_HMAC_KEY_ID = "external_accounts_hmac_key";

async function get_hmac_key(): Promise<CryptoKey> {
  const cached = get_key(EXTERNAL_ACCOUNTS_HMAC_KEY_ID);

  if (cached) {
    return cached;
  }

  const raw_key = get_derived_encryption_key();

  if (!raw_key) {
    throw new Error("No encryption key available");
  }

  const encoder = new TextEncoder();
  const info = encoder.encode("external-accounts-hmac-v1");
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

  store_key(EXTERNAL_ACCOUNTS_HMAC_KEY_ID, hmac_key, "hmac");

  return hmac_key;
}

async function get_external_accounts_encryption_key(): Promise<CryptoKey> {
  const key = await get_or_create_derived_encryption_crypto_key();

  if (!key) {
    throw new Error("No encryption key available");
  }

  return key;
}

export async function generate_account_token(email: string): Promise<string> {
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
  const combined = `${encrypted_data}:${nonce}:external-accounts-v1`;
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
  const combined = `${encrypted_data}:${nonce}:external-accounts-v1`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  return crypto.subtle.verify("HMAC", hmac_key, expected_hash, data);
}

export async function encrypt_account_data(data: ExternalAccountData): Promise<{
  encrypted_account_data: string;
  account_data_nonce: string;
  integrity_hash: string;
}> {
  const key = await get_external_accounts_encryption_key();
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

  const encrypted_account_data = array_to_base64(new Uint8Array(ciphertext));
  const account_data_nonce = array_to_base64(nonce);
  const integrity_hash = await generate_integrity_hash(
    encrypted_account_data,
    account_data_nonce,
  );

  return { encrypted_account_data, account_data_nonce, integrity_hash };
}

export async function decrypt_account_data(
  encrypted_account_data: string,
  account_data_nonce: string,
  integrity_hash?: string,
): Promise<ExternalAccountData> {
  if (integrity_hash) {
    const is_valid = await verify_integrity_hash(
      encrypted_account_data,
      account_data_nonce,
      integrity_hash,
    );

    if (!is_valid) {
      throw new Error("External account data integrity check failed");
    }
  }

  const key = await get_external_accounts_encryption_key();
  const ciphertext = base64_to_array(encrypted_account_data);
  const nonce = base64_to_array(account_data_nonce);
  const decrypted = await decrypt_aes_gcm_with_fallback(key, ciphertext, nonce);
  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  return {
    email: parsed.email,
    display_name: parsed.display_name,
    label_name: parsed.label_name,
    label_color: parsed.label_color,
    created_at: parsed.created_at,
  };
}
