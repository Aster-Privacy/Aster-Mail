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
import { array_to_base64 } from "./base64";
import {
  EncryptedVault,
  base64_to_array,
  normalize_vault_fields,
} from "./key_manager";
import {
  RecoveryBackupStaleError,
  read_recovery_backup_floor,
  type RecoveryBackupBinding,
} from "./recovery_backup_floor";
import { is_code_hash_optional } from "./recovery_code_capability";
import { zero_uint8_array } from "./secure_memory";

import { HASH_ALG } from "@/services/crypto/constants";

const PBKDF2_ITERATIONS = 310000;

const RECOVERY_CODE_SEGMENT_LENGTH = 4;
const RECOVERY_CODE_SEGMENT_COUNTS = [4, 3];

export function canonicalize_recovery_code(code: string): string {
  const stripped = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (stripped.startsWith("ASTER")) {
    const body = stripped.slice(5);

    for (const segment_count of RECOVERY_CODE_SEGMENT_COUNTS) {
      if (body.length !== segment_count * RECOVERY_CODE_SEGMENT_LENGTH) {
        continue;
      }

      const segments: string[] = [];

      for (let i = 0; i < segment_count; i++) {
        segments.push(
          body.slice(
            i * RECOVERY_CODE_SEGMENT_LENGTH,
            (i + 1) * RECOVERY_CODE_SEGMENT_LENGTH,
          ),
        );
      }

      return `ASTER-${segments.join("-")}`;
    }
  }

  return code.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

export function is_valid_recovery_code(code: string): boolean {
  const segments = canonicalize_recovery_code(code).split("-");

  if (segments[0] !== "ASTER") {
    return false;
  }

  if (!RECOVERY_CODE_SEGMENT_COUNTS.includes(segments.length - 1)) {
    return false;
  }

  return segments.slice(1).every((segment) => /^[A-Z0-9]{4}$/.test(segment));
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
  verifier_salt?: string;
  code_verifier?: string;
  code_salt: string;
  encrypted_recovery_key: string;
  recovery_key_nonce: string;
}

export function generate_recovery_key(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

const BACKUP_V1_INFO = "Aster Mail_Recovery_Vault_v1";
const BACKUP_V2_INFO = "Aster Mail_Recovery_Vault_v2";
const BACKUP_V2_AAD_LABEL = "aster-recovery-backup-v2";
const BACKUP_V2_MAGIC = [0x41, 0x52, 0x42, 0x02];
const BACKUP_V2_FIXED_HEADER = BACKUP_V2_MAGIC.length + 8 + 2;
const MAX_BACKUP_USER_ID_BYTES = 0xffff;

export interface OpenedVaultBackup {
  vault: EncryptedVault;
  generation: number;
  user_id: string;
}

interface BackupHeader {
  bytes: Uint8Array;
  generation: number;
  user_id: string;
}

function encode_backup_header(binding: RecoveryBackupBinding): Uint8Array {
  const user_id = new TextEncoder().encode(binding.user_id);

  if (user_id.length > MAX_BACKUP_USER_ID_BYTES) {
    throw new Error("recovery backup user id is too long");
  }

  if (!Number.isSafeInteger(binding.generation) || binding.generation < 0) {
    throw new Error("recovery backup generation is invalid");
  }

  const header = new Uint8Array(BACKUP_V2_FIXED_HEADER + user_id.length);
  const view = new DataView(header.buffer);

  header.set(BACKUP_V2_MAGIC, 0);
  view.setBigUint64(BACKUP_V2_MAGIC.length, BigInt(binding.generation));
  view.setUint16(BACKUP_V2_MAGIC.length + 8, user_id.length);
  header.set(user_id, BACKUP_V2_FIXED_HEADER);

  return header;
}

function parse_backup_header(data: Uint8Array): BackupHeader | null {
  if (data.length < BACKUP_V2_FIXED_HEADER) return null;

  if (!BACKUP_V2_MAGIC.every((byte, index) => data[index] === byte)) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const generation = view.getBigUint64(BACKUP_V2_MAGIC.length);
  const user_id_length = view.getUint16(BACKUP_V2_MAGIC.length + 8);
  const header_length = BACKUP_V2_FIXED_HEADER + user_id_length;

  if (generation > BigInt(Number.MAX_SAFE_INTEGER)) return null;

  if (data.length <= header_length) return null;

  return {
    bytes: data.slice(0, header_length),
    generation: Number(generation),
    user_id: new TextDecoder("utf-8", { fatal: true }).decode(
      data.slice(BACKUP_V2_FIXED_HEADER, header_length),
    ),
  };
}

function backup_aad(header: Uint8Array): Uint8Array {
  const label = new TextEncoder().encode(BACKUP_V2_AAD_LABEL);
  const aad = new Uint8Array(label.length + header.length);

  aad.set(label, 0);
  aad.set(header, label.length);

  return aad;
}

async function derive_backup_key(
  recovery_key: Uint8Array,
  salt: Uint8Array,
  info: string,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const hkdf_key = await crypto.subtle.importKey(
    "raw",
    recovery_key,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: HASH_ALG,
      salt,
      info: new TextEncoder().encode(info),
    },
    hkdf_key,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export async function encrypt_vault_backup(
  vault: EncryptedVault,
  recovery_key: Uint8Array,
  binding: RecoveryBackupBinding | null = null,
): Promise<VaultBackup> {
  if (!binding) return encrypt_v1_backup(vault, recovery_key);

  const header = encode_backup_header(binding);
  const vault_data = new TextEncoder().encode(
    JSON.stringify({
      ...vault,
      backup_generation: binding.generation,
      backup_user_id: binding.user_id,
    }),
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aes_key = await derive_backup_key(
    recovery_key,
    salt,
    BACKUP_V2_INFO,
    "encrypt",
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: backup_aad(header) },
      aes_key,
      vault_data,
    ),
  );
  const sealed = new Uint8Array(header.length + encrypted.length);

  sealed.set(header, 0);
  sealed.set(encrypted, header.length);

  return {
    encrypted_data: array_to_base64(sealed),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

async function encrypt_v1_backup(
  vault: EncryptedVault,
  recovery_key: Uint8Array,
): Promise<VaultBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aes_key = await derive_backup_key(
    recovery_key,
    salt,
    BACKUP_V1_INFO,
    "encrypt",
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes_key,
      new TextEncoder().encode(JSON.stringify(vault)),
    ),
  );

  return {
    encrypted_data: array_to_base64(encrypted),
    nonce: array_to_base64(nonce),
    salt: array_to_base64(salt),
  };
}

async function open_v2_backup(
  header: BackupHeader,
  encrypted_data: Uint8Array,
  nonce: Uint8Array,
  salt: Uint8Array,
  recovery_key: Uint8Array,
): Promise<OpenedVaultBackup | null> {
  const aes_key = await derive_backup_key(
    recovery_key,
    salt,
    BACKUP_V2_INFO,
    "decrypt",
  );
  let decrypted: ArrayBuffer;

  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: backup_aad(header.bytes),
      },
      aes_key,
      encrypted_data.slice(header.bytes.length),
    );
  } catch {
    return null;
  }

  const {
    backup_generation,
    backup_user_id,
    ...vault
  }: Record<string, unknown> = JSON.parse(new TextDecoder().decode(decrypted));

  if (
    backup_generation !== header.generation ||
    backup_user_id !== header.user_id
  ) {
    throw new Error("recovery backup binding does not match its header");
  }

  return {
    vault: normalize_vault_fields(vault as unknown as EncryptedVault),
    generation: header.generation,
    user_id: header.user_id,
  };
}

