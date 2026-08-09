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
import { HASH_ALG } from "@/services/crypto/constants";
import type { } from "../key_manager";
import { api_client } from "@/services/api/client";
import type { } from "@/services/api/signatures";
import type { } from "@/services/api/templates";
import type { } from "@/services/api/blocked_senders";
import type { } from "@/services/api/allowed_senders";
import {
  re_encrypt_field_with_candidates,
} from "../reencrypt_shared";


export async function import_aes_key(
  raw: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function derive_hmac_key(
  raw: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const info_bytes = new TextEncoder().encode(info);
  const combined = new Uint8Array(raw.byteLength + info_bytes.length);

  combined.set(raw, 0);
  combined.set(info_bytes, raw.byteLength);

  const hash = await crypto.subtle.digest(HASH_ALG, combined);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "HMAC", hash: HASH_ALG },
    false,
    ["sign"],
  );
}

export async function re_encrypt_field(
  enc_b64: string,
  nonce_b64: string,
  old_key: CryptoKey,
  new_key: CryptoKey,
): Promise<{ encrypted: string; nonce: string }> {
  return re_encrypt_field_with_candidates(enc_b64, nonce_b64, [old_key], new_key);
}

export type FieldPair = [encrypted_field: string, nonce_field: string];

export async function re_encrypt_collection<T>(
  items: T[],
  fields: FieldPair[],
  old_aes: CryptoKey,
  new_aes: CryptoKey,
  update: (item: T, patch: Record<string, string>) => Promise<unknown>,
): Promise<boolean> {
  let ok = true;

  for (const item of items) {
    try {
      const source = item as Record<string, string>;
      const patch: Record<string, string> = {};

      await Promise.all(
        fields.map(async ([encrypted_field, nonce_field]) => {
          const result = await re_encrypt_field(
            source[encrypted_field],
            source[nonce_field],
            old_aes,
            new_aes,
          );

          patch[encrypted_field] = result.encrypted;
          patch[nonce_field] = result.nonce;
        }),
      );

      await update(item, patch);
    } catch {
      ok = false;
      continue;
    }
  }

  return ok;
}

export async function identity_scoped_key_pair(
  old_identity_key: string,
  new_identity_key: string,
  suffix: string,
): Promise<{ old_key: CryptoKey; new_key: CryptoKey }> {
  const digest = (identity_key: string) =>
    crypto.subtle.digest(
      HASH_ALG,
      new TextEncoder().encode(identity_key + suffix),
    );

  const [old_raw_hash, new_raw_hash] = await Promise.all([
    digest(old_identity_key),
    digest(new_identity_key),
  ]);

  const [old_key, new_key] = await Promise.all([
    crypto.subtle.importKey(
      "raw",
      old_raw_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    ),
    crypto.subtle.importKey(
      "raw",
      new_raw_hash,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    ),
  ]);

  return { old_key, new_key };
}

export async function re_encrypt_identity_scoped_setting(
  endpoint: string,
  suffix: string,
  [encrypted_field, nonce_field]: FieldPair,
  old_identity_key: string,
  new_identity_key: string,
): Promise<void> {
  if (old_identity_key === new_identity_key) return;

  const resp =
    await api_client.get<Record<string, string | null>>(endpoint);

  if (resp.error || !resp.data) return;

  const encrypted_value = resp.data[encrypted_field];
  const nonce_value = resp.data[nonce_field];

  if (!encrypted_value || !nonce_value) return;

  const { old_key, new_key } = await identity_scoped_key_pair(
    old_identity_key,
    new_identity_key,
    suffix,
  );

  const { encrypted, nonce } = await re_encrypt_field(
    encrypted_value,
    nonce_value,
    old_key,
    new_key,
  );

  await api_client.put(endpoint, {
    [encrypted_field]: encrypted,
    [nonce_field]: nonce,
  });
}

