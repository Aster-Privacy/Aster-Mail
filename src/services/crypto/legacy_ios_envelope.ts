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
import { get_current_account } from "@/services/account_manager";
import { get_user_salt } from "@/services/api/auth";
import {
  derive_password_hash,
  hash_email,
} from "@/services/crypto/key_manager_pgp_keygen";
import { get_passphrase_from_memory } from "@/services/crypto/memory_key_store";
import { base64_to_array } from "@/services/crypto/base64";
import { zero_uint8_array } from "@/services/crypto/secure_memory";
import { ignore_error } from "@/lib/ignore_error";

const LEGACY_NONCE_LENGTH = 12;
const MINIMUM_GCM_LENGTH = 16;

let cached_key: CryptoKey | null = null;
let cached_owner_id: string | null = null;
let cached_failure_owner_id: string | null = null;
let in_flight: Promise<CryptoKey | null> | null = null;

export function clear_legacy_ios_envelope_key(): void {
  cached_key = null;
  cached_owner_id = null;
  cached_failure_owner_id = null;
  in_flight = null;
}

async function derive_key(owner_id: string): Promise<CryptoKey | null> {
  const account = await get_current_account();
  const email = account?.user?.email;

  if (!email || account?.user?.id !== owner_id) return null;

  const passphrase = get_passphrase_from_memory();

  if (!passphrase) return null;

  const salt_response = await get_user_salt({
    user_hash: await hash_email(email),
  });

  if (salt_response.error || !salt_response.data?.salt) return null;

  const salt = base64_to_array(salt_response.data.salt);
  const { hash } = await derive_password_hash(passphrase, salt);
  const raw = base64_to_array(hash);

  try {
    return await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  } finally {
    zero_uint8_array(raw);
    zero_uint8_array(salt);
  }
}

async function load_key(): Promise<CryptoKey | null> {
  if (!get_passphrase_from_memory()) {
    clear_legacy_ios_envelope_key();

    return null;
  }

  const account = await get_current_account();
  const owner_id = account?.user?.id;

  if (!owner_id) return null;

  if (cached_key && cached_owner_id === owner_id) return cached_key;
  if (cached_failure_owner_id === owner_id) return null;
  if (in_flight) return in_flight;

  in_flight = derive_key(owner_id)
    .then((key) => {
      if (key) {
        cached_key = key;
        cached_owner_id = owner_id;
        cached_failure_owner_id = null;
      } else {
        cached_failure_owner_id = owner_id;
      }

      return key;
    })
    .catch((caught) => {
      ignore_error("services/crypto/legacy_ios_envelope:load_key", caught);
      cached_failure_owner_id = owner_id;

      return null;
    })
    .finally(() => {
      in_flight = null;
    });

  return in_flight;
}

export async function decrypt_legacy_ios_envelope(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
): Promise<ArrayBuffer | null> {
  if (nonce.length !== LEGACY_NONCE_LENGTH) return null;
  if (ciphertext.length <= MINIMUM_GCM_LENGTH) return null;

  const key = await load_key();

  if (!key) return null;

  try {
    return await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      ciphertext,
    );
  } catch {
    return null;
  }
}
