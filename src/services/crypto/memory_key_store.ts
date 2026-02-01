import type { EncryptedVault } from "./key_manager";

import {
  SecureBuffer,
  zero_uint8_array,
  DEFAULT_AUTO_ZERO_TIMEOUT_MS,
} from "./secure_memory";
import {
  store_key,
  get_key,
  remove_key,
  clear_all_keys as clear_crypto_key_cache,
  start_session,
  refresh_session,
  on_session_expire,
  has_key,
} from "./crypto_key_cache";

interface HmrState {
  vault_in_memory: EncryptedVault | null;
  derived_encryption_key: Uint8Array | null;
  passphrase_string: string | null;
}

let vault_in_memory: EncryptedVault | null = null;
let secure_passphrase: SecureBuffer | null = null;
let derived_encryption_key: Uint8Array | null = null;
let session_expire_unsubscribe: (() => void) | null = null;

if (import.meta.hot) {
  const hmr_state = import.meta.hot.data as HmrState | undefined;
  let keys_restored = false;

  if (hmr_state?.vault_in_memory) {
    vault_in_memory = hmr_state.vault_in_memory;
  }
  if (hmr_state?.derived_encryption_key) {
    derived_encryption_key = hmr_state.derived_encryption_key;
    keys_restored = true;
  }
  if (hmr_state?.passphrase_string) {
    secure_passphrase = SecureBuffer.from_string(
      hmr_state.passphrase_string,
      DEFAULT_AUTO_ZERO_TIMEOUT_MS,
    );
    keys_restored = true;
  }

  if (keys_restored) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("astermail:keys-ready"));
    }, 0);
  }

  import.meta.hot.dispose((data: HmrState) => {
    data.vault_in_memory = vault_in_memory;
    data.derived_encryption_key = derived_encryption_key;
    data.passphrase_string = secure_passphrase?.to_string() ?? null;
  });
}

const DERIVED_KEY_LENGTH = 32;
const DERIVED_KEY_INFO = "aster-storage-encryption-key-v1";
const SALT_DERIVATION_PREFIX = "aster-hkdf-salt-v1:";

const IDENTITY_KEY_CACHE_ID = "identity_crypto_key";
const SIGNED_PREKEY_CACHE_ID = "signed_prekey_crypto_key";
const IDENTITY_PRIVATE_KEY_CACHE_ID = "identity_private_crypto_key";
const SIGNED_PREKEY_PRIVATE_CACHE_ID = "signed_prekey_private_crypto_key";

async function derive_salt_from_passphrase(
  passphrase_bytes: Uint8Array,
): Promise<Uint8Array> {
  const prefix = new TextEncoder().encode(SALT_DERIVATION_PREFIX);
  const combined = new Uint8Array(prefix.length + passphrase_bytes.length);

  combined.set(prefix, 0);
  combined.set(passphrase_bytes, prefix.length);

  const hash = await crypto.subtle.digest("SHA-256", combined);

  return new Uint8Array(hash);
}

async function derive_encryption_key_from_passphrase(
  passphrase_bytes: Uint8Array,
): Promise<Uint8Array> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const info = new TextEncoder().encode(DERIVED_KEY_INFO);
  const salt = await derive_salt_from_passphrase(passphrase_bytes);

  const derived_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt,
      info: info,
    },
    key_material,
    DERIVED_KEY_LENGTH * 8,
  );

  return new Uint8Array(derived_bits);
}

export async function store_vault_in_memory(
  vault: EncryptedVault,
  passphrase: string,
): Promise<void> {
  clear_vault_from_memory();

  vault_in_memory = {
    identity_key: vault.identity_key,
    previous_keys: vault.previous_keys ? [...vault.previous_keys] : [],
    signed_prekey: vault.signed_prekey,
    signed_prekey_private: vault.signed_prekey_private,
    recovery_codes: [...vault.recovery_codes],
    ratchet_identity_key: vault.ratchet_identity_key,
    ratchet_identity_public: vault.ratchet_identity_public,
    ratchet_signed_prekey: vault.ratchet_signed_prekey,
    ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public,
  };

  secure_passphrase = SecureBuffer.from_string(
    passphrase,
    DEFAULT_AUTO_ZERO_TIMEOUT_MS,
  );

  const passphrase_bytes = secure_passphrase.get_bytes();

  if (passphrase_bytes) {
    derived_encryption_key =
      await derive_encryption_key_from_passphrase(passphrase_bytes);
    zero_uint8_array(passphrase_bytes);
  }

  secure_passphrase.on_zero(() => {
    if (derived_encryption_key) {
      zero_uint8_array(derived_encryption_key);
      derived_encryption_key = null;
    }
    clear_crypto_key_cache();
  });

  start_session();

  session_expire_unsubscribe = on_session_expire(() => {
    clear_vault_from_memory();
  });

  if (derived_encryption_key) {
    await import_and_cache_derived_key(derived_encryption_key);
  }
}

