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
import type { EncryptedVault } from "@/services/crypto/key_manager";

import { AccountKeyUnavailableError } from "@/services/crypto/account_data_writer";
import {
  array_to_base64,
  base64_to_array,
} from "@/services/crypto/key_manager_core";
import {
  get_account_data_base_keys,
  get_account_data_write_base_key,
} from "@/services/crypto/legacy_keks";
import { resolve_pq_identity_secret } from "@/services/crypto/ratchet_keys";
import { zero_uint8_array } from "@/services/crypto/secure_memory";

export const CALENDAR_BLOB_FORMAT_V3 = 3;
export const CALENDAR_V3_CONTEXT = "astermail-calendar-v2";

const FORMAT_V3_BYTE = 0x03;
const KEY_ID_BYTES = 16;
const NONCE_BYTES = 12;
const PQ_SECRET_BYTES = 2400;
const SALT_PREFIX = "astermail-calendar-v3-pq";
const KEY_INFO = "astermail-calendar-v3";
const KEY_ID_PREFIX = "astermail-calendar-v3-id";

export interface CalendarV3Binding {
  calendar_id: string;
  event_id?: string;
}

export interface CalendarV3Key {
  id: string;
  key: CryptoKey;
}

export interface CalendarV3Keyring {
  has_pq: boolean;
  write: CalendarV3Key | null;
  read: Map<string, CalendarV3Key>;
}

export interface CalendarV3Record {
  ciphertext: string;
  nonce: string;
}

export class CalendarKeyMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarKeyMissingError";
  }
}

function concat_bytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
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

function from_hex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);

  for (let index = 0; index < out.length; index += 1) {
    out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return out;
}

export function encode_binding_v3(binding: CalendarV3Binding): Uint8Array {
  if (!binding.calendar_id) {
    throw new Error("calendar binding requires a calendar id");
  }
  if (
    binding.calendar_id.includes("\n") ||
    (binding.event_id ?? "").includes("\n")
  ) {
    throw new Error("calendar binding ids must not contain line breaks");
  }

  const parts = [
    "event_id=" + (binding.event_id ?? ""),
    "calendar_id=" + binding.calendar_id,
    "version=" + String(CALENDAR_BLOB_FORMAT_V3),
  ];

  return new TextEncoder().encode(parts.join("\n"));
}

export async function calendar_pq_salt(
  pq_secret: Uint8Array,
): Promise<Uint8Array> {
  if (pq_secret.length !== PQ_SECRET_BYTES) {
    throw new Error("invalid post-quantum identity secret");
  }

  const material = concat_bytes(
    new TextEncoder().encode(SALT_PREFIX),
    pq_secret,
  );

  try {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", material));
  } finally {
    zero_uint8_array(material);
  }
}

export async function derive_calendar_v3_key(
  base: CryptoKey,
  salt: Uint8Array,
): Promise<CalendarV3Key> {
  const raw = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt,
        info: new TextEncoder().encode(KEY_INFO),
      },
      base,
      256,
    ),
  );
  const id_material = concat_bytes(
    new TextEncoder().encode(KEY_ID_PREFIX),
    raw,
  );

  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", id_material),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

    return { id: to_hex(digest.subarray(0, KEY_ID_BYTES)), key };
  } finally {
    zero_uint8_array(raw);
    zero_uint8_array(id_material);
  }
}

export async function derive_calendar_v3_key_from_raw(
  raw_base: Uint8Array,
  pq_secret: Uint8Array,
): Promise<CalendarV3Key> {
  const base = await crypto.subtle.importKey("raw", raw_base, "HKDF", false, [
    "deriveBits",
  ]);

  return derive_calendar_v3_key(base, await calendar_pq_salt(pq_secret));
}

export interface VaultPqState {
  current: Uint8Array | null;
  all: Uint8Array[];
  serial: number;
}

let vault_serial = 0;
const vault_pq_cache = new WeakMap<
  EncryptedVault,
  { fingerprint: string; state: VaultPqState }
>();

function vault_pq_fingerprint(vault: EncryptedVault): string {
  return [
    vault.ratchet_pq_identity_key ?? "",
    vault.ratchet_pq_identity_seed ?? "",
    ...(vault.ratchet_previous_keys ?? []).map(
      (previous) =>
        (previous.ratchet_pq_identity_key ?? "") +
        ":" +
        (previous.ratchet_pq_identity_seed ?? ""),
    ),
  ].join("|");
}

