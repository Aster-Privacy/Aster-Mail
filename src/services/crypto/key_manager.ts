import * as openpgp from "openpgp";

import {
  store_ecdh_crypto_key,
  get_ecdh_crypto_key,
  has_ecdh_crypto_key,
  store_aes_crypto_key,
  get_aes_crypto_key,
  has_aes_crypto_key,
} from "./memory_key_store";

async function constant_time_string_compare(
  a: string,
  b: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const a_bytes = encoder.encode(a);
  const b_bytes = encoder.encode(b);

  const a_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", a_bytes));
  const b_hash = new Uint8Array(await crypto.subtle.digest("SHA-256", b_bytes));

  let result = 0;

  for (let i = 0; i < 32; i++) {
    result |= a_hash[i] ^ b_hash[i];
  }

  return result === 0;
}

interface KeyPair {
  public_key: string;
  private_key: string;
  fingerprint: string;
}

export interface PgpKeyData {
  fingerprint: string;
  key_id: string;
  public_key_armored: string;
  encrypted_private_key: string;
  private_key_nonce: string;
  algorithm: string;
  key_size: number;
}

interface EncryptedVault {
  identity_key: string;
  previous_keys?: string[];
  signed_prekey: string;
  signed_prekey_private: string;
  recovery_codes: string[];
  ratchet_identity_key?: string;
  ratchet_identity_public?: string;
  ratchet_signed_prekey?: string;
  ratchet_signed_prekey_public?: string;
}

interface VaultEncryptionResult {
  encrypted_vault: string;
  vault_nonce: string;
}

interface EncryptedKeyHandle {
  encrypted_key: Uint8Array;
  key_id: string;
  algorithm: string;
  created_at: number;
  fingerprint: string;
  key_type: KeyType;
}

interface SecureVaultHandle {
  identity_handle: EncryptedKeyHandle;
  signed_prekey_handle: EncryptedKeyHandle;
  signed_prekey_public: string;
  recovery_codes_hash: string;
  vault_id: string;
  created_at: number;
}

interface KeyUsageRecord {
  key_id: string;
  operation: KeyOperation;
  timestamp: number;
  success: boolean;
  context?: string;
}

interface PinnedFingerprint {
  key_id: string;
  fingerprint: string;
  key_type: KeyType;
  pinned_at: number;
  last_verified: number;
}

type KeyType = "identity" | "signed_prekey" | "one_time_prekey";
type KeyOperation =
  | "decrypt"
  | "sign"
  | "verify"
  | "encrypt"
  | "load"
  | "generate";

const KEY_USAGE_LOG: KeyUsageRecord[] = [];
const PINNED_FINGERPRINTS: Map<string, PinnedFingerprint> = new Map();
const MAX_USAGE_LOG_SIZE = 10000;
const ENTROPY_QUALITY_THRESHOLD = 0.7;
const KEY_DERIVATION_ITERATIONS = 310000;

function secure_zero_memory(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}

