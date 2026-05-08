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
  secure_zero_memory,
  array_to_base64,
  base64_to_array,
  generate_random_bytes,
  generate_key_id,
  compute_hash,
  verify_entropy_quality,
  log_key_usage,
  detect_anomalous_usage,
  pin_fingerprint,
  verify_pinned_fingerprint,
  encrypt_key_material,
  decrypt_key_material,
  create_encrypted_key_handle,
  get_unbiased_random_index,
  type KeyPair,
  type PgpKeyData,
  type EncryptedVault,
  type VaultEncryptionResult,
  type EncryptedKeyHandle,
  type SecureVaultHandle,
  type KeyUsageRecord,
  type KeyOperation,
  KEY_USAGE_LOG,
  PINNED_FINGERPRINTS,
} from "./key_manager_core";

export async function with_decrypted_key<T>(
  handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
  operation: (key: string) => Promise<T>,
): Promise<T> {
  if (detect_anomalous_usage(handle.key_id)) {
    log_key_usage(handle.key_id, "decrypt", false, "anomalous_usage_detected");
    throw new Error("security_violation: anomalous key usage detected");
  }

  const encrypted_data = handle.encrypted_key;
  const salt = encrypted_data.slice(0, 32);
  const nonce = encrypted_data.slice(32, 44);
  const ciphertext = encrypted_data.slice(44);

  let decrypted_material: Uint8Array | null = null;
  let key_string: string | null = null;

  try {
    decrypted_material = await decrypt_key_material(
      ciphertext,
      salt,
      nonce,
      passphrase,
    );
    const decoder = new TextDecoder();

    key_string = decoder.decode(decrypted_material);

    const public_key_obj = await openpgp.readPrivateKey({
      armoredKey: key_string,
    });
    const current_fingerprint = public_key_obj.getFingerprint();

    const fingerprint_valid = await verify_pinned_fingerprint(
      handle.key_id,
      current_fingerprint,
    );

    if (!fingerprint_valid) {
      throw new Error(
        "fingerprint_mismatch: key fingerprint verification failed",
      );
    }

    log_key_usage(handle.key_id, "decrypt", true);

    const result = await operation(key_string);

    return result;
  } catch (error) {
    log_key_usage(
      handle.key_id,
      "decrypt",
      false,
      error instanceof Error ? error.message : "unknown",
    );
    throw error;
  } finally {
    if (decrypted_material) {
      secure_zero_memory(decrypted_material);
    }
  }
}