export async function read_vault_backup(
  backup: VaultBackup,
  recovery_key: Uint8Array,
): Promise<OpenedVaultBackup> {
  const encrypted_data = base64_to_array(backup.encrypted_data);
  const nonce = base64_to_array(backup.nonce);
  const salt = base64_to_array(backup.salt);
  const header = parse_backup_header(encrypted_data);

  if (header) {
    const opened = await open_v2_backup(
      header,
      encrypted_data,
      nonce,
      salt,
      recovery_key,
    );

    if (opened) return opened;
  }

  const aes_key = await derive_backup_key(
    recovery_key,
    salt,
    BACKUP_V1_INFO,
    "decrypt",
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aes_key,
    encrypted_data,
  );

  return {
    vault: normalize_vault_fields(
      JSON.parse(new TextDecoder().decode(decrypted)),
    ),
    generation: 0,
    user_id: "",
  };
}

export async function decrypt_vault_backup(
  backup: VaultBackup,
  recovery_key: Uint8Array,
): Promise<EncryptedVault> {
  return (await read_vault_backup(backup, recovery_key)).vault;
}

export async function open_recovery_backup(
  backup: VaultBackup,
  recovery_key: Uint8Array,
  expected_user_id: string | null,
): Promise<OpenedVaultBackup> {
  const opened = await read_vault_backup(backup, recovery_key);

  if (expected_user_id && opened.user_id && opened.user_id !== expected_user_id) {
    throw new RecoveryBackupStaleError();
  }

  const user_id = opened.user_id || expected_user_id || "";

  if (opened.generation < read_recovery_backup_floor(user_id)) {
    throw new RecoveryBackupStaleError();
  }

  return { ...opened, user_id };
}