function array_to_base64(array: Uint8Array): string {
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

function generate_random_bytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function generate_key_id(): string {
  const bytes = generate_random_bytes(16);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  secure_zero_memory(bytes);

  return hex;
}

async function compute_hash(data: Uint8Array): Promise<string> {
  const hash_buffer = await crypto.subtle.digest("SHA-256", data);

  return array_to_base64(new Uint8Array(hash_buffer));
}

function verify_entropy_quality(bytes: Uint8Array): {
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

function log_key_usage(
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

function detect_anomalous_usage(key_id: string): boolean {
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

function pin_fingerprint(
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

async function verify_pinned_fingerprint(
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

async function derive_key_encryption_key(
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
      hash: "SHA-256",
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt_key_material(
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

async function decrypt_key_material(
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

function create_encrypted_key_handle(
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
  const hash_buffer = await crypto.subtle.digest("SHA-256", data);

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
      hash: "SHA-256",
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
    type: "rsa",
    rsaBits: 4096,
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
    private_key: privateKey,
    fingerprint,
  };
}

export async function generate_signed_prekey(
  name: string,
  email: string,
  passphrase: string,
  identity_private_key: string,
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
    type: "rsa",
    rsaBits: 4096,
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
    privateKey: await openpgp.readPrivateKey({
      armoredKey: identity_private_key,
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
      private_key: privateKey,
      fingerprint,
    },
    signature: typeof signature === "string" ? signature : signature.toString(),
  };
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

function get_unbiased_random_index(max: number): number {
  const bytes_needed = Math.ceil(Math.log2(max) / 8) || 1;
  const max_valid = Math.floor(256 ** bytes_needed / max) * max;

  let value: number;

  do {
    const random_bytes = crypto.getRandomValues(new Uint8Array(bytes_needed));

    value = random_bytes.reduce((acc, byte, i) => acc + byte * 256 ** i, 0);
  } while (value >= max_valid);

  return value % max;
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
  const private_key_bytes = encoder.encode(keypair.private_key);

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
      hash: "SHA-256",
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
    encrypted_private_key: array_to_base64(combined),
    private_key_nonce: array_to_base64(nonce),
    algorithm: "rsa4096",
    key_size: 4096,
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
      hash: "SHA-256",
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
      hash: "SHA-256",
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

  const identity_private_key = await openpgp.readPrivateKey({
    armoredKey: vault.identity_key,
  });
  const identity_fingerprint = identity_private_key.getFingerprint();

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
      hash: "SHA-256",
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

export async function encrypt_message(
  plaintext: string,
  recipient_public_key: string,
): Promise<string> {
  const public_key = await openpgp.readKey({
    armoredKey: recipient_public_key,
  });

  const message = await openpgp.createMessage({ text: plaintext });
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: public_key,
    format: "armored",
  });

  return typeof encrypted === "string" ? encrypted : encrypted.toString();
}

export async function encrypt_message_multi(
  plaintext: string,
  recipient_public_keys: string[],
): Promise<string> {
  if (recipient_public_keys.length === 0) {
    throw new Error("At least one recipient public key is required");
  }

  const public_keys = await Promise.all(
    recipient_public_keys.map((key) => openpgp.readKey({ armoredKey: key })),
  );

  const message = await openpgp.createMessage({ text: plaintext });
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: public_keys,
    format: "armored",
  });

  return typeof encrypted === "string" ? encrypted : encrypted.toString();
}

export async function decrypt_message(
  ciphertext: string,
  private_key: string,
  passphrase: string,
): Promise<string> {
  const private_key_obj = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: private_key }),
    passphrase,
  });

  const message = await openpgp.readMessage({ armoredMessage: ciphertext });
  const { data: decrypted } = await openpgp.decrypt({
    message,
    decryptionKeys: private_key_obj,
  });

  return decrypted.toString();
}

export async function decrypt_message_with_handle(
  ciphertext: string,
  key_handle: EncryptedKeyHandle,
  passphrase: Uint8Array,
): Promise<string> {
  return with_decrypted_key(key_handle, passphrase, async (private_key) => {
    const decoder = new TextDecoder();
    const passphrase_string = decoder.decode(passphrase);

    const private_key_obj = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: private_key }),
      passphrase: passphrase_string,
    });

    const message = await openpgp.readMessage({ armoredMessage: ciphertext });
    const { data: decrypted } = await openpgp.decrypt({
      message,
      decryptionKeys: private_key_obj,
    });

    return decrypted.toString();
  });
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

export function clear_key_handle(handle: EncryptedKeyHandle): void {
  secure_zero_memory(handle.encrypted_key);
  log_key_usage(handle.key_id, "decrypt", true, "handle_cleared");
}

export function clear_vault_handle(vault_handle: SecureVaultHandle): void {
  clear_key_handle(vault_handle.identity_handle);
  clear_key_handle(vault_handle.signed_prekey_handle);
}

export async function generate_ecdh_keypair(): Promise<{
  public_key: CryptoKey;
  private_key: CryptoKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );

  return {
    public_key: keypair.publicKey,
    private_key: keypair.privateKey,
    public_key_raw: new Uint8Array(public_key_raw),
  };
}

export async function import_ecdh_public_key(
  raw_key: Uint8Array,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_ecdh_crypto_key(cache_id)) {
    const cached = get_ecdh_crypto_key(cache_id);

    if (cached) return cached;
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  if (cache_id) {
    store_ecdh_crypto_key(cache_id, crypto_key);
  }

  return crypto_key;
}

export async function import_ecdh_private_key(
  jwk: JsonWebKey,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_ecdh_crypto_key(cache_id)) {
    const cached = get_ecdh_crypto_key(cache_id);

    if (cached) return cached;
  }

  const crypto_key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );

  if (cache_id) {
    store_ecdh_crypto_key(cache_id, crypto_key);
  }

  return crypto_key;
}

export async function derive_shared_secret_as_crypto_key(
  private_key: CryptoKey,
  public_key: CryptoKey,
  cache_id?: string,
): Promise<CryptoKey> {
  if (cache_id && has_aes_crypto_key(cache_id)) {
    const cached = get_aes_crypto_key(cache_id);

    if (cached) return cached;
  }

  const shared_bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: public_key },
    private_key,
    256,
  );

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    shared_bits,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const info = new TextEncoder().encode("Aster Mail_ECDH_AES_v1");
  const info_hash = await crypto.subtle.digest("SHA-256", info);
  const derived_salt = new Uint8Array(info_hash);

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
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

export async function derive_shared_secret_bits(
  private_key: CryptoKey,
  public_key: CryptoKey,
): Promise<Uint8Array> {
  const shared_bits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: public_key },
    private_key,
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
      hash: "SHA-256",
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
  const salt_hash = await crypto.subtle.digest("SHA-256", info);
  const derived_salt = new Uint8Array(salt_hash);

  const chain_bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
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

export type {
  KeyPair,
  EncryptedVault,
  VaultEncryptionResult,
  EncryptedKeyHandle,
  SecureVaultHandle,
  KeyUsageRecord,
  PinnedFingerprint,
  KeyType,
  KeyOperation,
};
