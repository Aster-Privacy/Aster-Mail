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
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64 } from "./base64";

const encoder = new TextEncoder();

export async function seal_legacy_escrow_entry(
  account_key: Uint8Array,
  escrow_public_key: Uint8Array,
  user_id: string,
  token_version: number,
  bind_aad = true,
): Promise<string> {
  const ephemeral_private = crypto.getRandomValues(new Uint8Array(32));
  const ephemeral_public = x25519.getPublicKey(ephemeral_private);
  const shared = x25519.getSharedSecret(ephemeral_private, escrow_public_key);
  const key = await crypto.subtle.importKey(
    "raw",
    hkdf(
      sha256,
      shared,
      escrow_public_key,
      encoder.encode("aster-recovery-escrow-seal-v1"),
      32,
    ),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = encoder.encode(
    `aster-recovery-escrow-v1|${user_id.trim().toLowerCase()}|${token_version}`,
  );
  const params: AesGcmParams = bind_aad
    ? { name: "AES-GCM", iv: nonce, additionalData: aad }
    : { name: "AES-GCM", iv: nonce };
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(params, key, account_key),
  );
  const sealed = new Uint8Array(32 + 12 + ciphertext.length);

  sealed.set(ephemeral_public, 0);
  sealed.set(nonce, 32);
  sealed.set(ciphertext, 44);

  return array_to_base64(sealed);
}
