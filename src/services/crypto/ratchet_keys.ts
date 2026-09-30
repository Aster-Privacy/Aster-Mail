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
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import { array_to_base64, base64_to_array } from "./base64";
import { type RatchetKeyPair } from "./double_ratchet";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

function jwk_d_to_bytes(jwk: JsonWebKey): Uint8Array {
  const d_base64url = jwk.d!;
  const d_base64 = d_base64url.replace(/-/g, "+").replace(/_/g, "/");

  return base64_to_array(d_base64);
}

export async function jwk_to_ratchet_keypair(
  jwk_string: string,
  public_key_base64: string,
): Promise<RatchetKeyPair> {
  const jwk: JsonWebKey = JSON.parse(jwk_string);

  return {
    public_key: base64_to_array(public_key_base64),
    secret_key: jwk_d_to_bytes(jwk),
  };
}

export async function generate_ratchet_keys(): Promise<{
  identity_jwk: string;
  identity_public: string;
  signed_prekey_jwk: string;
  signed_prekey_public: string;
  pq_identity_secret: string;
  pq_identity_public: string;
  pq_identity_seed: string;
} | null> {
  const identity = await generate_exportable_ke_keypair();
  const signed_prekey = await generate_exportable_ke_keypair();
  const pq_seed = crypto.getRandomValues(new Uint8Array(64));
  const pq_keys = ml_kem768.keygen(pq_seed);

  return {
    identity_jwk: JSON.stringify(identity.jwk),
    identity_public: array_to_base64(identity.public_key_raw),
    signed_prekey_jwk: JSON.stringify(signed_prekey.jwk),
    signed_prekey_public: array_to_base64(signed_prekey.public_key_raw),
    pq_identity_secret: array_to_base64(pq_keys.secretKey),
    pq_identity_public: array_to_base64(pq_keys.publicKey),
    pq_identity_seed: array_to_base64(pq_seed),
  };
}

export async function generate_pq_identity_keys(): Promise<{
  pq_identity_secret: string;
  pq_identity_public: string;
  pq_identity_seed: string;
}> {
  const pq_seed = crypto.getRandomValues(new Uint8Array(64));
  const pq_keys = ml_kem768.keygen(pq_seed);

  return {
    pq_identity_secret: array_to_base64(pq_keys.secretKey),
    pq_identity_public: array_to_base64(pq_keys.publicKey),
    pq_identity_seed: array_to_base64(pq_seed),
  };
}

export function resolve_pq_identity_secret(
  secret_base64?: string | null,
  seed_base64?: string | null,
): string | null {
  if (secret_base64) return secret_base64;
  if (!seed_base64) return null;

  return derive_pq_identity_from_seed(seed_base64)?.pq_identity_secret ?? null;
}

export function derive_pq_identity_from_seed(seed_base64: string): {
  pq_identity_secret: string;
  pq_identity_public: string;
} | null {
  try {
    const seed = base64_to_array(seed_base64);

    if (seed.length !== 64) return null;

    const pq_keys = ml_kem768.keygen(seed);

    return {
      pq_identity_secret: array_to_base64(pq_keys.secretKey),
      pq_identity_public: array_to_base64(pq_keys.publicKey),
    };
  } catch {
    return null;
  }
}

async function generate_exportable_ke_keypair(): Promise<{
  jwk: JsonWebKey;
  public_key_raw: Uint8Array;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );

  const jwk = await crypto.subtle.exportKey("jwk", keypair.privateKey);

  return {
    jwk,
    public_key_raw: new Uint8Array(public_key_raw),
  };
}