async function import_and_cache_derived_key(
  key_bytes: Uint8Array,
): Promise<void> {
  const aes_key = await crypto.subtle.importKey(
    "raw",
    key_bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  store_key("derived_encryption_key", aes_key, "aes");
}

export function get_vault_from_memory(): EncryptedVault | null {
  return vault_in_memory;
}

export function get_passphrase_bytes(): Uint8Array | null {
  if (!secure_passphrase || secure_passphrase.is_cleared()) {
    return null;
  }

  return secure_passphrase.get_bytes();
}

export function get_derived_encryption_key(): Uint8Array | null {
  if (!derived_encryption_key) {
    return null;
  }
  const copy = new Uint8Array(derived_encryption_key.length);

  copy.set(derived_encryption_key);

  return copy;
}

export function get_derived_encryption_crypto_key(): CryptoKey | null {
  return get_key("derived_encryption_key");
}

export async function get_or_create_derived_encryption_crypto_key(): Promise<CryptoKey | null> {
  let cached = get_key("derived_encryption_key");

  if (cached) {
    return cached;
  }

  const key_bytes = get_derived_encryption_key();

  if (!key_bytes) {
    return null;
  }

  await import_and_cache_derived_key(key_bytes);
  zero_uint8_array(key_bytes);

  return get_key("derived_encryption_key");
}

export function get_passphrase_from_memory(): string | null {
  if (!secure_passphrase || secure_passphrase.is_cleared()) {
    return null;
  }

  return secure_passphrase.to_string();
}

export async function with_passphrase<T>(
  callback: (passphrase_bytes: Uint8Array) => Promise<T>,
): Promise<T | null> {
  if (!secure_passphrase || secure_passphrase.is_cleared()) {
    return null;
  }

  const bytes = secure_passphrase.get_bytes();

  if (!bytes) {
    return null;
  }

  try {
    return await callback(bytes);
  } finally {
    zero_uint8_array(bytes);
  }
}

export function clear_passphrase(): void {
  if (secure_passphrase) {
    secure_passphrase.zero();
    secure_passphrase = null;
  }
  if (derived_encryption_key) {
    zero_uint8_array(derived_encryption_key);
    derived_encryption_key = null;
  }
}

export function clear_vault_from_memory(): void {
  clear_passphrase();
  vault_in_memory = null;
  clear_crypto_key_cache();

  if (session_expire_unsubscribe) {
    session_expire_unsubscribe();
    session_expire_unsubscribe = null;
  }
}

export function has_vault_in_memory(): boolean {
  return vault_in_memory !== null;
}

export function has_passphrase_in_memory(): boolean {
  return secure_passphrase !== null && !secure_passphrase.is_cleared();
}

export function extend_passphrase_timeout(): void {
  if (secure_passphrase) {
    secure_passphrase.extend_timeout();
  }
  refresh_session();
}

export function set_passphrase_timeout(timeout_ms: number): void {
  if (secure_passphrase) {
    secure_passphrase.set_auto_zero_timeout(timeout_ms);
  }
}

export function get_public_key_for_display(): string | null {
  return vault_in_memory?.signed_prekey ?? null;
}

export function get_key_fingerprint(): string | null {
  if (!vault_in_memory) return null;

  const lines = vault_in_memory.identity_key.split("\n");
  const fingerprint = lines.find(
    (line) => line.length === 40 && /^[A-F0-9]+$/i.test(line),
  );

  return (
    fingerprint?.match(/.{4}/g)?.join(" ") ??
    vault_in_memory.identity_key.substring(0, 16) + "..."
  );
}

function validate_passphrase(entered: string): string | null {
  if (!secure_passphrase || secure_passphrase.is_cleared())
    return "Session expired. Please log in again.";

  const entered_bytes = new TextEncoder().encode(entered);
  const stored_bytes = secure_passphrase.get_bytes();

  if (!stored_bytes) return "Session expired. Please log in again.";

  const max_len = Math.max(entered_bytes.length, stored_bytes.length);
  const padded_entered = new Uint8Array(max_len);
  const padded_stored = new Uint8Array(max_len);

  padded_entered.set(entered_bytes);
  padded_stored.set(stored_bytes);

  let result = entered_bytes.length ^ stored_bytes.length;

  for (let i = 0; i < max_len; i++) {
    result |= padded_entered[i] ^ padded_stored[i];
  }

  zero_uint8_array(entered_bytes);
  zero_uint8_array(stored_bytes);
  zero_uint8_array(padded_entered);
  zero_uint8_array(padded_stored);

  if (result !== 0) return "Incorrect password.";
  if (!vault_in_memory) return "No keys available.";

  return null;
}

export function get_recovery_codes_with_confirmation(
  entered_passphrase: string,
): { success: boolean; codes?: string[]; error?: string } {
  const error = validate_passphrase(entered_passphrase);

  if (error) return { success: false, error };

  return { success: true, codes: [...vault_in_memory!.recovery_codes] };
}

export function store_identity_crypto_key(key: CryptoKey): void {
  refresh_session();
  store_key(IDENTITY_KEY_CACHE_ID, key, "identity");
}

export function get_identity_crypto_key(): CryptoKey | null {
  refresh_session();

  return get_key(IDENTITY_KEY_CACHE_ID);
}

export function has_identity_crypto_key(): boolean {
  return has_key(IDENTITY_KEY_CACHE_ID);
}

export function store_identity_private_crypto_key(key: CryptoKey): void {
  refresh_session();
  store_key(IDENTITY_PRIVATE_KEY_CACHE_ID, key, "identity");
}

export function get_identity_private_crypto_key(): CryptoKey | null {
  refresh_session();

  return get_key(IDENTITY_PRIVATE_KEY_CACHE_ID);
}

export function has_identity_private_crypto_key(): boolean {
  return has_key(IDENTITY_PRIVATE_KEY_CACHE_ID);
}

export function store_signed_prekey_crypto_key(key: CryptoKey): void {
  refresh_session();
  store_key(SIGNED_PREKEY_CACHE_ID, key, "signed_prekey");
}

export function get_signed_prekey_crypto_key(): CryptoKey | null {
  refresh_session();

  return get_key(SIGNED_PREKEY_CACHE_ID);
}

export function has_signed_prekey_crypto_key(): boolean {
  return has_key(SIGNED_PREKEY_CACHE_ID);
}

export function store_signed_prekey_private_crypto_key(key: CryptoKey): void {
  refresh_session();
  store_key(SIGNED_PREKEY_PRIVATE_CACHE_ID, key, "signed_prekey");
}

export function get_signed_prekey_private_crypto_key(): CryptoKey | null {
  refresh_session();

  return get_key(SIGNED_PREKEY_PRIVATE_CACHE_ID);
}

export function has_signed_prekey_private_crypto_key(): boolean {
  return has_key(SIGNED_PREKEY_PRIVATE_CACHE_ID);
}

export function store_ecdh_crypto_key(id: string, key: CryptoKey): void {
  refresh_session();
  store_key(`ecdh:${id}`, key, "ecdh");
}

export function get_ecdh_crypto_key(id: string): CryptoKey | null {
  refresh_session();

  return get_key(`ecdh:${id}`);
}

export function has_ecdh_crypto_key(id: string): boolean {
  return has_key(`ecdh:${id}`);
}

export function remove_ecdh_crypto_key(id: string): boolean {
  return remove_key(`ecdh:${id}`);
}

export function store_aes_crypto_key(id: string, key: CryptoKey): void {
  refresh_session();
  store_key(`aes:${id}`, key, "aes");
}

export function get_aes_crypto_key(id: string): CryptoKey | null {
  refresh_session();

  return get_key(`aes:${id}`);
}

export function has_aes_crypto_key(id: string): boolean {
  return has_key(`aes:${id}`);
}

export function remove_aes_crypto_key(id: string): boolean {
  return remove_key(`aes:${id}`);
}
