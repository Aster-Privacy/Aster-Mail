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

import { base64_to_array } from "./base64";
import { constant_time_equals, is_known_login_salt } from "./auth_salt_guard";
import { HASH_ALG } from "./constants";
import { PBKDF2_ITERATIONS } from "./envelope";
import { without_retired_keks } from "./retired_identity_keks";
import { mark_legacy_unverified_plaintext } from "./sent_encryption_evidence";
import { zero_uint8_array } from "./secure_memory";

const SALT_LENGTH = 16;
const NONCE_LENGTH = 12;
const KEY_BITS = 256;

function decode_or_null(value: string): Uint8Array | null {
  try {
    return base64_to_array(value);
  } catch {
    return null;
  }
}

export function vault_holds_key(
  vault: Pick<EncryptedVault, "legacy_keks"> | null | undefined,
  key: Uint8Array,
): boolean {
  let held_somewhere = false;

  for (const entry of without_retired_keks(vault?.legacy_keks)) {
    const held = decode_or_null(entry.k);

    if (!held) continue;
    if (constant_time_equals(held, key)) held_somewhere = true;
    zero_uint8_array(held);
  }

  return held_somewhere;
}

async function derive_login_salted_key(
  passphrase_bytes: Uint8Array,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    passphrase_bytes,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: HASH_ALG },
      material,
      KEY_BITS,
    ),
  );
}

export async function open_vouched_login_salted_envelope(
  encrypted_b64: string,
  passphrase_bytes: Uint8Array,
  vault: Pick<EncryptedVault, "legacy_keks"> | null | undefined,
): Promise<string | null> {
  const combined = decode_or_null(encrypted_b64);

  if (!combined || combined.length <= SALT_LENGTH + NONCE_LENGTH) return null;

  const salt = combined.slice(0, SALT_LENGTH);

  if (!is_known_login_salt(salt) || passphrase_bytes.length === 0) return null;

  let raw: Uint8Array | null = null;
  let opened: Uint8Array | null = null;
  let marked: Uint8Array | null = null;

  try {
    raw = await derive_login_salted_key(passphrase_bytes, salt);
    if (!vault_holds_key(vault, raw)) return null;

    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    opened = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: combined.slice(SALT_LENGTH, SALT_LENGTH + NONCE_LENGTH),
        },
        key,
        combined.slice(SALT_LENGTH + NONCE_LENGTH),
      ),
    );

    new TextDecoder("utf-8", { fatal: true }).decode(opened);
    marked = mark_legacy_unverified_plaintext(opened);

    return marked ? new TextDecoder().decode(marked) : null;
  } catch {
    return null;
  } finally {
    if (raw) zero_uint8_array(raw);
    if (opened) zero_uint8_array(opened);
    if (marked) zero_uint8_array(marked);
  }
}
