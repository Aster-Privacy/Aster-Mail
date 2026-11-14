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
import type { CalendarV3Key } from "@/services/calendar/calendar_crypto_v3";

import {
  CALENDAR_BLOB_FORMAT_V3,
  calendar_v3_keyring,
  calendar_v3_write_key,
  decrypt_calendar_payload_v3,
  encrypt_calendar_payload_v3,
  is_v3_blob,
} from "@/services/calendar/calendar_crypto_v3";
import { AccountKeyUnavailableError } from "@/services/crypto/account_data_writer";
import {
  array_to_base64,
  base64_to_array,
} from "@/services/crypto/key_manager_core";
import {
  get_account_data_crypto_keys,
  get_account_data_write_key,
} from "@/services/crypto/legacy_keks";

export const CALENDAR_KEY_CONTEXT = "astermail-calendar-v2";
export const CALENDAR_BLOB_FORMAT_V1 = 1;
export const CALENDAR_BLOB_FORMAT_V2 = 2;
export { CALENDAR_BLOB_FORMAT_V3 };

const FORMAT_V2_BYTE = 0x02;
const NONCE_BYTES = 12;

export type CalendarBlobFormat =
  | typeof CALENDAR_BLOB_FORMAT_V1
  | typeof CALENDAR_BLOB_FORMAT_V2
  | typeof CALENDAR_BLOB_FORMAT_V3;

export type CalendarWriteKey =
  | { format: typeof CALENDAR_BLOB_FORMAT_V3; key: CalendarV3Key }
  | { format: typeof CALENDAR_BLOB_FORMAT_V2; key: CryptoKey };

export interface CalendarBinding {
  calendar_id: string;
  event_id?: string;
}

export interface EncryptedRecord {
  ciphertext: string;
  nonce: string;
  format: CalendarBlobFormat;
}

export interface DecryptedRecord<T> {
  payload: T;
  format: CalendarBlobFormat;
  bound: boolean;
  current: boolean;
}

export function encode_binding(binding: CalendarBinding): Uint8Array {
  if (
    binding.calendar_id.includes("\n") ||
    (binding.event_id ?? "").includes("\n")
  ) {
    throw new Error("calendar binding ids must not contain line breaks");
  }

  const parts = [
    "event_id=" + (binding.event_id ?? ""),
    "calendar_id=" + binding.calendar_id,
    "version=" + String(CALENDAR_BLOB_FORMAT_V2),
  ];

  return new TextEncoder().encode(parts.join("\n"));
}

const V3_FLOOR_STORAGE_PREFIX = "aster_calendar_v3_floor:";

let v3_floor_active = false;

function stored_v3_floor(account_id: string): boolean {
  try {
    return (
      window.localStorage.getItem(V3_FLOOR_STORAGE_PREFIX + account_id) === "1"
    );
  } catch {
    return false;
  }
}

function store_v3_floor(account_id: string): void {
  try {
    window.localStorage.setItem(V3_FLOOR_STORAGE_PREFIX + account_id, "1");
  } catch {
    return;
  }
}

export function set_calendar_v3_floor(
  active: boolean,
  account_id?: string | null,
): void {
  if (!account_id) {
    v3_floor_active = active;

    return;
  }
  if (active) {
    store_v3_floor(account_id);
    v3_floor_active = true;

    return;
  }
  v3_floor_active = stored_v3_floor(account_id);
}

export function calendar_v3_floor(): boolean {
  return v3_floor_active;
}

export async function calendar_write_key(
  vault: EncryptedVault,
): Promise<CalendarWriteKey | null> {
  try {
    const keyring = await calendar_v3_keyring(vault);

    if (keyring.has_pq) {
      return keyring.write
        ? { format: CALENDAR_BLOB_FORMAT_V3, key: keyring.write }
        : null;
    }

    const key = get_account_data_write_key(CALENDAR_KEY_CONTEXT);

    return key ? { format: CALENDAR_BLOB_FORMAT_V2, key } : null;
  } catch {
    return null;
  }
}

