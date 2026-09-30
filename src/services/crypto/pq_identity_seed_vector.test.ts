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
import { describe, it, expect } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { sha256 } from "@noble/hashes/sha2.js";

import {
  derive_pq_identity_from_seed,
  resolve_pq_identity_secret,
} from "./ratchet_manager";

const counting_seed = new Uint8Array(64).map((_, i) => i);

const expected_public_sha256 =
  "0b7934c83125c788995e2ba6bd761e33046b3e40571be53e023309a29f398cc9";

const expected_secret_sha256 =
  "dac268bde6a8dd238e9887117d6b664e7a7a9350ad6b7c08a948e504809572a5";

function sha256_hex(bytes: Uint8Array): string {
  return Array.from(sha256(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64_to_bytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);

  return out;
}

function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";

  bytes.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

describe("post-quantum identity seed vector", () => {
  it("derives the pinned cross-client keypair from the shared seed", () => {
    const pair = ml_kem768.keygen(counting_seed);

    expect(pair.publicKey.length).toBe(1184);
    expect(pair.secretKey.length).toBe(2400);
    expect(sha256_hex(pair.publicKey)).toBe(expected_public_sha256);
    expect(sha256_hex(pair.secretKey)).toBe(expected_secret_sha256);
  });

  it("derives the same keypair through derive_pq_identity_from_seed", () => {
    const derived = derive_pq_identity_from_seed(
      bytes_to_base64(counting_seed),
    );

    expect(derived).not.toBeNull();
    expect(sha256_hex(base64_to_bytes(derived!.pq_identity_public))).toBe(
      expected_public_sha256,
    );
    expect(sha256_hex(base64_to_bytes(derived!.pq_identity_secret))).toBe(
      expected_secret_sha256,
    );
  });

  it("round-trips encapsulation against the seed-derived secret", () => {
    const derived = derive_pq_identity_from_seed(
      bytes_to_base64(counting_seed),
    )!;

    const encapsulated = ml_kem768.encapsulate(
      base64_to_bytes(derived.pq_identity_public),
    );

    const shared = ml_kem768.decapsulate(
      encapsulated.cipherText,
      base64_to_bytes(derived.pq_identity_secret),
    );

    expect(encapsulated.cipherText.length).toBe(1088);
    expect(Array.from(shared)).toEqual(Array.from(encapsulated.sharedSecret));
  });

  it("rejects a seed of the wrong length", () => {
    expect(
      derive_pq_identity_from_seed(bytes_to_base64(new Uint8Array(32))),
    ).toBeNull();
  });

  it("prefers a stored secret and falls back to the seed", () => {
    const seed_b64 = bytes_to_base64(counting_seed);
    const stored = "stored-secret";

    expect(resolve_pq_identity_secret(stored, seed_b64)).toBe(stored);
    expect(resolve_pq_identity_secret(null, null)).toBeNull();

    const from_seed = resolve_pq_identity_secret(null, seed_b64);

    expect(from_seed).not.toBeNull();
    expect(sha256_hex(base64_to_bytes(from_seed!))).toBe(
      expected_secret_sha256,
    );
  });
});
