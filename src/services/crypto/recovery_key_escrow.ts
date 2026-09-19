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

import { ACCOUNT_KEY_LENGTH } from "./account_data_key";
import { array_to_base64 } from "./base64";
import { base64_to_array } from "./key_manager";
import { zero_uint8_array } from "./secure_memory";

export const ESCROW_SEED_LENGTH = 32;
export const ESCROW_PUBLIC_KEY_LENGTH = 32;
export const ESCROW_SEALED_LENGTH = 92;

const EPHEMERAL_PUBLIC_KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const KEY_INFO = "aster-recovery-escrow-key-v1";
const SEAL_INFO = "aster-recovery-escrow-seal-v1";
const AAD_PREFIX = "aster-recovery-escrow-v1";

const encoder = new TextEncoder();

export interface EscrowKeypair {
  private_key: Uint8Array;
  public_key: Uint8Array;
}

export function generate_escrow_seed(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(ESCROW_SEED_LENGTH));
}

export function encode_escrow_seed(seed: Uint8Array): string {
  return array_to_base64(seed);
}

export function decode_escrow_seed(encoded: string): Uint8Array | null {
  let seed: Uint8Array;

  try {
    seed = base64_to_array(encoded);
  } catch {
    return null;
  }

  if (seed.length !== ESCROW_SEED_LENGTH) {
    zero_uint8_array(seed);

    return null;
  }

  return seed;
}

export function derive_escrow_keypair(
  seed: Uint8Array,
  user_id: string,
): EscrowKeypair {
  if (seed.length !== ESCROW_SEED_LENGTH) {
    throw new Error("escrow seed must be 32 bytes");
  }

  const normalized_user_id = user_id.trim().toLowerCase();

  if (!normalized_user_id) {
    throw new Error("user_id is required");
  }

  const private_key = hkdf(
    sha256,
    seed,
    encoder.encode(KEY_INFO),
    encoder.encode(normalized_user_id),
    ESCROW_SEED_LENGTH,
  );

  return { private_key, public_key: x25519.getPublicKey(private_key) };
}

function seal_aad(user_id: string, token_version: number): Uint8Array {
  return encoder.encode(
    `${AAD_PREFIX}|${user_id.trim().toLowerCase()}|${token_version}`,
  );
}

async function seal_key(
  shared: Uint8Array,
  escrow_public_key: Uint8Array,
): Promise<CryptoKey> {
  const material = hkdf(
    sha256,
    shared,
    escrow_public_key,
    encoder.encode(SEAL_INFO),
    32,
  );

  try {
    return await crypto.subtle.importKey("raw", material, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    zero_uint8_array(material);
  }
}

function is_low_order(shared: Uint8Array): boolean {
  return shared.every((byte) => byte === 0);
}

export async function seal_account_key_to_escrow(
  account_key: Uint8Array,
  escrow_public_key: Uint8Array,
  user_id: string,
  token_version: number,
): Promise<string> {
  if (account_key.length !== ACCOUNT_KEY_LENGTH) {
    throw new Error("account key must be 32 bytes");
  }

  if (escrow_public_key.length !== ESCROW_PUBLIC_KEY_LENGTH) {
    throw new Error("escrow public key must be 32 bytes");
  }

  if (!Number.isSafeInteger(token_version) || token_version < 1) {
    throw new Error("token_version must be a positive integer");
  }

  const ephemeral_private = crypto.getRandomValues(new Uint8Array(32));

  try {
    const ephemeral_public = x25519.getPublicKey(ephemeral_private);
    const shared = x25519.getSharedSecret(ephemeral_private, escrow_public_key);

    if (is_low_order(shared)) {
      throw new Error("escrow public key is not usable");
    }

    const key = await seal_key(shared, escrow_public_key);

    zero_uint8_array(shared);

    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: seal_aad(user_id, token_version),
        },
        key,
        account_key,
      ),
    );
    const sealed = new Uint8Array(ESCROW_SEALED_LENGTH);

    sealed.set(ephemeral_public, 0);
    sealed.set(nonce, EPHEMERAL_PUBLIC_KEY_LENGTH);
    sealed.set(ciphertext, EPHEMERAL_PUBLIC_KEY_LENGTH + NONCE_LENGTH);

    return array_to_base64(sealed);
  } finally {
    zero_uint8_array(ephemeral_private);
  }
}

export async function open_account_key_from_escrow(
  sealed_base64: string,
  escrow_private_key: Uint8Array,
  user_id: string,
  token_version: number,
): Promise<Uint8Array | null> {
  let sealed: Uint8Array;

  try {
    sealed = base64_to_array(sealed_base64);
  } catch {
    return null;
  }

  if (sealed.length !== ESCROW_SEALED_LENGTH) {
    return null;
  }

  try {
    const ephemeral_public = sealed.slice(0, EPHEMERAL_PUBLIC_KEY_LENGTH);
    const nonce = sealed.slice(
      EPHEMERAL_PUBLIC_KEY_LENGTH,
      EPHEMERAL_PUBLIC_KEY_LENGTH + NONCE_LENGTH,
    );
    const ciphertext = sealed.slice(EPHEMERAL_PUBLIC_KEY_LENGTH + NONCE_LENGTH);
    const escrow_public_key = x25519.getPublicKey(escrow_private_key);
    const shared = x25519.getSharedSecret(escrow_private_key, ephemeral_public);

    if (is_low_order(shared)) {
      zero_uint8_array(shared);

      return null;
    }

    const key = await seal_key(shared, escrow_public_key);

    zero_uint8_array(shared);

    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: seal_aad(user_id, token_version),
        },
        key,
        ciphertext,
      ),
    );

    if (plaintext.length !== ACCOUNT_KEY_LENGTH) {
      zero_uint8_array(plaintext);

      return null;
    }

    return plaintext;
  } catch {
    return null;
  }
}