async function strict_write_key(
  vault: EncryptedVault,
): Promise<CalendarWriteKey | null> {
  const v3_key = await calendar_v3_write_key(vault);

  if (v3_key) return { format: CALENDAR_BLOB_FORMAT_V3, key: v3_key };

  const key = get_account_data_write_key(CALENDAR_KEY_CONTEXT);

  if (!key) {
    throw new AccountKeyUnavailableError("account key is not loaded");
  }

  return { format: CALENDAR_BLOB_FORMAT_V2, key };
}

function serialize_payload<T>(payload: T): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

function parse_payload<T>(bytes: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function encrypt_calendar_payload_v2<T>(
  payload: T,
  key: CryptoKey,
  binding: CalendarBinding,
): Promise<EncryptedRecord> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce, additionalData: encode_binding(binding) },
      key,
      serialize_payload(payload),
    ),
  );
  const framed = new Uint8Array(ciphertext.length + 1);

  framed[0] = FORMAT_V2_BYTE;
  framed.set(ciphertext, 1);

  return {
    ciphertext: array_to_base64(framed),
    nonce: array_to_base64(nonce),
    format: CALENDAR_BLOB_FORMAT_V2,
  };
}

export async function encrypt_calendar_payload<T>(
  payload: T,
  vault: EncryptedVault,
  binding: CalendarBinding,
  key: CalendarWriteKey | null = null,
): Promise<EncryptedRecord> {
  const write_key = key ?? (await strict_write_key(vault));

  if (write_key?.format === CALENDAR_BLOB_FORMAT_V3) {
    const record = await encrypt_calendar_payload_v3(
      serialize_payload(payload),
      write_key.key,
      binding,
    );

    return { ...record, format: CALENDAR_BLOB_FORMAT_V3 };
  }

  if (write_key) {
    return encrypt_calendar_payload_v2(payload, write_key.key, binding);
  }

  throw new AccountKeyUnavailableError("calendar write key is not loaded");
}

async function try_decrypt_v2(
  keys: CryptoKey[],
  body: Uint8Array,
  nonce: Uint8Array,
  binding: CalendarBinding,
): Promise<ArrayBuffer | null> {
  const aad = encode_binding(binding);

  for (const key of keys) {
    try {
      return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce, additionalData: aad },
        key,
        body,
      );
    } catch {
      continue;
    }
  }

  return null;
}

export async function decrypt_calendar_payload_v2<T>(
  record: Pick<EncryptedRecord, "ciphertext" | "nonce">,
  keys: CryptoKey[],
  binding: CalendarBinding,
): Promise<DecryptedRecord<T>> {
  const framed = base64_to_array(record.ciphertext);
  const nonce = base64_to_array(record.nonce);

  if (
    framed.length === 0 ||
    framed[0] !== FORMAT_V2_BYTE ||
    keys.length === 0
  ) {
    throw new Error("calendar blob is not a v2 record");
  }

  const body = framed.subarray(1);
  const bound = await try_decrypt_v2(keys, body, nonce, binding);

  if (bound) {
    return {
      payload: parse_payload<T>(bound),
      format: 2,
      bound: true,
      current: false,
    };
  }

  throw new Error("calendar blob rejected");
}

export async function decrypt_calendar_payload<T>(
  record: Pick<EncryptedRecord, "ciphertext" | "nonce">,
  vault: EncryptedVault,
  binding: CalendarBinding,
  keys: CryptoKey[] = get_account_data_crypto_keys(CALENDAR_KEY_CONTEXT),
): Promise<DecryptedRecord<T>> {
  if (is_v3_blob(record.ciphertext)) {
    const keyring = await calendar_v3_keyring(vault);
    const result = await decrypt_calendar_payload_v3(record, keyring, binding);

    return {
      payload: parse_payload<T>(result.plaintext),
      format: CALENDAR_BLOB_FORMAT_V3,
      bound: true,
      current: result.current,
    };
  }

  return decrypt_calendar_payload_v2<T>(record, keys, binding);
}
