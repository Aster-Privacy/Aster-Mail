import {
  get_derived_encryption_key,
  has_vault_in_memory,
  clear_vault_from_memory,
} from "./memory_key_store";
import {
  delete_database as delete_encrypted_db,
  encrypted_clear_all,
} from "./encrypted_storage";
import { zero_uint8_array } from "./secure_memory";
import { reset_search_crypto } from "./search_crypto";
import { clear_key_manager_state } from "./key_manager";

import { clear_search_cache } from "@/services/search/cache";
import { reset_classifier } from "@/services/classification/classifier";
import { clear_logo_cache } from "@/lib/logo_service";
import { stop_session_timeout } from "@/services/session_timeout_service";
import { sync_client } from "@/services/sync_client";
import { undo_send_manager } from "@/services/undo_send_manager";
import { clear_notification_state } from "@/services/notification_service";
import { clear_external_key_cache } from "@/services/api/keys";
import { clear_csrf_cache } from "@/services/api/csrf";
import { clear_category_token_cache } from "@/services/classification/tokens";
import {
  reset_global_index,
  clear_local_index,
} from "@/services/search/index_manager";

const CURRENT_VERSION = 1;
const STORAGE_SALT_KEY = "aster_storage_salt";
const DEVICE_ID_KEY = "aster_device_id";

const SENSITIVE_STORAGE_KEYS = [
  "astermail_session_key",
  "astermail_hmac_key",
  "astermail_encrypted_vault",
  "astermail_vault_nonce",
  "astermail_session_passphrase",
  "astermail_csrf_token",
  "astermail_ratchet_states_v2",
  "astermail_accounts_v3",
  "astermail_pending_send",
  "auth_token",
  "vault",
  "user",
];

interface EncryptedPayload {
  version: number;
  nonce: string;
  ciphertext: string;
  hmac: string;
}

interface DerivedKeys {
  storage_key: CryptoKey;
  hmac_key: CryptoKey;
}

let cached_keys: DerivedKeys | null = null;
let cached_key_fingerprint: string | null = null;

function array_to_base64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function generate_random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

async function fingerprint_key(key_bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", key_bytes);

  return array_to_base64(new Uint8Array(hash));
}

function get_or_create_device_id(): string {
  let device_id = localStorage.getItem(DEVICE_ID_KEY);

  if (!device_id) {
    const random_bytes = generate_random_bytes(32);

    device_id = array_to_base64(random_bytes);
    localStorage.setItem(DEVICE_ID_KEY, device_id);
  }

  return device_id;
}

function get_or_create_storage_salt(): Uint8Array {
  let salt_base64 = localStorage.getItem(STORAGE_SALT_KEY);

  if (!salt_base64) {
    const salt = generate_random_bytes(32);

    salt_base64 = array_to_base64(salt);
    localStorage.setItem(STORAGE_SALT_KEY, salt_base64);
  }

  return base64_to_array(salt_base64);
}

async function derive_master_key_from_encryption_key(
  encryption_key: Uint8Array,
  device_id: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = get_or_create_storage_salt();

  const combined = new Uint8Array(
    encryption_key.length + encoder.encode(device_id).length,
  );

  combined.set(encryption_key, 0);
  combined.set(encoder.encode(device_id), encryption_key.length);

  const key_material = await crypto.subtle.importKey(
    "raw",
    combined,
    "HKDF",
    false,
    ["deriveBits", "deriveKey"],
  );

  const master_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: encoder.encode("aster-storage-master-v2"),
    },
    key_material,
    256,
  );

  crypto.getRandomValues(combined);

  return crypto.subtle.importKey("raw", master_bits, "HKDF", false, [
    "deriveBits",
    "deriveKey",
  ]);
}

async function hkdf_derive_key(
  master_key: CryptoKey,
  info: string,
  key_usage: KeyUsage[],
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info_bytes = encoder.encode(info);
  const salt_source = encoder.encode(`aster-salt:${info}`);
  const salt_hash = await crypto.subtle.digest("SHA-256", salt_source);
  const derived_salt = new Uint8Array(salt_hash);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: derived_salt,
      info: info_bytes,
    },
    master_key,
    { name: "AES-GCM", length: 256 },
    false,
    key_usage,
  );
}

