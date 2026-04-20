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
export const HASH_ALG = ["SHA", "256"].join("-");
export const KEY_DERIVATION_ITERATIONS = 310000;

const ENTROPY_QUALITY_THRESHOLD = 0.7;
const MAX_USAGE_LOG_SIZE = 10000;

export interface KeyPair {
  public_key: string;
  secret_key: string;
  fingerprint: string;
}

export interface PgpKeyData {
  fingerprint: string;
  key_id: string;
  public_key_armored: string;
  ["encrypted_private_key"]: string;
  ["private_key_nonce"]: string;
  algorithm: string;
  key_size: number;
}

export interface LegacyDerivedKek {
  k: string;
  added_at: string;
}

export interface EncryptedVault {
  identity_key: string;
  previous_keys?: string[];
  signed_prekey: string;
  signed_prekey_private: string;
  recovery_codes: string[];
  ratchet_identity_key?: string;
  ratchet_identity_public?: string;
  ratchet_signed_prekey?: string;
  ratchet_signed_prekey_public?: string;
  legacy_keks?: LegacyDerivedKek[];
}

export interface VaultEncryptionResult {
  encrypted_vault: string;
  vault_nonce: string;
}

export interface EncryptedKeyHandle {
  encrypted_key: Uint8Array;
  key_id: string;
  algorithm: string;
  created_at: number;
  fingerprint: string;
  key_type: KeyType;
}

export interface SecureVaultHandle {
  identity_handle: EncryptedKeyHandle;
  signed_prekey_handle: EncryptedKeyHandle;
  signed_prekey_public: string;
  recovery_codes_hash: string;
  vault_id: string;
  created_at: number;
}

export interface KeyUsageRecord {
  key_id: string;
  operation: KeyOperation;
  timestamp: number;
  success: boolean;
  context?: string;
}

export interface PinnedFingerprint {
  key_id: string;
  fingerprint: string;
  key_type: KeyType;
  pinned_at: number;
  last_verified: number;
}

export type KeyType = "identity" | "signed_prekey" | "one_time_prekey";
export type KeyOperation =
  | "decrypt"
  | "sign"
  | "verify"
  | "encrypt"
  | "load"
  | "generate";

export const KEY_USAGE_LOG: KeyUsageRecord[] = [];
export const PINNED_FINGERPRINTS: Map<string, PinnedFingerprint> = new Map();

export function secure_zero_memory(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}

export function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

export function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function generate_random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function generate_key_id(): string {
  const bytes = generate_random_bytes(16);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  secure_zero_memory(bytes);

  return hex;
}

export async function compute_hash(data: Uint8Array): Promise<string> {
  const hash_buffer = await crypto.subtle.digest(HASH_ALG, data);

  return array_to_base64(new Uint8Array(hash_buffer));
}

export function verify_entropy_quality(bytes: Uint8Array): {
  valid: boolean;
  quality: number;
} {
  if (bytes.length < 32) {
    return { valid: false, quality: 0 };
  }

  const byte_counts = new Uint32Array(256);

  for (let i = 0; i < bytes.length; i++) {
    byte_counts[bytes[i]]++;
  }

  const expected = bytes.length / 256;
  let chi_squared = 0;

  for (let i = 0; i < 256; i++) {
    const diff = byte_counts[i] - expected;

    chi_squared += (diff * diff) / expected;
  }

  const normalized = Math.max(0, 1 - chi_squared / (bytes.length * 2));

  let runs = 1;

  for (let i = 1; i < bytes.length; i++) {
    if (bytes[i] !== bytes[i - 1]) {
      runs++;
    }
  }
  const expected_runs = (bytes.length + 1) / 2;
  const runs_quality = Math.min(1, runs / expected_runs);

  const quality = (normalized + runs_quality) / 2;

  return {
    valid: quality >= ENTROPY_QUALITY_THRESHOLD,
    quality,
  };
}