export async function encrypt_recovery_key_with_code(
  recovery_key: Uint8Array,
  code: string,
): Promise<EncryptedRecoveryKey> {
  const normalized_code = canonicalize_recovery_code(code);
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
      hash: HASH_ALG,
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
  const normalized_code = canonicalize_recovery_code(code);
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
      hash: HASH_ALG,
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
  const normalized_code = canonicalize_recovery_code(code);
  const code_bytes = new TextEncoder().encode(normalized_code);
  const hash = await crypto.subtle.digest(HASH_ALG, code_bytes);

  return array_to_base64(new Uint8Array(hash));
}

const STORED_VERIFIER_TAG = new TextEncoder().encode("ARV2");
const STORED_VERIFIER_DOMAIN = new TextEncoder().encode(
  "aster-recovery-verifier-v2",
);

export async function stored_recovery_verifier(
  code_hash: string,
): Promise<string> {
  const hash_bytes = base64_to_array(code_hash);
  const input = new Uint8Array(
    STORED_VERIFIER_DOMAIN.length + hash_bytes.length,
  );

  input.set(STORED_VERIFIER_DOMAIN, 0);
  input.set(hash_bytes, STORED_VERIFIER_DOMAIN.length);
  const digest = new Uint8Array(await crypto.subtle.digest(HASH_ALG, input));
  const out = new Uint8Array(STORED_VERIFIER_TAG.length + digest.length);

  out.set(STORED_VERIFIER_TAG, 0);
  out.set(digest, STORED_VERIFIER_TAG.length);

  return array_to_base64(out);
}

const SALTED_VERIFIER_TAG = new TextEncoder().encode("ARV3");
const SALTED_VERIFIER_DOMAIN = new TextEncoder().encode(
  "aster-recovery-verifier-v3",
);
const VERIFIER_SALT_BYTES = 16;
const CODE_VERIFIER_BYTES = 32;
const SALTED_VERIFIER_BYTES =
  SALTED_VERIFIER_TAG.length + VERIFIER_SALT_BYTES + CODE_VERIFIER_BYTES;

export interface VerifierCandidate {
  verifier_salt: string;
  code_verifier: string;
}

function concat_bytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

export function generate_verifier_salt(): string {
  return array_to_base64(
    crypto.getRandomValues(new Uint8Array(VERIFIER_SALT_BYTES)),
  );
}

export async function derive_code_verifier(
  code_hash: string,
  verifier_salt: string,
): Promise<string> {
  const salt = base64_to_array(verifier_salt);

  if (salt.length !== VERIFIER_SALT_BYTES) {
    throw new Error("invalid verifier salt");
  }

  const digest = new Uint8Array(
    await crypto.subtle.digest(
      HASH_ALG,
      concat_bytes(STORED_VERIFIER_DOMAIN, base64_to_array(code_hash)),
    ),
  );
  const digest_hex = new TextEncoder().encode(to_hex(digest));
  const key_material = await crypto.subtle.importKey(
    "raw",
    digest_hex,
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALG,
    },
    key_material,
    CODE_VERIFIER_BYTES * 8,
  );

  zero_uint8_array(digest);
  zero_uint8_array(digest_hex);

  return array_to_base64(new Uint8Array(bits));
}

