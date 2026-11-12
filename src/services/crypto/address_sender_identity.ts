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
import type { EncryptedVault } from "./key_manager";

import { p256 } from "@noble/curves/nist";
import { mapHashToField } from "@noble/curves/abstract/modular";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";

import { array_to_base64 } from "./base64";

const ADDRESS_IDENTITY_SALT = new TextEncoder().encode(
  "aster/ratchet/address-sender-identity/v1",
);
const P256_SCALAR_LEN = 32;
const SCALAR_SEED_LEN = 48;

export interface SenderIdentity {
  identity_jwk: string;
  identity_public: string;
}

function base64url_decode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64url_encode(bytes: Uint8Array): string {
  return array_to_base64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function normalize_identity_address(address: string): string {
  return address.trim().toLowerCase();
}

export function account_sender_identity(
  vault: EncryptedVault,
): SenderIdentity | null {
  if (!vault.ratchet_identity_key || !vault.ratchet_identity_public) {
    return null;
  }

  return {
    identity_jwk: vault.ratchet_identity_key,
    identity_public: vault.ratchet_identity_public,
  };
}

export function derive_address_sender_identity(
  account_identity_jwk: string | undefined,
  address: string,
): SenderIdentity | null {
  const normalized = normalize_identity_address(address);

  if (!account_identity_jwk || !normalized) return null;

  let account_scalar: Uint8Array | null = null;
  let seed: Uint8Array | null = null;
  let scalar: Uint8Array | null = null;

  try {
    const account_jwk: JsonWebKey = JSON.parse(account_identity_jwk);

    if (!account_jwk.d) return null;

    account_scalar = base64url_decode(account_jwk.d);

    if (account_scalar.length !== P256_SCALAR_LEN) return null;

    seed = hkdf(
      sha256,
      account_scalar,
      ADDRESS_IDENTITY_SALT,
      new TextEncoder().encode(normalized),
      SCALAR_SEED_LEN,
    );
    scalar = mapHashToField(seed, p256.CURVE.n);

    const point = p256.getPublicKey(scalar, false);
    const address_jwk: JsonWebKey = {
      kty: "EC",
      crv: "P-256",
      d: base64url_encode(scalar),
      x: base64url_encode(point.slice(1, 33)),
      y: base64url_encode(point.slice(33, 65)),
      ext: true,
      key_ops: ["deriveBits"],
    };

    return {
      identity_jwk: JSON.stringify(address_jwk),
      identity_public: array_to_base64(point),
    };
  } catch {
    return null;
  } finally {
    account_scalar?.fill(0);
    seed?.fill(0);
    scalar?.fill(0);
  }
}

export function is_own_address_identity_key(
  vault: EncryptedVault,
  addresses: string[],
  identity_key: string | undefined,
): boolean {
  if (!identity_key) return false;

  const account_keys = [
    vault.ratchet_identity_key,
    ...(vault.ratchet_previous_keys ?? []).map(
      (previous) => previous.ratchet_identity_key,
    ),
  ];
  const candidates = new Set(
    addresses.map(normalize_identity_address).filter(Boolean),
  );

  for (const account_key of account_keys) {
    for (const address of candidates) {
      const derived = derive_address_sender_identity(account_key, address);

      if (derived?.identity_public === identity_key) return true;
    }
  }

  return false;
}
