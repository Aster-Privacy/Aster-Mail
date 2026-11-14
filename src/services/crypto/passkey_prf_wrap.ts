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
const WRAP_KEY_SALT = "aster-vault-passphrase-key-v1";
const BOUND_WRAP_KEY_SALT = "aster-vault-passphrase-key-v2";
const BOUND_WRAP_LABEL = "aster-vault-prf-wrap-v2|";
const WRAP_NONCE_LENGTH = 12;
const AUTHENTICATOR_FLAGS_OFFSET = 32;
const USER_VERIFIED_FLAG = 0x04;

export interface PrfWrappedPassphrase {
  encrypted: string;
  nonce: string;
}

function to_base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""));
}

function from_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function bound_wrap_aad(credential_id: Uint8Array): Uint8Array {
  const label = new TextEncoder().encode(BOUND_WRAP_LABEL);
  const aad = new Uint8Array(label.length + credential_id.length);

  aad.set(label);
  aad.set(credential_id, label.length);

  return aad;
}

async function derive_wrap_key(
  prf_output: ArrayBuffer,
  salt: string,
  usage: KeyUsage,
): Promise<CryptoKey> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    prf_output,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      info: new Uint8Array(0),
    },
    key_material,
    { name: "AES-GCM", length: 256 },
    false,
    [usage],
  );
}

export function assertion_verified_user(
  authenticator_data: ArrayBuffer,
): boolean {
  const bytes = new Uint8Array(authenticator_data);

  return (
    bytes.length > AUTHENTICATOR_FLAGS_OFFSET &&
    (bytes[AUTHENTICATOR_FLAGS_OFFSET] & USER_VERIFIED_FLAG) !== 0
  );
}

export async function seal_passphrase_with_prf(
  prf_output: ArrayBuffer,
  passphrase: string,
  credential_id: Uint8Array,
): Promise<PrfWrappedPassphrase | null> {
  if (credential_id.length === 0) return null;

  try {
    const key = await derive_wrap_key(
      prf_output,
      BOUND_WRAP_KEY_SALT,
      "encrypt",
    );
    const nonce = crypto.getRandomValues(new Uint8Array(WRAP_NONCE_LENGTH));
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: bound_wrap_aad(credential_id),
      },
      key,
      new TextEncoder().encode(passphrase),
    );

    return {
      encrypted: to_base64(new Uint8Array(encrypted)),
      nonce: to_base64(nonce),
    };
  } catch {
    return null;
  }
}

async function open_bound_wrap(
  prf_output: ArrayBuffer,
  encrypted: Uint8Array,
  nonce: Uint8Array,
  credential_id: Uint8Array,
): Promise<string | null> {
  try {
    const key = await derive_wrap_key(
      prf_output,
      BOUND_WRAP_KEY_SALT,
      "decrypt",
    );
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: bound_wrap_aad(credential_id),
      },
      key,
      encrypted,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

async function open_unbound_wrap(
  prf_output: ArrayBuffer,
  encrypted: Uint8Array,
  nonce: Uint8Array,
): Promise<string | null> {
  try {
    const key = await derive_wrap_key(prf_output, WRAP_KEY_SALT, "decrypt");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      encrypted,
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

export async function open_passphrase_with_prf(
  prf_output: ArrayBuffer,
  encrypted_b64: string,
  nonce_b64: string,
  credential_id: Uint8Array | null,
): Promise<string | null> {
  let encrypted: Uint8Array;
  let nonce: Uint8Array;

  try {
    encrypted = from_base64(encrypted_b64);
    nonce = from_base64(nonce_b64);
  } catch {
    return null;
  }

  if (credential_id && credential_id.length > 0) {
    const bound = await open_bound_wrap(
      prf_output,
      encrypted,
      nonce,
      credential_id,
    );

    if (bound !== null) return bound;
  }

  return open_unbound_wrap(prf_output, encrypted, nonce);
}
