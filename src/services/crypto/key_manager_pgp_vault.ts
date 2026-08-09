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
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import * as openpgp from "openpgp";
import { HASH_ALG, KEY_DERIVATION_ITERATIONS, array_to_base64, base64_to_array, compute_hash, create_encrypted_key_handle, encrypt_key_material, generate_key_id, generate_random_bytes, log_key_usage, pin_fingerprint, type EncryptedVault, type SecureVaultHandle, type VaultEncryptionResult } from "./key_manager_core";

const VAULT_SCHEME_VERSION = 1;
const VAULT_AAD_PREFIX = "aster-vault-v";
const VAULT_AAD_WRITE_ENABLED = false;

function build_vault_aad(version: number): Uint8Array {
  const encoder = new TextEncoder();

  return encoder.encode(`${VAULT_AAD_PREFIX}${version}`);
}

export async function encrypt_vault(
  vault: EncryptedVault,
  password: string,
): Promise<VaultEncryptionResult> {
  const encoder = new TextEncoder();
  const vault_json = JSON.stringify(vault);
  const vault_data = encoder.encode(vault_json);

  const nonce = generate_random_bytes(12);
  const salt = generate_random_bytes(16);

  const passphrase_bytes = encoder.encode(password);
  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const algorithm: AesGcmParams = VAULT_AAD_WRITE_ENABLED
    ? {
        name: "AES-GCM",
        iv: nonce,
        additionalData: build_vault_aad(VAULT_SCHEME_VERSION),
      }
    : { name: "AES-GCM", iv: nonce };

  const encrypted = await crypto.subtle.encrypt(algorithm, key, vault_data);

  const combined = new Uint8Array(salt.length + encrypted.byteLength);

  combined.set(salt, 0);
  combined.set(new Uint8Array(encrypted), salt.length);

  return {
    encrypted_vault: array_to_base64(combined),
    vault_nonce: array_to_base64(nonce),
  };
}

export async function decrypt_vault_to_handles(
  encrypted_vault: string,
  vault_nonce: string,
  passphrase: Uint8Array,
): Promise<SecureVaultHandle> {
  const combined = base64_to_array(encrypted_vault);
  const nonce = base64_to_array(vault_nonce);

  const salt = combined.slice(0, 16);
  const ciphertext = combined.slice(16);

  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  let decrypted: ArrayBuffer;

  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: build_vault_aad(VAULT_SCHEME_VERSION),
      },
      key,
      ciphertext,
    );
  } catch {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ciphertext,
    );
  }

  const decoder = new TextDecoder();
  const vault_json = decoder.decode(decrypted);
  const vault: EncryptedVault = normalize_vault_fields(JSON.parse(vault_json));

  const encoder = new TextEncoder();

  const identity_key_bytes = encoder.encode(vault.identity_key);
  const identity_encrypted = await encrypt_key_material(
    identity_key_bytes,
    passphrase,
  );
  const identity_combined = new Uint8Array(
    identity_encrypted.salt.length +
      identity_encrypted.nonce.length +
      identity_encrypted.encrypted.length,
  );

  identity_combined.set(identity_encrypted.salt, 0);
  identity_combined.set(identity_encrypted.nonce, 32);
  identity_combined.set(identity_encrypted.encrypted, 44);

  const identity_secret_key = await openpgp.readPrivateKey({
    armoredKey: vault.identity_key,
  });
  const identity_fingerprint = identity_secret_key.getFingerprint();

  const signed_prekey_bytes = encoder.encode(vault.signed_prekey_private);
  const prekey_encrypted = await encrypt_key_material(
    signed_prekey_bytes,
    passphrase,
  );
  const prekey_combined = new Uint8Array(
    prekey_encrypted.salt.length +
      prekey_encrypted.nonce.length +
      prekey_encrypted.encrypted.length,
  );

  prekey_combined.set(prekey_encrypted.salt, 0);
  prekey_combined.set(prekey_encrypted.nonce, 32);
  prekey_combined.set(prekey_encrypted.encrypted, 44);

  const prekey_public = await openpgp.readKey({
    armoredKey: vault.signed_prekey,
  });
  const prekey_fingerprint = prekey_public.getFingerprint();

  const identity_handle = create_encrypted_key_handle(
    identity_combined,
    identity_fingerprint,
    "identity",
  );

  const prekey_handle = create_encrypted_key_handle(
    prekey_combined,
    prekey_fingerprint,
    "signed_prekey",
  );

  pin_fingerprint(identity_handle.key_id, identity_fingerprint, "identity");
  pin_fingerprint(prekey_handle.key_id, prekey_fingerprint, "signed_prekey");

  const recovery_codes_string = vault.recovery_codes.join(",");
  const recovery_codes_bytes = encoder.encode(recovery_codes_string);
  const recovery_codes_hash = await compute_hash(recovery_codes_bytes);

  zero_uint8_array(identity_key_bytes);
  zero_uint8_array(signed_prekey_bytes);
  zero_uint8_array(new Uint8Array(decrypted));

  log_key_usage(identity_handle.key_id, "load", true, "vault_decrypt");
  log_key_usage(prekey_handle.key_id, "load", true, "vault_decrypt");

  return {
    identity_handle,
    signed_prekey_handle: prekey_handle,
    signed_prekey_public: vault.signed_prekey,
    recovery_codes_hash,
    vault_id: generate_key_id(),
    created_at: Date.now(),
  };
}

export async function decrypt_vault(
  encrypted_vault: string,
  vault_nonce: string,
  password: string,
): Promise<EncryptedVault> {
  const encoder = new TextEncoder();
  const combined = base64_to_array(encrypted_vault);
  const nonce = base64_to_array(vault_nonce);

  const salt = combined.slice(0, 16);
  const ciphertext = combined.slice(16);

  const key_material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  let decrypted: ArrayBuffer;

  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: build_vault_aad(VAULT_SCHEME_VERSION),
      },
      key,
      ciphertext,
    );
  } catch {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ciphertext,
    );
  }

  const decoder = new TextDecoder();
  const vault_json = decoder.decode(decrypted);

  return normalize_vault_fields(JSON.parse(vault_json));
}

const MOBILE_PGP_PRIVATE_KEY_HEADER = "-----BEGIN PGP PRIVATE KEY";

export function normalize_vault_fields(vault: EncryptedVault): EncryptedVault {
  const raw = vault as EncryptedVault & { pgp_private_key?: string };

  if (
    !raw.identity_key &&
    typeof raw.pgp_private_key === "string" &&
    raw.pgp_private_key.startsWith(MOBILE_PGP_PRIVATE_KEY_HEADER)
  ) {
    raw.identity_key = raw.pgp_private_key;
  }

  return raw;
}
