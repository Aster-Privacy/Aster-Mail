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
import { array_to_base64, base64_to_array } from "./base64";
import type { EncryptedVault } from "./key_manager_core";

const MAX_VAULT_KEY_FINGERPRINTS = 128;

const P256_COORDINATE_LEN = 32;
const UNCOMPRESSED_POINT_TAG = 0x04;

function base64url_to_array(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");

  return base64_to_array(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

function identity_public_from_jwk(jwk_text: string): string | null {
  try {
    const jwk = JSON.parse(jwk_text) as { x?: string; y?: string };

    if (!jwk.x || !jwk.y) return null;

    const x = base64url_to_array(jwk.x);
    const y = base64url_to_array(jwk.y);

    if (x.length !== P256_COORDINATE_LEN || y.length !== P256_COORDINATE_LEN) {
      return null;
    }

    const point = new Uint8Array(1 + x.length + y.length);

    point[0] = UNCOMPRESSED_POINT_TAG;
    point.set(x, 1);
    point.set(y, 1 + x.length);

    return array_to_base64(point);
  } catch {
    return null;
  }
}

async function fingerprint_public_key(public_b64: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    base64_to_array(public_b64) as BufferSource,
  );

  return array_to_base64(new Uint8Array(digest));
}

export async function collect_vault_key_fingerprints(
  vault: EncryptedVault,
): Promise<string[]> {
  const public_keys: string[] = [];

  const identity_public =
    vault.ratchet_identity_public ||
    (vault.ratchet_identity_key
      ? identity_public_from_jwk(vault.ratchet_identity_key)
      : null);

  if (identity_public) {
    public_keys.push(identity_public);
  }

  if (vault.ratchet_pq_identity_public) {
    public_keys.push(vault.ratchet_pq_identity_public);
  }

  for (const previous of vault.ratchet_previous_keys ?? []) {
    const previous_public =
      previous.ratchet_identity_public ||
      (previous.ratchet_identity_key
        ? identity_public_from_jwk(previous.ratchet_identity_key)
        : null);

    if (previous_public) {
      public_keys.push(previous_public);
    }

    if (previous.ratchet_pq_identity_public) {
      public_keys.push(previous.ratchet_pq_identity_public);
    }
  }

  const fingerprints: string[] = [];

  for (const public_key of public_keys) {
    if (fingerprints.length >= MAX_VAULT_KEY_FINGERPRINTS) break;

    try {
      const value = await fingerprint_public_key(public_key);

      if (!fingerprints.includes(value)) fingerprints.push(value);
    } catch {
      continue;
    }
  }

  return fingerprints;
}
