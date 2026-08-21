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
import { describe, expect, it } from "vitest";

import { collect_vault_key_fingerprints } from "./vault_key_fingerprints";
import type { EncryptedVault } from "./key_manager_core";

function base_vault(): EncryptedVault {
  return {
    identity_key: "identity",
    signed_prekey: "signed",
    signed_prekey_private: "signed_private",
    recovery_codes: [],
  };
}

describe("collect_vault_key_fingerprints", () => {
  it("matches the sha256 the server computes over the published key bytes", async () => {
    const public_key = new Uint8Array(65).fill(7);
    const public_b64 = btoa(String.fromCharCode(...public_key));
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", public_key),
    );
    const expected = btoa(String.fromCharCode(...digest));

    const fingerprints = await collect_vault_key_fingerprints({
      ...base_vault(),
      ratchet_identity_public: public_b64,
    });

    expect(fingerprints).toEqual([expected]);
  });

  it("covers the post-quantum key and every retired key set", async () => {
    const encode = (fill: number, length: number) =>
      btoa(String.fromCharCode(...new Uint8Array(length).fill(fill)));

    const fingerprints = await collect_vault_key_fingerprints({
      ...base_vault(),
      ratchet_identity_public: encode(1, 65),
      ratchet_pq_identity_public: encode(2, 1184),
      ratchet_previous_keys: [
        {
          ratchet_identity_key: "old_private",
          ratchet_identity_public: encode(3, 65),
          ratchet_signed_prekey: "old_signed",
          ratchet_signed_prekey_public: encode(4, 65),
          ratchet_pq_identity_public: encode(5, 1184),
        },
      ],
    });

    expect(fingerprints).toHaveLength(4);
    expect(new Set(fingerprints).size).toBe(4);
  });

  it("derives the identity key a mobile client stored only as a jwk", async () => {
    const x = new Uint8Array(32).fill(11);
    const y = new Uint8Array(32).fill(22);
    const to_base64url = (bytes: Uint8Array) =>
      btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    const point = new Uint8Array(65);

    point[0] = 0x04;
    point.set(x, 1);
    point.set(y, 33);

    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", point),
    );
    const expected = btoa(String.fromCharCode(...digest));

    const fingerprints = await collect_vault_key_fingerprints({
      ...base_vault(),
      ratchet_identity_key: JSON.stringify({
        kty: "EC",
        crv: "P-256",
        x: to_base64url(x),
        y: to_base64url(y),
        d: to_base64url(new Uint8Array(32).fill(33)),
      }),
    });

    expect(fingerprints).toEqual([expected]);
  });

  it("attests nothing when an identity key cannot be fingerprinted", async () => {
    const fingerprints = await collect_vault_key_fingerprints({
      ...base_vault(),
      ratchet_identity_key: JSON.stringify({ kty: "EC", crv: "P-256", d: "x" }),
      ratchet_pq_identity_public: btoa(
        String.fromCharCode(...new Uint8Array(1184).fill(9)),
      ),
    });

    expect(fingerprints).toEqual([]);
  });

  it("attests nothing when a retired identity key cannot be fingerprinted", async () => {
    const fingerprints = await collect_vault_key_fingerprints({
      ...base_vault(),
      ratchet_identity_public: btoa(
        String.fromCharCode(...new Uint8Array(65).fill(1)),
      ),
      ratchet_previous_keys: [
        {
          ratchet_identity_key: JSON.stringify({
            kty: "EC",
            crv: "P-256",
            d: "x",
          }),
          ratchet_signed_prekey: "old_signed",
          ratchet_signed_prekey_public: "old_public",
        },
      ] as unknown as EncryptedVault["ratchet_previous_keys"],
    });

    expect(fingerprints).toEqual([]);
  });

  it("reports nothing when the vault holds no ratchet public keys", async () => {
    expect(await collect_vault_key_fingerprints(base_vault())).toEqual([]);
  });
});