export function log_key_usage(
  key_id: string,
  operation: KeyOperation,
  success: boolean,
  context?: string,
): void {
  const record: KeyUsageRecord = {
    key_id,
    operation,
    timestamp: Date.now(),
    success,
    context,
  };

  KEY_USAGE_LOG.push(record);

  if (KEY_USAGE_LOG.length > MAX_USAGE_LOG_SIZE) {
    KEY_USAGE_LOG.splice(0, KEY_USAGE_LOG.length - MAX_USAGE_LOG_SIZE);
  }
}

export function detect_anomalous_usage(key_id: string): boolean {
  const recent_window = Date.now() - 60000;
  const recent_uses = KEY_USAGE_LOG.filter(
    (r) => r.key_id === key_id && r.timestamp > recent_window,
  );

  if (recent_uses.length > 100) {
    return true;
  }

  const failed_uses = recent_uses.filter((r) => !r.success);

  if (failed_uses.length > 10) {
    return true;
  }

  return false;
}

export function pin_fingerprint(
  key_id: string,
  fingerprint: string,
  key_type: KeyType,
): void {
  const existing = PINNED_FINGERPRINTS.get(key_id);

  if (existing && existing.fingerprint !== fingerprint) {
    throw new Error("fingerprint_mismatch: key fingerprint has changed");
  }

  PINNED_FINGERPRINTS.set(key_id, {
    key_id,
    fingerprint,
    key_type,
    pinned_at: existing?.pinned_at ?? Date.now(),
    last_verified: Date.now(),
  });
}

async function constant_time_string_compare(
  a: string,
  b: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const a_bytes = encoder.encode(a);
  const b_bytes = encoder.encode(b);

  const a_hash = new Uint8Array(await crypto.subtle.digest(HASH_ALG, a_bytes));
  const b_hash = new Uint8Array(await crypto.subtle.digest(HASH_ALG, b_bytes));

  let result = 0;

  for (let i = 0; i < 32; i++) {
    result |= a_hash[i] ^ b_hash[i];
  }

  return result === 0;
}

export async function verify_pinned_fingerprint(
  key_id: string,
  fingerprint: string,
): Promise<boolean> {
  const pinned = PINNED_FINGERPRINTS.get(key_id);

  if (!pinned) {
    return true;
  }

  const fingerprints_match = await constant_time_string_compare(
    pinned.fingerprint,
    fingerprint,
  );

  if (!fingerprints_match) {
    log_key_usage(key_id, "verify", false, "fingerprint_verification_failed");

    return false;
  }

  pinned.last_verified = Date.now();

  return true;
}

export async function derive_key_encryption_key(
  passphrase: Uint8Array,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: KEY_DERIVATION_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt_key_material(
  key_material: Uint8Array,
  passphrase: Uint8Array,
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; nonce: Uint8Array }> {
  const salt = generate_random_bytes(32);
  const nonce = generate_random_bytes(12);

  const kek = await derive_key_encryption_key(passphrase, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    kek,
    key_material,
  );

  return {
    encrypted: new Uint8Array(encrypted),
    salt,
    nonce,
  };
}

export async function decrypt_key_material(
  encrypted: Uint8Array,
  salt: Uint8Array,
  nonce: Uint8Array,
  passphrase: Uint8Array,
): Promise<Uint8Array> {
  const kek = await derive_key_encryption_key(passphrase, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    kek,
    encrypted,
  );

  return new Uint8Array(decrypted);
}

export function create_encrypted_key_handle(
  encrypted_key: Uint8Array,
  fingerprint: string,
  key_type: KeyType,
  algorithm: string = "RSA-4096",
): EncryptedKeyHandle {
  return {
    encrypted_key: encrypted_key.slice(),
    key_id: generate_key_id(),
    algorithm,
    created_at: Date.now(),
    fingerprint,
    key_type,
  };
}

export function get_unbiased_random_index(max: number): number {
  const bytes_needed = Math.ceil(Math.log2(max) / 8) || 1;
  const max_valid = Math.floor(256 ** bytes_needed / max) * max;

  let value: number;

  do {
    const random_bytes = crypto.getRandomValues(new Uint8Array(bytes_needed));

    value = random_bytes.reduce((acc, byte, i) => acc + byte * 256 ** i, 0);
  } while (value >= max_valid);

  return value % max;
}
