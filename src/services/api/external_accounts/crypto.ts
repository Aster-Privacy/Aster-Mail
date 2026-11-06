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
import type { TranslationKey } from "@/lib/i18n/types";

export class ExternalAccountPasswordError extends Error {
  i18n_key: TranslationKey = "errors.wrong_external_account_password";
  constructor() {
    super("wrong_external_account_password");
  }
}

import { array_to_base64, base64_to_array } from "../sender_utils";

import {
  decrypt_with_ios_storage_keys,
  get_legacy_ios_hmac_keys,
} from "@/services/crypto/legacy_ios_envelope";
import {
  get_storage_write_crypto_key,
  get_storage_write_hmac_key,
  verify_with_storage_lookup_keys,
} from "@/services/crypto/storage_write_key";
import { get_active_translations } from "@/lib/i18n/translations";

const EXTERNAL_ACCOUNTS_HMAC_INFO = "external-accounts-hmac-v1";
const COMBINED_NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

async function get_hmac_key(): Promise<CryptoKey> {
  const hmac_key = await get_storage_write_hmac_key(
    EXTERNAL_ACCOUNTS_HMAC_INFO,
  );

  if (!hmac_key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
  }

  return hmac_key;
}

async function get_external_accounts_encryption_key(): Promise<CryptoKey> {
  const key = await get_storage_write_crypto_key();

  if (!key) {
    throw new Error(
      get_active_translations().errors.encryption_keys_unavailable,
    );
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
  const encoder = new TextEncoder();
  const combined = `${encrypted_data}:${nonce}:external-accounts-v1`;
  const data = encoder.encode(combined);
  const expected_hash = base64_to_array(hash);

  if (
    await verify_with_storage_lookup_keys(
      EXTERNAL_ACCOUNTS_HMAC_INFO,
      expected_hash,
      data,
    )
  ) {
    return true;
  }

  for (const key of await get_legacy_ios_hmac_keys(
    EXTERNAL_ACCOUNTS_HMAC_INFO,
  )) {
    if (await crypto.subtle.verify("HMAC", key, expected_hash, data)) {
      return true;
    }
  }

  return false;
}

function bytes_equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  return true;
}

async function open_account_data(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  const separate = await decrypt_with_ios_storage_keys(ciphertext, nonce);

  if (separate) return separate;

  if (ciphertext.length < COMBINED_NONCE_LENGTH + GCM_TAG_LENGTH) return null;

  const embedded_nonce = ciphertext.slice(0, COMBINED_NONCE_LENGTH);

  if (nonce.length > 0 && !bytes_equal(embedded_nonce, nonce)) return null;

  return decrypt_with_ios_storage_keys(
    ciphertext.slice(COMBINED_NONCE_LENGTH),
    embedded_nonce,
  );
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
      throw new Error(get_active_translations().errors.data_integrity_failed);
    }
  }

  await get_external_accounts_encryption_key();

  const ciphertext = base64_to_array(encrypted_account_data);
  const nonce = base64_to_array(account_data_nonce);
  const buffer = await open_account_data(ciphertext, nonce);

  if (!buffer) {
    throw new ExternalAccountPasswordError();
  }

  const decrypted = new Uint8Array(buffer);

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
