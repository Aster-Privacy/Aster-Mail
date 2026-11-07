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
import type { EncryptedVault } from "./key_manager_core";

import { array_to_base64, base64_to_array } from "./base64";
import {
  decrypt_envelope_v2_plaintext,
  encrypt_envelope_v2_bytes,
  envelope_v2_keys_from_vault,
  wipe_envelope_v2_keys,
} from "./envelope_v2";
import { zero_uint8_array } from "./secure_memory";

const META_NONCE_LENGTH = 12;
const META_V2_MARKER = 2;
const GCM_TAG_LENGTH = 16;

export const ATTACHMENT_META_V2_NONCE = array_to_base64(
  Uint8Array.from({ length: META_NONCE_LENGTH }, (_, i) =>
    i === 0 ? META_V2_MARKER : 0,
  ),
);

export function is_attachment_meta_v2_nonce(meta_nonce?: string | null): boolean {
  if (!meta_nonce) return false;

  let bytes: Uint8Array;

  try {
    bytes = base64_to_array(meta_nonce);
  } catch {
    return false;
  }

  return (
    bytes.length === META_NONCE_LENGTH &&
    bytes[0] === META_V2_MARKER &&
    bytes.subarray(1).every((byte) => byte === 0)
  );
}

export function may_be_password_attachment_meta(
  meta_nonce?: string | null,
): boolean {
  if (!meta_nonce || is_attachment_meta_v2_nonce(meta_nonce)) return false;

  try {
    const bytes = base64_to_array(meta_nonce);

    return bytes.length > 0 && bytes.some((byte) => byte !== 0);
  } catch {
    return false;
  }
}

export async function seal_attachment_meta_v2_text(
  plaintext: string,
  kek: Uint8Array,
): Promise<{ encrypted_meta: string; meta_nonce: string }> {
  const bytes = new TextEncoder().encode(plaintext);

  try {
    return {
      encrypted_meta: await encrypt_envelope_v2_bytes(bytes, kek),
      meta_nonce: ATTACHMENT_META_V2_NONCE,
    };
  } finally {
    zero_uint8_array(bytes);
  }
}

export function seal_attachment_meta_v2(
  meta: object,
  kek: Uint8Array,
): Promise<{ encrypted_meta: string; meta_nonce: string }> {
  return seal_attachment_meta_v2_text(JSON.stringify(meta), kek);
}

export async function open_attachment_meta_v2_text(
  encrypted_meta: string,
  vault: EncryptedVault | null | undefined,
): Promise<string | null> {
  const keys = envelope_v2_keys_from_vault(vault);

  if (keys.length === 0) return null;

  try {
    return await decrypt_envelope_v2_plaintext(encrypted_meta, keys);
  } catch {
    return null;
  } finally {
    wipe_envelope_v2_keys(keys);
  }
}

function decode_or_null(value: string): Uint8Array | null {
  try {
    return base64_to_array(value);
  } catch {
    return null;
  }
}

async function open_raw_kek_meta(
  encrypted_meta: string,
  meta_nonce: string,
  keys: Uint8Array[],
): Promise<string | null> {
  const iv = decode_or_null(meta_nonce);
  const data = decode_or_null(encrypted_meta);

  if (!iv || !data || iv.length !== META_NONCE_LENGTH) return null;
  if (data.length <= GCM_TAG_LENGTH) return null;

  for (const key of keys) {
    let plain: Uint8Array;

    try {
      const crypto_key = await crypto.subtle.importKey(
        "raw",
        key,
        "AES-GCM",
        false,
        ["decrypt"],
      );

      plain = new Uint8Array(
        await crypto.subtle.decrypt({ name: "AES-GCM", iv }, crypto_key, data),
      );
    } catch {
      continue;
    }

    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(plain);
    } catch {
      return null;
    } finally {
      zero_uint8_array(plain);
    }
  }

  return null;
}

export async function open_attachment_meta_kek_text(
  encrypted_meta: string,
  meta_nonce: string | null | undefined,
  vault: EncryptedVault | null | undefined,
): Promise<string | null> {
  const keys = envelope_v2_keys_from_vault(vault);

  if (keys.length === 0) return null;

  try {
    const v2 = await decrypt_envelope_v2_plaintext(encrypted_meta, keys).catch(
      () => null,
    );

    if (v2 !== null) return v2;
    if (!meta_nonce || is_attachment_meta_v2_nonce(meta_nonce)) return null;

    return await open_raw_kek_meta(encrypted_meta, meta_nonce, keys);
  } finally {
    wipe_envelope_v2_keys(keys);
  }
}

export async function open_attachment_meta_v2<T>(
  encrypted_meta: string,
  vault: EncryptedVault | null | undefined,
): Promise<T | null> {
  const text = await open_attachment_meta_v2_text(encrypted_meta, vault);

  if (text === null) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
