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
import * as openpgp from "openpgp";

import {
  HASH_ALG,
  KEY_DERIVATION_ITERATIONS,
  array_to_base64,
  generate_key_id,
  generate_random_bytes,
  get_unbiased_random_index,
  log_key_usage,
  pin_fingerprint,
  type KeyPair,
  type PgpKeyData,
  verify_entropy_quality,
} from "./key_manager_core";

import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { clamp_password } from "@/services/sanitize";
import { normalize_address_ignoring_dots } from "@/utils/address_dots";

export async function hash_email(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(normalize_address_ignoring_dots(email));
  const hash_buffer = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash_buffer));
}

export async function hash_recovery_email(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(
    "aster-recovery-email-uniqueness-v1:" + email.toLowerCase().trim(),
  );
  const hash_buffer = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash_buffer));
}

export async function derive_password_hash(
  password: string,
  salt: Uint8Array,
): Promise<{ hash: string; salt: string }> {
  const encoder = new TextEncoder();
  const password_data = encoder.encode(clamp_password(password));

  const key_material = await crypto.subtle.importKey(
    "raw",
    password_data,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    256,
  );

  return {
    hash: array_to_base64(new Uint8Array(derived_bits)),
    salt: array_to_base64(salt),
  };
}

export async function generate_identity_keypair(
  name: string,
  email: string,
  passphrase: string,
): Promise<KeyPair> {
  const entropy_test = generate_random_bytes(1024);
  const entropy_check = verify_entropy_quality(entropy_test);

  zero_uint8_array(entropy_test);

  if (!entropy_check.valid) {
    throw new Error(
      "entropy_source_failure: system entropy source is inadequate",
    );
  }

  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name, email }],
    passphrase,
    format: "armored",
  });

  const public_key_obj = await openpgp.readKey({ armoredKey: publicKey });
  const fingerprint = public_key_obj.getFingerprint();

  const key_id = generate_key_id();

  pin_fingerprint(key_id, fingerprint, "identity");
  log_key_usage(key_id, "generate", true, "identity_keypair");

  return {
    public_key: publicKey,
    secret_key: privateKey,
    fingerprint,
  };
}

export async function generate_signed_prekey(
  name: string,
  email: string,
  passphrase: string,
  identity_secret_key: string,
): Promise<{ keypair: KeyPair; signature: string }> {
  const entropy_test = generate_random_bytes(1024);
  const entropy_check = verify_entropy_quality(entropy_test);

  zero_uint8_array(entropy_test);

  if (!entropy_check.valid) {
    throw new Error(
      "entropy_source_failure: system entropy source is inadequate",
    );
  }

  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: `${name} (prekey)`, email }],
    passphrase,
    format: "armored",
  });

  const public_key_obj = await openpgp.readKey({ armoredKey: publicKey });
  const fingerprint = public_key_obj.getFingerprint();

  const key_id = generate_key_id();

  pin_fingerprint(key_id, fingerprint, "signed_prekey");
  log_key_usage(key_id, "generate", true, "signed_prekey");

  const identity_key = await openpgp.decryptKey({
    ["privateKey" as const]: await openpgp.readPrivateKey({
      armoredKey: identity_secret_key,
    }),
    passphrase,
  });

  const message = await openpgp.createMessage({ text: publicKey });
  const signature = await openpgp.sign({
    message,
    signingKeys: identity_key,
    format: "armored",
  });

  log_key_usage(key_id, "sign", true, "prekey_signature");

  return {
    keypair: {
      public_key: publicKey,
      secret_key: privateKey,
      fingerprint,
    },
    signature: typeof signature === "string" ? signature : signature.toString(),
  };
}

export async function reprotect_pgp_key(
  armored_private_key: string,
  old_passphrase: string,
  new_passphrase: string,
): Promise<string> {
  const read_key = await openpgp.readPrivateKey({
    armoredKey: armored_private_key,
  });
  const decrypted_key = await openpgp.decryptKey({
    privateKey: read_key,
    passphrase: old_passphrase,
  });
  const reencrypted = await openpgp.encryptKey({
    privateKey: decrypted_key,
    passphrase: new_passphrase,
  });

  return reencrypted.armor();
}

export function generate_recovery_codes(count: number = 6): string[] {
  const codes: string[] = [];
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let i = 0; i < count; i++) {
    const segments: string[] = [];

    for (let s = 0; s < 4; s++) {
      let segment = "";

      for (let c = 0; c < 4; c++) {
        const random_index = get_unbiased_random_index(chars.length);

        segment += chars[random_index];
      }
      segments.push(segment);
    }
    codes.push(`ASTER-${segments.join("-")}`);
  }

  return codes;
}

export async function prepare_pgp_key_data(
  keypair: KeyPair,
  password: string,
): Promise<PgpKeyData> {
  const public_key_obj = await openpgp.readKey({
    armoredKey: keypair.public_key,
  });
  const fingerprint = public_key_obj.getFingerprint().toUpperCase();
  const key_id = fingerprint.slice(-16);

  const encoder = new TextEncoder();
  const private_key_bytes = encoder.encode(keypair.secret_key);

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

  const encryption_key = await crypto.subtle.deriveKey(
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

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    encryption_key,
    private_key_bytes,
  );

  const combined = new Uint8Array(salt.length + encrypted.byteLength);

  combined.set(salt, 0);
  combined.set(new Uint8Array(encrypted), salt.length);

  return {
    fingerprint,
    key_id,
    public_key_armored: keypair.public_key,
    ["encrypted_private_key"]: array_to_base64(combined),
    ["private_key_nonce"]: array_to_base64(nonce),
    algorithm: "ecc_curve25519",
    key_size: 256,
  };
}

export function string_to_passphrase(password: string): Uint8Array {
  const encoder = new TextEncoder();

  return encoder.encode(password);
}

export function zero_passphrase(passphrase: Uint8Array): void {
  zero_uint8_array(passphrase);
}
