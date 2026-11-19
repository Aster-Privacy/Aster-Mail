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
import { get_account_key_capabilities } from "../api/account_key";
import { array_to_base64, base64_to_array } from "./base64";
import { decrypt_aes_gcm_with_fallback } from "./legacy_keks";
import { get_storage_write_crypto_key } from "./storage_write_key";

export const SEALED_PASSKEY_NAME_PREFIX = "an1:";

const NAME_TAG = "aster-passkey-name-v1\u0000";
const NONCE_LENGTH = 12;
const MIN_SEALED_LENGTH = NONCE_LENGTH + 16;

export function is_sealed_passkey_name(stored: string | null): boolean {
  return !!stored && stored.startsWith(SEALED_PASSKEY_NAME_PREFIX);
}

export async function seal_passkey_name(name: string): Promise<string> {
  const key = await get_storage_write_crypto_key();

  if (!key) throw new Error("storage key unavailable");

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      new TextEncoder().encode(NAME_TAG + name),
    ),
  );
  const packed = new Uint8Array(NONCE_LENGTH + sealed.length);

  packed.set(nonce, 0);
  packed.set(sealed, NONCE_LENGTH);

  return SEALED_PASSKEY_NAME_PREFIX + array_to_base64(packed);
}

export async function passkey_name_for_server(
  name: string | null,
): Promise<string | null> {
  if (!name) return null;

  const capabilities = await get_account_key_capabilities();

  if (!capabilities.sealed_passkey_names) return name;

  try {
    return await seal_passkey_name(name);
  } catch {
    return name;
  }
}

export async function open_passkey_name(
  stored: string | null,
): Promise<string | null> {
  if (!stored) return null;
  if (!is_sealed_passkey_name(stored)) return stored;

  try {
    const packed = base64_to_array(
      stored.slice(SEALED_PASSKEY_NAME_PREFIX.length),
    );

    if (packed.length < MIN_SEALED_LENGTH) return null;

    const key = await get_storage_write_crypto_key();

    if (!key) return null;

    const opened = new TextDecoder("utf-8", { fatal: true }).decode(
      await decrypt_aes_gcm_with_fallback(
        key,
        packed.slice(NONCE_LENGTH),
        packed.slice(0, NONCE_LENGTH),
      ),
    );

    if (!opened.startsWith(NAME_TAG)) return null;

    return opened.slice(NAME_TAG.length);
  } catch {
    return null;
  }
}