export async function hash_email(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
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
  const password_data = encoder.encode(password);

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

  secure_zero_memory(entropy_test);

  if (!entropy_check.valid) {
    throw new Error(
      "entropy_source_failure: system entropy source is inadequate",
    );
  }

  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "curve25519",
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

  secure_zero_memory(entropy_test);

  if (!entropy_check.valid) {
    throw new Error(
      "entropy_source_failure: system entropy source is inadequate",
    );
  }

  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "curve25519",
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

export async function verify_prekey_signature(
  prekey_public: string,
  signature: string,
  identity_public_key: string,
): Promise<boolean> {
  try {
    const identity_key = await openpgp.readKey({
      armoredKey: identity_public_key,
    });
    const signed_message = await openpgp.readCleartextMessage({
      cleartextMessage: signature,
    });

    const verification = await openpgp.verify({
      message: signed_message,
      verificationKeys: identity_key,
    });

    const { verified } = verification.signatures[0];

    await verified;

    const extracted_text = signed_message.getText();

    if (extracted_text !== prekey_public) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function verify_key_binding(
  identity_public_key: string,
  signed_prekey_public: string,
  prekey_signature: string,
): Promise<{
  valid: boolean;
  identity_fingerprint: string;
  prekey_fingerprint: string;
}> {
  const identity_key = await openpgp.readKey({
    armoredKey: identity_public_key,
  });
  const identity_fingerprint = identity_key.getFingerprint();

  const prekey = await openpgp.readKey({ armoredKey: signed_prekey_public });
  const prekey_fingerprint = prekey.getFingerprint();

  const signature_valid = await verify_prekey_signature(
    signed_prekey_public,
    prekey_signature,
    identity_public_key,
  );

  return {
    valid: signature_valid,
    identity_fingerprint,
    prekey_fingerprint,
  };
}

export function generate_recovery_codes(count: number = 6): string[] {
  const codes: string[] = [];
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  for (let i = 0; i < count; i++) {
    const segments: string[] = [];

    for (let s = 0; s < 3; s++) {
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

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    vault_data,
  );

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

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );

  const decoder = new TextDecoder();
  const vault_json = decoder.decode(decrypted);
  const vault: EncryptedVault = JSON.parse(vault_json);

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

  secure_zero_memory(identity_key_bytes);
  secure_zero_memory(signed_prekey_bytes);
  secure_zero_memory(new Uint8Array(decrypted));

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

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );

  const decoder = new TextDecoder();
  const vault_json = decoder.decode(decrypted);

  return JSON.parse(vault_json);
}

export type sender_verification_status =
  | "verified"
  | "invalid"
  | "unsigned"
  | "no_keys"
  | "unknown";

export interface decrypted_message_result {
  plaintext: string;
  verification: sender_verification_status;
  has_signature: boolean;
}

export interface sender_signing_key {
  armored_secret_key: string;
  passphrase: string;
}

async function parse_signing_keys(
  signing_key: sender_signing_key | undefined,
): Promise<openpgp.PrivateKey[] | undefined> {
  if (!signing_key) return undefined;

  try {
    const decrypted = await openpgp.decryptKey({
      ["privateKey" as const]: await openpgp.readPrivateKey({
        armoredKey: signing_key.armored_secret_key,
      }),
      passphrase: signing_key.passphrase,
    });

    return [decrypted];
  } catch {
    return undefined;
  }
}

async function parse_verification_keys(
  verification_keys: string[] | undefined,
): Promise<openpgp.Key[]> {
  if (!verification_keys || verification_keys.length === 0) return [];

  const parsed: openpgp.Key[] = [];

  for (const armored of verification_keys) {
    try {
      parsed.push(await openpgp.readKey({ armoredKey: armored }));
    } catch {
      continue;
    }
  }

  return parsed;
}

async function evaluate_signatures(
  signatures: { verified: Promise<boolean> }[] | undefined,
  keys_provided: boolean,
): Promise<{ status: sender_verification_status; has_signature: boolean }> {
  const list = signatures || [];
  const has_signature = list.length > 0;

  if (!has_signature) return { status: "unsigned", has_signature: false };
  if (!keys_provided) return { status: "no_keys", has_signature: true };

  let any_valid = false;
  let any_invalid = false;

  for (const sig of list) {
    try {
      const ok = await sig.verified;

      if (ok) any_valid = true;
      else any_invalid = true;
    } catch {
      any_invalid = true;
    }
  }

  if (any_valid) return { status: "verified", has_signature: true };
  if (any_invalid) return { status: "invalid", has_signature: true };

  return { status: "unknown", has_signature: true };
}

export async function encrypt_message(
  plaintext: string,
  recipient_public_key: string,
  signing_key?: sender_signing_key,
): Promise<string> {
  const public_key = await openpgp.readKey({
    armoredKey: recipient_public_key,
  });

  const message = await openpgp.createMessage({ text: plaintext });
  const signing_keys = await parse_signing_keys(signing_key);
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: public_key,
    signingKeys: signing_keys,
    format: "armored",
  });

  return typeof encrypted === "string" ? encrypted : encrypted.toString();
}

export async function encrypt_message_multi(
  plaintext: string,
  recipient_public_keys: string[],
  signing_key?: sender_signing_key,
): Promise<string> {
  if (recipient_public_keys.length === 0) {
    throw new Error("At least one recipient public key is required");
  }

  const parse_results = await Promise.all(
    recipient_public_keys.map(async (key) => {
      try {
        return await openpgp.readKey({ armoredKey: key });
      } catch {
        return null;
      }
    }),
  );

  const valid_keys = parse_results.filter((k): k is openpgp.Key => k !== null);

  if (valid_keys.length === 0) {
    throw new Error("No valid PGP keys found among provided recipient keys");
  }

  const message = await openpgp.createMessage({ text: plaintext });
  const signing_keys = await parse_signing_keys(signing_key);
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: valid_keys,
    signingKeys: signing_keys,
    format: "armored",
  });

  return typeof encrypted === "string" ? encrypted : encrypted.toString();
}

