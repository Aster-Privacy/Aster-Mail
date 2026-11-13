//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//

import { describe, it, expect } from "vitest";

import {
  decrypt_inbound_ecies,
  decrypt_inbound_pq_hybrid,
  inbound_owner_bytes,
} from "./decrypt_envelope";

import vectors from "@/tests/fixtures/inbound_bound_envelope_vectors.json";

function b64_to_bytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }

  return out;
}

function bytes_to_b64url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function recipient_identity_jwk(): string {
  const scalar = b64_to_bytes(vectors.recipient_p256_private_scalar_b64);
  const point = b64_to_bytes(vectors.recipient_p256_public_sec1_b64);

  return JSON.stringify({
    kty: "EC",
    crv: "P-256",
    d: bytes_to_b64url(scalar),
    x: bytes_to_b64url(point.slice(1, 33)),
    y: bytes_to_b64url(point.slice(33, 65)),
    ext: true,
  });
}

function owner(): Uint8Array {
  const bytes = inbound_owner_bytes(vectors.bound_owner_user_id);

  if (!bytes) throw new Error("vector owner id did not parse");

  return bytes;
}

const OTHER_OWNER = new Uint8Array(16).fill(0x11);

function open_ecdh(
  envelope: Uint8Array,
  owner_bytes: Uint8Array | null,
): Promise<Uint8Array | null> {
  return decrypt_inbound_ecies(
    envelope,
    b64_to_bytes(vectors.ecdh_bound.nonce_b64),
    recipient_identity_jwk(),
    true,
    owner_bytes,
  );
}

function open_pq(
  envelope: Uint8Array,
  owner_bytes: Uint8Array | null,
): Promise<Uint8Array | null> {
  return decrypt_inbound_pq_hybrid(
    envelope,
    b64_to_bytes(vectors.pq_hybrid_bound.nonce_b64),
    recipient_identity_jwk(),
    vectors.recipient_ml_kem768_decapsulation_key_b64,
    owner_bytes,
  );
}

describe("account-bound inbound envelope cross-language vectors", () => {
  it("matches the backend wire layout", () => {
    const ecdh = b64_to_bytes(vectors.ecdh_bound.envelope_b64);
    const pq = b64_to_bytes(vectors.pq_hybrid_bound.envelope_b64);

    expect(ecdh[0]).toBe(0x05);
    expect(ecdh[1]).toBe(0x04);
    expect(pq[0]).toBe(0x06);
    expect(pq[1]).toBe(0x04);
    expect(pq.length).toBeGreaterThan(1 + 65 + 1088 + 16);
  });

  it("decrypts a marker 0x05 envelope for its owner", async () => {
    const plain = await open_ecdh(
      b64_to_bytes(vectors.ecdh_bound.envelope_b64),
      owner(),
    );

    expect(plain).not.toBeNull();
    expect(new TextDecoder().decode(plain as Uint8Array)).toBe(
      vectors.plaintext_utf8,
    );
  });

  it("decrypts a marker 0x06 envelope for its owner", async () => {
    const plain = await open_pq(
      b64_to_bytes(vectors.pq_hybrid_bound.envelope_b64),
      owner(),
    );

    expect(plain).not.toBeNull();
    expect(new TextDecoder().decode(plain as Uint8Array)).toBe(
      vectors.plaintext_utf8,
    );
  });

  it("does not open a bound envelope for another account", async () => {
    expect(
      await open_ecdh(
        b64_to_bytes(vectors.ecdh_bound.envelope_b64),
        OTHER_OWNER,
      ),
    ).toBeNull();
    expect(
      await open_pq(
        b64_to_bytes(vectors.pq_hybrid_bound.envelope_b64),
        OTHER_OWNER,
      ),
    ).toBeNull();
  });

  it("does not open a bound envelope without an account", async () => {
    expect(
      await open_ecdh(b64_to_bytes(vectors.ecdh_bound.envelope_b64), null),
    ).toBeNull();
    expect(
      await open_pq(b64_to_bytes(vectors.pq_hybrid_bound.envelope_b64), null),
    ).toBeNull();
    expect(
      await open_ecdh(
        b64_to_bytes(vectors.ecdh_bound.envelope_b64),
        new Uint8Array(15).fill(0x3f),
      ),
    ).toBeNull();
  });

  it("does not open a bound envelope relabeled as unbound", async () => {
    const ecdh = b64_to_bytes(vectors.ecdh_bound.envelope_b64);
    const pq = b64_to_bytes(vectors.pq_hybrid_bound.envelope_b64);

    ecdh[0] = 0x03;
    pq[0] = 0x04;

    expect(await open_ecdh(ecdh, owner())).toBeNull();
    expect(await open_ecdh(ecdh, null)).toBeNull();
    expect(await open_pq(pq, owner())).toBeNull();
    expect(await open_pq(pq, null)).toBeNull();
  });

  it("rejects a bound envelope whose ciphertext was altered", async () => {
    const ecdh = b64_to_bytes(vectors.ecdh_bound.envelope_b64);

    ecdh[ecdh.length - 1] ^= 0x01;

    expect(await open_ecdh(ecdh, owner())).toBeNull();
  });

  it("parses account ids to sixteen bytes", () => {
    const bytes = owner();

    expect(bytes.length).toBe(16);
    expect(bytes[0]).toBe(0x3f);
    expect(bytes[15]).toBe(0x5e);
    expect(inbound_owner_bytes("3F2B8C1E7A4D4E9B9C605D1A2B3C4D5E")).toEqual(
      bytes,
    );
  });

  it("refuses malformed account ids", () => {
    for (const value of [
      "",
      "user-1",
      "3f2b8c1e-7a4d-4e9b-9c60-5d1a2b3c4d",
      "zz2b8c1e-7a4d-4e9b-9c60-5d1a2b3c4d5e",
      "3f2b8c1e-7a4d-4e9b-9c60-5d1a2b3c4d5e00",
    ]) {
      expect(inbound_owner_bytes(value)).toBeNull();
    }
    expect(inbound_owner_bytes(null)).toBeNull();
    expect(inbound_owner_bytes(undefined)).toBeNull();
  });
});
