//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by the Free Software Foundation,
// either version 3 of the License, or (at your option) any later version.
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

import { describe, expect, it } from "vitest";
import { p256 } from "@noble/curves/nist";

import {
  address_entry_forms,
  derive_address_key_set,
  sign_address_entry,
  verify_address_entry,
} from "./address_identity_entry";
import { array_to_base64 } from "./base64";
import expected from "./address_identity_vectors.json";

function base64url(bytes: Uint8Array): string {
  return array_to_base64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function fixed_bytes(fill: number, length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (fill + i * 7) & 0xff);
}

function fixed_key(fill: number): { jwk: string; public_key: string } {
  const scalar = fixed_bytes(fill, 32);
  const point = p256.getPublicKey(scalar, false);

  return {
    jwk: JSON.stringify({
      kty: "EC",
      crv: "P-256",
      d: base64url(scalar),
      x: base64url(point.slice(1, 33)),
      y: base64url(point.slice(33, 65)),
      ext: true,
      key_ops: ["deriveBits"],
    }),
    public_key: array_to_base64(point),
  };
}

function fixed_vault(): EncryptedVault {
  const identity = fixed_key(11);
  const signed_prekey = fixed_key(23);
  const previous_identity = fixed_key(37);
  const previous_signed_prekey = fixed_key(41);

  return {
    ratchet_identity_key: identity.jwk,
    ratchet_identity_public: identity.public_key,
    ratchet_signed_prekey: signed_prekey.jwk,
    ratchet_signed_prekey_public: signed_prekey.public_key,
    ratchet_pq_identity_seed: array_to_base64(fixed_bytes(53, 64)),
    ratchet_previous_keys: [
      {
        ratchet_identity_key: previous_identity.jwk,
        ratchet_identity_public: previous_identity.public_key,
        ratchet_signed_prekey: previous_signed_prekey.jwk,
        ratchet_signed_prekey_public: previous_signed_prekey.public_key,
      },
    ],
  } as unknown as EncryptedVault;
}

describe("address identity vectors", () => {
  it("derives the published address forms", () => {
    expect(address_entry_forms(expected.address)).toEqual(expected.forms);
  });

  it("derives the same key sets for every form", () => {
    const vault = fixed_vault();
    const current = {
      ratchet_identity_key: vault.ratchet_identity_key!,
      ratchet_identity_public: vault.ratchet_identity_public!,
      ratchet_signed_prekey: vault.ratchet_signed_prekey!,
      ratchet_signed_prekey_public: vault.ratchet_signed_prekey_public!,
      ratchet_pq_identity_seed: vault.ratchet_pq_identity_seed,
    };

    expect(fixed_vault()).toEqual(expected.vault);

    for (const vector of expected.derived) {
      const set = derive_address_key_set(current, vector.form)!;

      expect(set.ratchet_identity_key).toBe(vector.identity_jwk);
      expect(set.ratchet_identity_public).toBe(vector.identity_public);
      expect(set.ratchet_signed_prekey).toBe(vector.signed_prekey_jwk);
      expect(set.ratchet_signed_prekey_public).toBe(vector.signed_prekey_public);
      expect(set.ratchet_pq_identity_public?.slice(0, 64)).toBe(
        vector.pq_public_sha_prefix,
      );
      expect(set.ratchet_pq_identity_public?.length).toBe(
        vector.pq_public_length,
      );
    }
  });

  it("signs the entry deterministically and verifies it", () => {
    const entry = sign_address_entry(fixed_vault(), expected.forms[0])!;

    expect(entry).toEqual(expected.entry);
    expect(verify_address_entry(expected.address, entry)).toEqual(
      expected.verification,
    );
  });

  it("rejects an entry for another address", () => {
    expect(
      verify_address_entry("someone.else@example.org", expected.entry).valid,
    ).toBe(false);
  });
});
