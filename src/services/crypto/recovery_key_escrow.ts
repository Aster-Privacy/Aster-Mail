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
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { ACCOUNT_KEY_LENGTH } from "./account_data_key";
import { array_to_base64 } from "./base64";
import { base64_to_array } from "./key_manager";
import { zero_uint8_array } from "./secure_memory";
import {
  decrypt_aes_gcm_bound_or_unbound,
  stored_unbound_policy,
} from "./aes_gcm_aad_fallback";

export const ESCROW_SEED_LENGTH = 32;
export const ESCROW_PUBLIC_KEY_LENGTH = 32;
export const ESCROW_SEALED_LENGTH = 92;
export const ESCROW_FORMAT = 2;

const EPHEMERAL_PUBLIC_KEY_LENGTH = 32;
const NONCE_LENGTH = 12;
const AUTH_KEY_LENGTH = 32;

const LEGACY_KEY_INFO = "aster-recovery-escrow-key-v1";
const LEGACY_SEAL_INFO = "aster-recovery-escrow-seal-v1";
const LEGACY_AAD_PREFIX = "aster-recovery-escrow-v1";

const KEY_INFO = "aster-recovery-escrow-key-v2";
const AUTH_INFO = "aster-recovery-escrow-auth-v2";
const SEAL_INFO = "aster-recovery-escrow-seal-v2";
const AAD_PREFIX = "aster-recovery-escrow-v2";

const encoder = new TextEncoder();

export interface EscrowKeypair {
  private_key: Uint8Array;
  public_key: Uint8Array;
}

export interface EscrowKeys extends EscrowKeypair {
  auth_key: Uint8Array;
}

interface SealedParts {
  ephemeral_public: Uint8Array;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
}

type OpenSealed = (
  shared: Uint8Array,
  escrow_public_key: Uint8Array,
  parts: SealedParts,
) => Promise<ArrayBuffer>;

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

function normalize_user_id(user_id: string): string {
  const normalized = user_id.trim().toLowerCase();

  if (!normalized) {
    throw new Error("user_id is required");
  }

  return normalized;
}

function derive_from_seed(
  seed: Uint8Array,
  user_id: string,
  info: string,
  length: number,
): Uint8Array {
  if (seed.length !== ESCROW_SEED_LENGTH) {
    throw new Error("escrow seed must be 32 bytes");
  }

  return hkdf(
    sha256,
    seed,
    encoder.encode(info),
    encoder.encode(normalize_user_id(user_id)),
    length,
  );
}

function keypair_from_private(private_key: Uint8Array): EscrowKeypair {
  return { private_key, public_key: x25519.getPublicKey(private_key) };
}

export function derive_escrow_keys(
  seed: Uint8Array,
  user_id: string,
): EscrowKeys {
  const keypair = keypair_from_private(
    derive_from_seed(seed, user_id, KEY_INFO, ESCROW_SEED_LENGTH),
  );

  return {
    ...keypair,
    auth_key: derive_from_seed(seed, user_id, AUTH_INFO, AUTH_KEY_LENGTH),
  };
}

export function derive_legacy_escrow_keypair(
  seed: Uint8Array,
  user_id: string,
): EscrowKeypair {
  return keypair_from_private(
    derive_from_seed(seed, user_id, LEGACY_KEY_INFO, ESCROW_SEED_LENGTH),
  );
}

export function zero_escrow_keys(keys: Partial<EscrowKeys> | null): void {
  if (!keys) return;
  if (keys.private_key) zero_uint8_array(keys.private_key);
  if (keys.auth_key) zero_uint8_array(keys.auth_key);
}

function seal_aad(
  prefix: string,
  user_id: string,
  token_version: number,
): Uint8Array {
  return encoder.encode(
    `${prefix}|${normalize_user_id(user_id)}|${token_version}`,
  );
}