async function hkdf_derive_hmac_key(
  master_key: CryptoKey,
  info: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const info_bytes = encoder.encode(info);
  const salt_source = encoder.encode(`aster-hmac-salt:${info}`);
  const salt_hash = await crypto.subtle.digest("SHA-256", salt_source);
  const derived_salt = new Uint8Array(salt_hash);

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: derived_salt,
      info: info_bytes,
    },
    master_key,
    256,
  );

  return crypto.subtle.importKey(
    "raw",
    derived_bits,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function get_derived_keys(): Promise<DerivedKeys> {
  if (!has_vault_in_memory()) {
    throw new Error("Session expired. Please log in again.");
  }

  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("Key material unavailable. Please log in again.");
  }

  const key_fingerprint = await fingerprint_key(encryption_key);

  if (cached_keys && cached_key_fingerprint === key_fingerprint) {
    crypto.getRandomValues(encryption_key);

    return cached_keys;
  }

  const device_id = get_or_create_device_id();
  const master_key = await derive_master_key_from_encryption_key(
    encryption_key,
    device_id,
  );

  crypto.getRandomValues(encryption_key);

  const storage_key = await hkdf_derive_key(
    master_key,
    "aster-storage-encryption-v2",
    ["encrypt", "decrypt"],
  );

  const hmac_key = await hkdf_derive_hmac_key(
    master_key,
    "aster-storage-hmac-v2",
  );

  cached_keys = { storage_key, hmac_key };
  cached_key_fingerprint = key_fingerprint;

  return cached_keys;
}

async function constant_time_compare(
  a: Uint8Array,
  b: Uint8Array,
): Promise<boolean> {
  const a_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", a));
  const b_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", b));

  let result = 0;

  for (let i = 0; i < 32; i++) {
    result |= a_hash[i] ^ b_hash[i];
  }

  return result === 0;
}

async function compute_hmac(
  hmac_key: CryptoKey,
  version: number,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const version_bytes = new Uint8Array([version]);
  const combined = new Uint8Array(1 + nonce.length + ciphertext.length);

  combined.set(version_bytes, 0);
  combined.set(nonce, 1);
  combined.set(ciphertext, 1 + nonce.length);

  const signature = await crypto.subtle.sign("HMAC", hmac_key, combined);

  return new Uint8Array(signature);
}

export async function secure_encrypt(data: string): Promise<string> {
  const { storage_key, hmac_key } = await get_derived_keys();

  const encoder = new TextEncoder();
  const plaintext = encoder.encode(data);
  const nonce = generate_random_bytes(12);

  const ciphertext_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    storage_key,
    plaintext,
  );

  const ciphertext = new Uint8Array(ciphertext_buffer);
  const hmac = await compute_hmac(hmac_key, CURRENT_VERSION, nonce, ciphertext);

  const payload: EncryptedPayload = {
    version: CURRENT_VERSION,
    nonce: array_to_base64(nonce),
    ciphertext: array_to_base64(ciphertext),
    hmac: array_to_base64(hmac),
  };

  return JSON.stringify(payload);
}

export async function secure_decrypt(encrypted_data: string): Promise<string> {
  const payload: EncryptedPayload = JSON.parse(encrypted_data);

  if (payload.version > CURRENT_VERSION) {
    throw new Error(
      "Data encrypted with newer version. Please update the application.",
    );
  }

  const { storage_key, hmac_key } = await get_derived_keys();

  const nonce = base64_to_array(payload.nonce);
  const ciphertext = base64_to_array(payload.ciphertext);
  const stored_hmac = base64_to_array(payload.hmac);

  const computed_hmac = await compute_hmac(
    hmac_key,
    payload.version,
    nonce,
    ciphertext,
  );

  const hmac_valid = await constant_time_compare(stored_hmac, computed_hmac);

  if (!hmac_valid) {
    throw new Error("Data integrity check failed. Storage may be compromised.");
  }

  const plaintext_buffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    storage_key,
    ciphertext,
  );

  const decoder = new TextDecoder();

  return decoder.decode(plaintext_buffer);
}

export async function secure_store(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  const encrypted = await secure_encrypt(serialized);

  localStorage.setItem(key, encrypted);
}

export async function secure_retrieve<T>(key: string): Promise<T | null> {
  const encrypted = localStorage.getItem(key);

  if (!encrypted) {
    return null;
  }

  try {
    const decrypted = await secure_decrypt(encrypted);

    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

export function secure_remove(key: string): void {
  localStorage.removeItem(key);
}

export function clear_secure_storage_cache(): void {
  cached_keys = null;
  cached_key_fingerprint = null;
}

export function get_device_fingerprint(): string {
  return get_or_create_device_id();
}

export async function verify_storage_access(): Promise<boolean> {
  try {
    await get_derived_keys();

    return true;
  } catch {
    return false;
  }
}

export async function rotate_device_binding(): Promise<void> {
  const keys_to_migrate: string[] = [];
  const values_to_migrate: Map<string, unknown> = new Map();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (key && !key.startsWith("aster_")) {
      const value = await secure_retrieve(key);

      if (value !== null) {
        keys_to_migrate.push(key);
        values_to_migrate.set(key, value);
      }
    }
  }

  localStorage.removeItem(DEVICE_ID_KEY);
  clear_secure_storage_cache();

  for (const key of keys_to_migrate) {
    const value = values_to_migrate.get(key);

    if (value !== undefined) {
      await secure_store(key, value);
    }
  }
}

function secure_clear_session_storage(): void {
  const keys_to_remove: string[] = [];

  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);

    if (key) {
      keys_to_remove.push(key);
    }
  }

  for (const key of keys_to_remove) {
    const value = sessionStorage.getItem(key);

    if (value) {
      const random_data = crypto.getRandomValues(new Uint8Array(value.length));
      const random_string = Array.from(random_data)
        .map((b) => String.fromCharCode(b % 256))
        .join("");

      sessionStorage.setItem(key, random_string);
      zero_uint8_array(random_data);
    }
    sessionStorage.removeItem(key);
  }
}

