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
import {
  store_ke_crypto_key,
  get_ke_crypto_key,
  has_ke_crypto_key,
  store_aes_crypto_key,
  get_aes_crypto_key,
  has_aes_crypto_key,
} from "./memory_key_store";
import {
  HASH_ALG,
  secure_zero_memory,
  generate_random_bytes,
} from "./key_manager_core";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");
const _KE_AES_INFO = "Aster Mail_" + _KE + "_AES_v1";

export async function generate_ke_keypair(): Promise<{
  public_key: CryptoKey;
  secret_key: CryptoKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    false,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );

  return {
    public_key: keypair.publicKey,
    secret_key: keypair.privateKey,
    public_key_raw: new Uint8Array(public_key_raw),
  };
}

export async function import_ke_public_key(
  raw_key: Uint8Array,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_ke_crypto_key(cache_id)) {
    const cached = get_ke_crypto_key(cache_id);

    if (cached) return cached;
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: _KE, namedCurve: _KC },
    false,
    [],
  );

  if (cache_id) {
    store_ke_crypto_key(cache_id, crypto_key);
  }

  return crypto_key;
}

export async function import_ke_private_key(
  jwk: JsonWebKey,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_ke_crypto_key(cache_id)) {
    const cached = get_ke_crypto_key(cache_id);

    if (cached) return cached;
  }

  const crypto_key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: _KE, namedCurve: _KC },
    false,
    ["deriveBits"],
  );

  if (cache_id) {
    store_ke_crypto_key(cache_id, crypto_key);
  }

  return crypto_key;
}

export async function compute_agreement_as_key(
  secret_key: CryptoKey,
  public_key: CryptoKey,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_aes_crypto_key(cache_id)) {
    const cached = get_aes_crypto_key(cache_id);

    if (cached) return cached;
  }

  const shared_bits = await crypto.subtle.deriveBits(
    { name: _KE, public: public_key },
    secret_key,
    256,
  );

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    shared_bits,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const info = new TextEncoder().encode(_KE_AES_INFO);
  const info_hash = await crypto.subtle.digest(HASH_ALG, info);
  const derived_salt = new Uint8Array(info_hash);

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: derived_salt,
      info,
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  secure_zero_memory(new Uint8Array(shared_bits));

  if (cache_id) {
    store_aes_crypto_key(cache_id, aes_key);
  }

  return aes_key;
}

export async function compute_agreement_bits(
  secret_key: CryptoKey,
  public_key: CryptoKey,
): Promise<Uint8Array> {
  const shared_bits = await crypto.subtle.deriveBits(
    { name: _KE, public: public_key },
    secret_key,
    256,
  );

  return new Uint8Array(shared_bits);
}

export async function derive_aes_key_from_bytes(
  key_material: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_aes_crypto_key(cache_id)) {
    const cached = get_aes_crypto_key(cache_id);

    if (cached) return cached;
  }

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    key_material,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt,
      info,
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  if (cache_id) {
    store_aes_crypto_key(cache_id, aes_key);
  }

  return aes_key;
}

export async function encrypt_with_crypto_key(
  plaintext: Uint8Array,
  aes_key: CryptoKey,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = generate_random_bytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    plaintext,
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce,
  };
}

export async function decrypt_with_crypto_key(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  aes_key: CryptoKey,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    ciphertext,
  );

  return new Uint8Array(plaintext);
}

export async function derive_chain_key_as_crypto_key(
  chain_key: CryptoKey,
  info: Uint8Array,
  cache_id?: string,
): Promise<{ new_chain_key: CryptoKey; message_key: CryptoKey }> {
  const salt_hash = await crypto.subtle.digest(HASH_ALG, info);
  const derived_salt = new Uint8Array(salt_hash);

  const chain_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt: derived_salt,
      info,
    },
    chain_key,
    512,
  );

  const chain_bytes = new Uint8Array(chain_bits);
  const new_chain_bytes = chain_bytes.slice(0, 32);
  const message_bytes = chain_bytes.slice(32, 64);

  const new_chain_key = await crypto.subtle.importKey(
    "raw",
    new_chain_bytes,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"],
  );

  const message_key = await crypto.subtle.importKey(
    "raw",
    message_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  secure_zero_memory(chain_bytes);
  secure_zero_memory(new_chain_bytes);
  secure_zero_memory(message_bytes);

  if (cache_id) {
    store_aes_crypto_key(`${cache_id}:chain`, new_chain_key);
    store_aes_crypto_key(`${cache_id}:message`, message_key);
  }

  return { new_chain_key, message_key };
}

export async function import_hkdf_key(
  key_material: Uint8Array,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", key_material, "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ]);
}

export async function import_aes_key(
  key_material: Uint8Array,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_aes_crypto_key(cache_id)) {
    const cached = get_aes_crypto_key(cache_id);

    if (cached) return cached;
  }

  const aes_key = await crypto.subtle.importKey(
    "raw",
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  if (cache_id) {
    store_aes_crypto_key(cache_id, aes_key);
  }

  return aes_key;
}