function decode_pq_secret(
  secret: string | undefined,
  seed: string | undefined,
): Uint8Array | null {
  try {
    const resolved = resolve_pq_identity_secret(secret ?? null, seed ?? null);

    if (!resolved) return null;

    const bytes = base64_to_array(resolved);

    return bytes.length === PQ_SECRET_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

export function vault_pq_secrets(vault: EncryptedVault): VaultPqState {
  const fingerprint = vault_pq_fingerprint(vault);
  const cached = vault_pq_cache.get(vault);

  if (cached && cached.fingerprint === fingerprint) return cached.state;

  const seen = new Set<string>();
  const all: Uint8Array[] = [];
  const remember = (bytes: Uint8Array | null): Uint8Array | null => {
    if (!bytes) return null;

    const fingerprint = array_to_base64(bytes);

    if (seen.has(fingerprint)) {
      return all.find((entry) => array_to_base64(entry) === fingerprint)!;
    }
    seen.add(fingerprint);
    all.push(bytes);

    return bytes;
  };
  const current = remember(
    decode_pq_secret(
      vault.ratchet_pq_identity_key,
      vault.ratchet_pq_identity_seed,
    ),
  );

  for (const previous of vault.ratchet_previous_keys ?? []) {
    remember(
      decode_pq_secret(
        previous.ratchet_pq_identity_key,
        previous.ratchet_pq_identity_seed,
      ),
    );
  }

  vault_serial += 1;

  const state: VaultPqState = {
    current: current ?? all[0] ?? null,
    all,
    serial: vault_serial,
  };

  vault_pq_cache.set(vault, { fingerprint, state });

  return state;
}

let key_serial = 0;
const key_serials = new WeakMap<CryptoKey, number>();

function key_serial_of(key: CryptoKey | null): number {
  if (!key) return 0;

  const existing = key_serials.get(key);

  if (existing) return existing;
  key_serial += 1;
  key_serials.set(key, key_serial);

  return key_serial;
}

let cached_signature: string | null = null;
let cached_keyring: Promise<CalendarV3Keyring> | null = null;

async function build_keyring(
  pq: VaultPqState,
  write_base: CryptoKey | null,
  bases: CryptoKey[],
): Promise<CalendarV3Keyring> {
  const salts = await Promise.all(
    pq.all.map((secret) => calendar_pq_salt(secret)),
  );
  const current_index = pq.current ? pq.all.indexOf(pq.current) : -1;
  const read = new Map<string, CalendarV3Key>();
  let write: CalendarV3Key | null = null;

  if (write_base && current_index >= 0) {
    write = await derive_calendar_v3_key(write_base, salts[current_index]);
    read.set(write.id, write);
  }

  for (const base of bases) {
    for (const salt of salts) {
      const derived = await derive_calendar_v3_key(base, salt);

      if (!read.has(derived.id)) read.set(derived.id, derived);
    }
  }

  return { has_pq: pq.all.length > 0, write, read };
}

export function clear_calendar_v3_keyring(): void {
  cached_keyring = null;
  cached_signature = null;
}

export function calendar_v3_keyring(
  vault: EncryptedVault,
): Promise<CalendarV3Keyring> {
  const pq = vault_pq_secrets(vault);
  const write_base = get_account_data_write_base_key(CALENDAR_V3_CONTEXT);
  const bases = get_account_data_base_keys(CALENDAR_V3_CONTEXT);
  const signature = [
    pq.serial,
    key_serial_of(write_base),
    ...bases.map((base) => key_serial_of(base)),
  ].join(":");

  if (cached_keyring && cached_signature === signature) return cached_keyring;

  const pending = build_keyring(pq, write_base, bases);

  cached_signature = signature;
  cached_keyring = pending;
  pending.catch(() => {
    if (cached_keyring === pending) {
      cached_keyring = null;
      cached_signature = null;
    }
  });

  return pending;
}

export async function calendar_v3_write_key(
  vault: EncryptedVault,
): Promise<CalendarV3Key | null> {
  const keyring = await calendar_v3_keyring(vault);

  if (!keyring.has_pq) return null;
  if (!keyring.write) {
    throw new AccountKeyUnavailableError("account key is not loaded");
  }

  return keyring.write;
}

export function v3_blob_key_id(ciphertext: string): string | null {
  try {
    const framed = base64_to_array(ciphertext);

    if (framed.length <= 1 + KEY_ID_BYTES || framed[0] !== FORMAT_V3_BYTE) {
      return null;
    }

    return to_hex(framed.subarray(1, 1 + KEY_ID_BYTES));
  } catch {
    return null;
  }
}

export function is_v3_blob(ciphertext: string): boolean {
  try {
    const framed = base64_to_array(ciphertext);

    return framed.length > 0 && framed[0] === FORMAT_V3_BYTE;
  } catch {
    return false;
  }
}

export async function encrypt_calendar_payload_v3(
  plaintext: Uint8Array,
  key: CalendarV3Key,
  binding: CalendarV3Binding,
): Promise<CalendarV3Record> {
  const aad = encode_binding_v3(binding);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad },
      key.key,
      plaintext,
    ),
  );

  return {
    ciphertext: array_to_base64(
      concat_bytes(
        new Uint8Array([FORMAT_V3_BYTE]),
        from_hex(key.id),
        ciphertext,
      ),
    ),
    nonce: array_to_base64(nonce),
  };
}

export async function decrypt_calendar_payload_v3(
  record: CalendarV3Record,
  keyring: CalendarV3Keyring,
  binding: CalendarV3Binding,
): Promise<{ plaintext: ArrayBuffer; current: boolean }> {
  const framed = base64_to_array(record.ciphertext);
  const nonce = base64_to_array(record.nonce);

  if (
    framed.length <= 1 + KEY_ID_BYTES ||
    framed[0] !== FORMAT_V3_BYTE ||
    nonce.length !== NONCE_BYTES
  ) {
    throw new Error("calendar blob is not a v3 record");
  }

  const id = to_hex(framed.subarray(1, 1 + KEY_ID_BYTES));
  const key = keyring.read.get(id);

  if (!key) {
    throw new CalendarKeyMissingError("calendar key is not available");
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encode_binding_v3(binding) },
    key.key,
    framed.subarray(1 + KEY_ID_BYTES),
  );

  return { plaintext, current: keyring.write?.id === id };
}
