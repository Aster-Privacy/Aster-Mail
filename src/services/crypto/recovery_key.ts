import { EncryptedVault, base64_to_array } from "./key_manager";
import { zero_uint8_array } from "./secure_memory";

const PBKDF2_ITERATIONS = 100000;

function array_to_base64(array: Uint8Array): string {
  let binary = "";

  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }

  return btoa(binary);
}

export interface VaultBackup {
  encrypted_data: string;
  nonce: string;
  salt: string;
}

export interface EncryptedRecoveryKey {
  encrypted_key: string;
  nonce: string;
  salt: string;
}

export interface RecoveryShareData {
  code_hash: string;
  code_salt: string;
  encrypted_recovery_key: string;
  recovery_key_nonce: string;
}

export function generate_recovery_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function encrypt_vault_backup(
  vault: EncryptedVault,
  recovery_key: Uint8Array,
): Promise<VaultBackup> {
  const vault_json = JSON.stringify(vault);
  const vault_data = new TextEncoder().encode(vault_json);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("Aster Mail_Recovery_Vault_v1"),
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    vault_data,
  );

  return {
    encrypted_data: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

export async function decrypt_vault_backup(
  backup: VaultBackup,
  recovery_key: Uint8Array,
): Promise<EncryptedVault> {
  const encrypted_data = base64_to_array(backup.encrypted_data);
  const nonce = base64_to_array(backup.nonce);
  const salt = base64_to_array(backup.salt);

  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const aes_key = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("Aster Mail_Recovery_Vault_v1"),
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    encrypted_data,
  );

  const vault_json = new TextDecoder().decode(decrypted);

  return JSON.parse(vault_json);
}

export async function encrypt_recovery_key_with_code(
  recovery_key: Uint8Array,
  code: string,
): Promise<EncryptedRecoveryKey> {
  const normalized_code = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const code_bytes = new TextEncoder().encode(normalized_code);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));

  const key_material = await crypto.subtle.importKey(
    "raw",
    code_bytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const derived_key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    derived_key,
    recovery_key,
  );

  return {
    encrypted_key: array_to_base64(new Uint8Array(encrypted)),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

export async function decrypt_recovery_key_with_code(
  encrypted: EncryptedRecoveryKey,
  code: string,
): Promise<Uint8Array> {
  const normalized_code = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const code_bytes = new TextEncoder().encode(normalized_code);
  const encrypted_key = base64_to_array(encrypted.encrypted_key);
  const nonce = base64_to_array(encrypted.nonce);
  const salt = base64_to_array(encrypted.salt);

  const key_material = await crypto.subtle.importKey(
    "raw",
    code_bytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  const derived_key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    derived_key,
    encrypted_key,
  );

  return new Uint8Array(decrypted);
}

export async function hash_recovery_code(code: string): Promise<string> {
  const normalized_code = code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const code_bytes = new TextEncoder().encode(normalized_code);
  const hash = await crypto.subtle.digest("SHA-256", code_bytes);

  return array_to_base64(new Uint8Array(hash));
}

export async function generate_recovery_share_data(
  code: string,
  recovery_key: Uint8Array,
): Promise<RecoveryShareData> {
  const code_hash = await hash_recovery_code(code);
  const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);

  return {
    code_hash,
    code_salt: encrypted.salt,
    encrypted_recovery_key: encrypted.encrypted_key,
    recovery_key_nonce: encrypted.nonce,
  };
}

export async function generate_all_recovery_shares(
  codes: string[],
  recovery_key: Uint8Array,
): Promise<RecoveryShareData[]> {
  const shares: RecoveryShareData[] = [];

  for (const code of codes) {
    const share = await generate_recovery_share_data(code, recovery_key);

    shares.push(share);
  }

  return shares;
}

export function clear_recovery_key(recovery_key: Uint8Array): void {
  zero_uint8_array(recovery_key);
}