export async function salted_recovery_verifier(
  code_hash: string,
  verifier_salt: string,
): Promise<string> {
  const salt = base64_to_array(verifier_salt);
  const code_verifier = base64_to_array(
    await derive_code_verifier(code_hash, verifier_salt),
  );
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      HASH_ALG,
      concat_bytes(SALTED_VERIFIER_DOMAIN, salt, code_verifier),
    ),
  );

  return array_to_base64(concat_bytes(SALTED_VERIFIER_TAG, salt, digest));
}

export function stored_verifier_salt(stored: string): string | null {
  let bytes: Uint8Array;

  try {
    bytes = base64_to_array(stored);
  } catch {
    return null;
  }

  if (bytes.length !== SALTED_VERIFIER_BYTES) return null;

  for (let i = 0; i < SALTED_VERIFIER_TAG.length; i++) {
    if (bytes[i] !== SALTED_VERIFIER_TAG[i]) return null;
  }

  return array_to_base64(
    bytes.slice(
      SALTED_VERIFIER_TAG.length,
      SALTED_VERIFIER_TAG.length + VERIFIER_SALT_BYTES,
    ),
  );
}

export async function build_verifier_candidates(
  code_hash: string,
  verifier_salts: readonly unknown[] | null | undefined,
): Promise<VerifierCandidate[]> {
  const candidates: VerifierCandidate[] = [];
  const seen = new Set<string>();

  for (const verifier_salt of verifier_salts ?? []) {
    if (typeof verifier_salt !== "string" || seen.has(verifier_salt)) continue;
    seen.add(verifier_salt);

    try {
      candidates.push({
        verifier_salt,
        code_verifier: await derive_code_verifier(code_hash, verifier_salt),
      });
    } catch {
      continue;
    }
  }

  return candidates;
}

export async function matches_stored_code(
  code_hash: string,
  stored_hashes: ReadonlySet<string>,
): Promise<boolean> {
  if (stored_hashes.has(code_hash)) return true;
  if (stored_hashes.has(await stored_recovery_verifier(code_hash))) return true;

  const salts = new Set<string>();

  for (const stored of stored_hashes) {
    const salt = stored_verifier_salt(stored);

    if (salt) salts.add(salt);
  }

  for (const salt of salts) {
    if (stored_hashes.has(await salted_recovery_verifier(code_hash, salt))) {
      return true;
    }
  }

  return false;
}

export interface RecoveryShareOptions {
  verifier_salt?: string | null;
  include_code_hash?: boolean;
}

export async function generate_recovery_share_data(
  code: string,
  recovery_key: Uint8Array,
  options: RecoveryShareOptions = {},
): Promise<RecoveryShareData> {
  const code_hash = await hash_recovery_code(code);
  const encrypted = await encrypt_recovery_key_with_code(recovery_key, code);
  const verifier_salt = options.verifier_salt ?? generate_verifier_salt();
  const include_code_hash =
    options.include_code_hash ?? !is_code_hash_optional();

  return {
    code_hash: include_code_hash ? code_hash : "",
    verifier_salt,
    code_verifier: await derive_code_verifier(code_hash, verifier_salt),
    code_salt: encrypted.salt,
    encrypted_recovery_key: encrypted.encrypted_key,
    recovery_key_nonce: encrypted.nonce,
  };
}

export async function generate_all_recovery_shares(
  codes: string[],
  recovery_key: Uint8Array,
  options: RecoveryShareOptions = {},
): Promise<RecoveryShareData[]> {
  const shares: RecoveryShareData[] = [];
  const set_options = {
    ...options,
    verifier_salt: options.verifier_salt ?? generate_verifier_salt(),
  };

  for (const code of codes) {
    const share = await generate_recovery_share_data(
      code,
      recovery_key,
      set_options,
    );

    shares.push(share);
  }

  return shares;
}

export function clear_recovery_key(recovery_key: Uint8Array): void {
  zero_uint8_array(recovery_key);
}