export async function decrypt_message_verified(
  ciphertext: string,
  secret_key: string,
  passphrase: string,
  verification_keys?: string[],
): Promise<decrypted_message_result> {
  const secret_key_obj = await openpgp.decryptKey({
    ["privateKey" as const]: await openpgp.readPrivateKey({
      armoredKey: secret_key,
    }),
    passphrase,
  });

  const message = await openpgp.readMessage({ armoredMessage: ciphertext });
  const parsed_verification_keys = await parse_verification_keys(verification_keys);
  const result = await openpgp.decrypt({
    message,
    decryptionKeys: secret_key_obj,
    verificationKeys:
      parsed_verification_keys.length > 0 ? parsed_verification_keys : undefined,
  });

  const evaluated = await evaluate_signatures(
    result.signatures as { verified: Promise<boolean> }[] | undefined,
    parsed_verification_keys.length > 0,
  );

  return {
    plaintext: result.data.toString(),
    verification: evaluated.status,
    has_signature: evaluated.has_signature,
  };
}

export async function decrypt_message(
  ciphertext: string,
  secret_key: string,
  passphrase: string,
): Promise<string> {
  const result = await decrypt_message_verified(ciphertext, secret_key, passphrase);

  return result.plaintext;
}

export async function decrypt_message_with_handle_verified(
  ciphertext: string,
  key_handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
  verification_keys?: string[],
): Promise<decrypted_message_result> {
  return with_decrypted_key(key_handle, passphrase, async (private_key) => {
    const decoder = new TextDecoder();
    const passphrase_string = decoder.decode(passphrase);

    return decrypt_message_verified(
      ciphertext,
      private_key,
      passphrase_string,
      verification_keys,
    );
  });
}

export async function decrypt_message_with_handle(
  ciphertext: string,
  key_handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
): Promise<string> {
  const result = await decrypt_message_with_handle_verified(
    ciphertext,
    key_handle,
    passphrase,
  );

  return result.plaintext;
}

export function string_to_passphrase(password: string): Uint8Array {
  const encoder = new TextEncoder();

  return encoder.encode(password);
}

export function zero_passphrase(passphrase: Uint8Array): void {
  secure_zero_memory(passphrase);
}

export function get_key_usage_log(key_id?: string): KeyUsageRecord[] {
  if (key_id) {
    return KEY_USAGE_LOG.filter((r) => r.key_id === key_id);
  }

  return [...KEY_USAGE_LOG];
}

export function get_usage_statistics(key_id: string): {
  total_operations: number;
  successful_operations: number;
  failed_operations: number;
  last_used: number | null;
  operations_by_type: Record<KeyOperation, number>;
} {
  const records = KEY_USAGE_LOG.filter((r) => r.key_id === key_id);

  const operations_by_type: Record<KeyOperation, number> = {
    decrypt: 0,
    sign: 0,
    verify: 0,
    encrypt: 0,
    load: 0,
    generate: 0,
  };

  let successful = 0;
  let failed = 0;
  let last_used: number | null = null;

  for (const record of records) {
    operations_by_type[record.operation]++;
    if (record.success) {
      successful++;
    } else {
      failed++;
    }
    if (last_used === null || record.timestamp > last_used) {
      last_used = record.timestamp;
    }
  }

  return {
    total_operations: records.length,
    successful_operations: successful,
    failed_operations: failed,
    last_used,
    operations_by_type,
  };
}

export function clear_key_manager_state(): void {
  KEY_USAGE_LOG.length = 0;
  PINNED_FINGERPRINTS.clear();
}

export function clear_key_handle(handle: EncryptedKeyHandle): void {
  secure_zero_memory(handle.encrypted_key);
  log_key_usage(handle.key_id, "decrypt", true, "handle_cleared");
}

export function clear_vault_handle(vault_handle: SecureVaultHandle): void {
  clear_key_handle(vault_handle.identity_handle);
  clear_key_handle(vault_handle.signed_prekey_handle);
}