async function import_seal_key(material: Uint8Array): Promise<CryptoKey> {
  try {
    return await crypto.subtle.importKey("raw", material, "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    zero_uint8_array(material);
  }
}

async function seal_key(
  shared: Uint8Array,
  escrow_public_key: Uint8Array,
  auth_key: Uint8Array,
): Promise<CryptoKey> {
  const input = new Uint8Array(shared.length + auth_key.length);

  input.set(shared, 0);
  input.set(auth_key, shared.length);

  try {
    return await import_seal_key(
      hkdf(sha256, input, escrow_public_key, encoder.encode(SEAL_INFO), 32),
    );
  } finally {
    zero_uint8_array(input);
  }
}

async function legacy_seal_key(
  shared: Uint8Array,
  escrow_public_key: Uint8Array,
): Promise<CryptoKey> {
  return import_seal_key(
    hkdf(
      sha256,
      shared,
      escrow_public_key,
      encoder.encode(LEGACY_SEAL_INFO),
      32,
    ),
  );
}

function is_low_order(shared: Uint8Array): boolean {
  return shared.every((byte) => byte === 0);
}

function is_token_version(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

export async function seal_account_key_to_escrow(
  account_key: Uint8Array,
  keys: Pick<EscrowKeys, "public_key" | "auth_key">,
  user_id: string,
  token_version: number,
): Promise<string> {
  if (account_key.length !== ACCOUNT_KEY_LENGTH) {
    throw new Error("account key must be 32 bytes");
  }

  if (keys.public_key.length !== ESCROW_PUBLIC_KEY_LENGTH) {
    throw new Error("escrow public key must be 32 bytes");
  }

  if (keys.auth_key.length !== AUTH_KEY_LENGTH) {
    throw new Error("escrow auth key must be 32 bytes");
  }

  if (!is_token_version(token_version)) {
    throw new Error("token_version must be a positive integer");
  }

  const ephemeral_private = crypto.getRandomValues(new Uint8Array(32));

  try {
    const ephemeral_public = x25519.getPublicKey(ephemeral_private);
    const shared = x25519.getSharedSecret(ephemeral_private, keys.public_key);

    if (is_low_order(shared)) {
      throw new Error("escrow public key is not usable");
    }

    const key = await seal_key(shared, keys.public_key, keys.auth_key);

    zero_uint8_array(shared);

    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
          additionalData: seal_aad(AAD_PREFIX, user_id, token_version),
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

function split_sealed(sealed_base64: string): SealedParts | null {
  let sealed: Uint8Array;

  try {
    sealed = base64_to_array(sealed_base64);
  } catch {
    return null;
  }

  if (sealed.length !== ESCROW_SEALED_LENGTH) return null;

  return {
    ephemeral_public: sealed.slice(0, EPHEMERAL_PUBLIC_KEY_LENGTH),
    nonce: sealed.slice(
      EPHEMERAL_PUBLIC_KEY_LENGTH,
      EPHEMERAL_PUBLIC_KEY_LENGTH + NONCE_LENGTH,
    ),
    ciphertext: sealed.slice(EPHEMERAL_PUBLIC_KEY_LENGTH + NONCE_LENGTH),
  };
}

async function open_sealed(
  sealed_base64: string,
  escrow_private_key: Uint8Array,
  token_version: number,
  decrypt: OpenSealed,
): Promise<Uint8Array | null> {
  if (!is_token_version(token_version)) return null;

  const parts = split_sealed(sealed_base64);

  if (!parts) return null;

  let shared: Uint8Array | null = null;

  try {
    shared = x25519.getSharedSecret(escrow_private_key, parts.ephemeral_public);

    if (is_low_order(shared)) return null;

    const plaintext = new Uint8Array(
      await decrypt(shared, x25519.getPublicKey(escrow_private_key), parts),
    );

    if (plaintext.length !== ACCOUNT_KEY_LENGTH) {
      zero_uint8_array(plaintext);

      return null;
    }

    return plaintext;
  } catch {
    return null;
  } finally {
    if (shared) zero_uint8_array(shared);
  }
}

export async function open_account_key_from_escrow(
  sealed_base64: string,
  keys: Pick<EscrowKeys, "private_key" | "auth_key">,
  user_id: string,
  token_version: number,
): Promise<Uint8Array | null> {
  return open_sealed(
    sealed_base64,
    keys.private_key,
    token_version,
    async (shared, escrow_public_key, parts) =>
      crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: parts.nonce,
          additionalData: seal_aad(AAD_PREFIX, user_id, token_version),
        },
        await seal_key(shared, escrow_public_key, keys.auth_key),
        parts.ciphertext,
      ),
  );
}

export async function open_legacy_account_key_from_escrow(
  sealed_base64: string,
  escrow_private_key: Uint8Array,
  user_id: string,
  token_version: number,
): Promise<Uint8Array | null> {
  return open_sealed(
    sealed_base64,
    escrow_private_key,
    token_version,
    async (shared, escrow_public_key, parts) =>
      decrypt_aes_gcm_bound_or_unbound(
        await legacy_seal_key(shared, escrow_public_key),
        parts.nonce,
        parts.ciphertext,
        seal_aad(LEGACY_AAD_PREFIX, user_id, token_version),
        stored_unbound_policy(),
      ),
  );
}