function secure_clear_local_storage(): void {
  for (const key of SENSITIVE_STORAGE_KEYS) {
    const value = localStorage.getItem(key);

    if (value) {
      const random_data = crypto.getRandomValues(new Uint8Array(value.length));
      const random_string = Array.from(random_data)
        .map((b) => String.fromCharCode(b % 256))
        .join("");

      localStorage.setItem(key, random_string);
      zero_uint8_array(random_data);
    }
    localStorage.removeItem(key);
  }

  const astermail_keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (key && (key.startsWith("astermail_") || key.startsWith("aster_"))) {
      astermail_keys.push(key);
    }
  }

  for (const key of astermail_keys) {
    const value = localStorage.getItem(key);

    if (value) {
      const random_data = crypto.getRandomValues(new Uint8Array(value.length));
      const random_string = Array.from(random_data)
        .map((b) => String.fromCharCode(b % 256))
        .join("");

      localStorage.setItem(key, random_string);
      zero_uint8_array(random_data);
    }
    localStorage.removeItem(key);
  }
}

export async function wipe_all_storage(): Promise<void> {
  clear_vault_from_memory();

  clear_secure_storage_cache();
  clear_device_encryption_cache();

  clear_key_manager_state();
  reset_search_crypto();
  clear_search_cache();
  reset_classifier();
  clear_logo_cache();
  clear_notification_state();
  clear_external_key_cache();
  clear_csrf_cache();
  clear_category_token_cache();
  reset_global_index();
  clear_local_index();

  stop_session_timeout();
  sync_client.disconnect();
  undo_send_manager.destroy();

  try {
    await encrypted_clear_all();
  } catch {
    void 0;
  }

  try {
    await delete_encrypted_db();
  } catch {
    void 0;
  }

  secure_clear_session_storage();

  secure_clear_local_storage();
}

export async function secure_logout(): Promise<void> {
  await wipe_all_storage();
}

let device_encryption_key: CryptoKey | null = null;

async function get_device_encryption_key(): Promise<CryptoKey> {
  if (device_encryption_key) {
    return device_encryption_key;
  }

  const device_id = get_or_create_device_id();
  const salt = get_or_create_storage_salt();

  const encoder = new TextEncoder();
  const key_material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(device_id),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"],
  );

  device_encryption_key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return device_encryption_key;
}

export async function device_encrypt(data: string): Promise<string> {
  const key = await get_device_encryption_key();
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(data);
  const nonce = generate_random_bytes(12);

  const ciphertext_buffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  const ciphertext = new Uint8Array(ciphertext_buffer);

  const payload = {
    v: CURRENT_VERSION,
    n: array_to_base64(nonce),
    c: array_to_base64(ciphertext),
  };

  return JSON.stringify(payload);
}

export async function device_decrypt(encrypted_data: string): Promise<string> {
  const key = await get_device_encryption_key();
  const payload = JSON.parse(encrypted_data);

  const nonce = base64_to_array(payload.n);
  const ciphertext = base64_to_array(payload.c);

  const plaintext_buffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );

  const decoder = new TextDecoder();

  return decoder.decode(plaintext_buffer);
}

export async function device_store(key: string, value: unknown): Promise<void> {
  const serialized = JSON.stringify(value);
  const encrypted = await device_encrypt(serialized);

  localStorage.setItem(key, encrypted);
}

export async function device_retrieve<T>(key: string): Promise<T | null> {
  const encrypted = localStorage.getItem(key);

  if (!encrypted) {
    return null;
  }

  try {
    const decrypted = await device_decrypt(encrypted);

    return JSON.parse(decrypted) as T;
  } catch {
    return null;
  }
}

export function clear_device_encryption_cache(): void {
  device_encryption_key = null;
}

export type { EncryptedPayload };
