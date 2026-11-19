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
export const SEAL_PREKEY_SECRETS_WITH_KEY_ID: boolean = false;

export type PrekeySecretKind = "ec" | "pq";

export function is_prekey_secret_key_binding_enabled(): boolean {
  const raw: unknown = import.meta.env.VITE_SEAL_PREKEY_SECRETS_WITH_KEY_ID;

  return SEAL_PREKEY_SECRETS_WITH_KEY_ID || raw === "1" || raw === "true";
}

export function prekey_secret_binding(
  kind: PrekeySecretKind,
  key_id: number,
): Uint8Array {
  return new TextEncoder().encode(`aster-prekey-secret:${kind}:v1:${key_id}`);
}

export async function seal_prekey_secret(
  kind: PrekeySecretKind,
  key_id: number,
  secret: Uint8Array,
  sync_key: CryptoKey,
): Promise<{ encrypted_secret: Uint8Array; secret_nonce: Uint8Array }> {
  const secret_nonce = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = is_prekey_secret_key_binding_enabled()
    ? {
        name: "AES-GCM",
        iv: secret_nonce,
        additionalData: prekey_secret_binding(kind, key_id),
      }
    : { name: "AES-GCM", iv: secret_nonce };
  const ciphertext = await crypto.subtle.encrypt(params, sync_key, secret);

  return { encrypted_secret: new Uint8Array(ciphertext), secret_nonce };
}

export async function open_prekey_secret(
  kind: PrekeySecretKind,
  key_id: number,
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  sync_key: CryptoKey,
): Promise<{ secret: Uint8Array; bound: boolean }> {
  try {
    const bound = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonce,
        additionalData: prekey_secret_binding(kind, key_id),
      },
      sync_key,
      ciphertext,
    );

    return { secret: new Uint8Array(bound), bound: true };
  } catch {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce },
      sync_key,
      ciphertext,
    );

    return { secret: new Uint8Array(plain), bound: false };
  }
}
