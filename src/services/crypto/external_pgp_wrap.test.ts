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

import { array_to_base64, base64_to_array } from "./base64";
import {
  external_challenge_message,
  external_key_unwrap_error,
  external_wrap_aad,
  unwrap_external_private_key,
  wrap_external_private_key,
} from "./external_pgp_wrap";

const USER_ID = "4F1C2B7A-0000-4000-8000-00000000ABCD";
const FINGERPRINT = "A1B2 C3D4 E5F6 0718 293A 4B5C 6D7E 8F90 A1B2 C3D4";
const OTHER_FINGERPRINT = "ffffffffffffffffffffffffffffffffffffffff";

function make_kek(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function sample_plaintext(): Uint8Array {
  return new TextEncoder().encode("binary secret key packets");
}

async function expect_unwrap_failure(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(external_key_unwrap_error);
}

describe("external key wrap", () => {
  it("round trips with the same key, user, and fingerprint", async () => {
    const kek = make_kek(7);
    const wrapped = await wrap_external_private_key(
      sample_plaintext(),
      kek,
      USER_ID,
      FINGERPRINT,
    );
    const opened = await unwrap_external_private_key(
      wrapped,
      kek,
      USER_ID.toLowerCase(),
      FINGERPRINT.replace(/\s/g, "").toLowerCase(),
    );

    expect(new TextDecoder().decode(opened)).toBe("binary secret key packets");
  });

  it("writes version 1, a 12-byte nonce, and a 16-byte tag", async () => {
    const plaintext = sample_plaintext();
    const wrapped = await wrap_external_private_key(
      plaintext,
      make_kek(1),
      USER_ID,
      FINGERPRINT,
    );
    const blob = base64_to_array(wrapped);

    expect(blob[0]).toBe(1);
    expect(blob.length).toBe(1 + 12 + plaintext.length + 16);
  });

  it("uses a fresh nonce each time", async () => {
    const kek = make_kek(2);
    const first = await wrap_external_private_key(
      sample_plaintext(),
      kek,
      USER_ID,
      FINGERPRINT,
    );
    const second = await wrap_external_private_key(
      sample_plaintext(),
      kek,
      USER_ID,
      FINGERPRINT,
    );

    expect(first).not.toBe(second);
  });

  it("binds the fingerprint", async () => {
    const kek = make_kek(3);
    const wrapped = await wrap_external_private_key(
      sample_plaintext(),
      kek,
      USER_ID,
      FINGERPRINT,
    );

    await expect_unwrap_failure(
      unwrap_external_private_key(wrapped, kek, USER_ID, OTHER_FINGERPRINT),
    );
  });

  it("binds the user", async () => {
    const kek = make_kek(4);
    const wrapped = await wrap_external_private_key(
      sample_plaintext(),
      kek,
      USER_ID,
      FINGERPRINT,
    );

    await expect_unwrap_failure(
      unwrap_external_private_key(wrapped, kek, "another-user", FINGERPRINT),
    );
  });

  it("fails with another data key", async () => {
    const wrapped = await wrap_external_private_key(
      sample_plaintext(),
      make_kek(5),
      USER_ID,
      FINGERPRINT,
    );

    await expect_unwrap_failure(
      unwrap_external_private_key(wrapped, make_kek(6), USER_ID, FINGERPRINT),
    );
  });

  it("fails when the ciphertext is changed", async () => {
    const kek = make_kek(8);
    const wrapped = await wrap_external_private_key(
      sample_plaintext(),
      kek,
      USER_ID,
      FINGERPRINT,
    );
    const blob = base64_to_array(wrapped);

    blob[blob.length - 1] ^= 0x01;

    await expect_unwrap_failure(
      unwrap_external_private_key(
        array_to_base64(blob),
        kek,
        USER_ID,
        FINGERPRINT,
      ),
    );
  });

  it("fails on an unknown version byte", async () => {
    const kek = make_kek(9);
    const blob = base64_to_array(
      await wrap_external_private_key(
        sample_plaintext(),
        kek,
        USER_ID,
        FINGERPRINT,
      ),
    );

    blob[0] = 2;

    await expect_unwrap_failure(
      unwrap_external_private_key(
        array_to_base64(blob),
        kek,
        USER_ID,
        FINGERPRINT,
      ),
    );
  });

  it("matches the contract labels", () => {
    expect(new TextDecoder().decode(external_wrap_aad(USER_ID, FINGERPRINT))).toBe(
      `aster-external-pgp-v1|${USER_ID.toLowerCase()}|a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4`,
    );
    expect(
      new TextDecoder().decode(external_challenge_message(USER_ID, "Y2hhbA==")),
    ).toBe(`aster-external-pgp-challenge-v1:${USER_ID.toLowerCase()}:Y2hhbA==`);
  });

  it("matches an independent HKDF and AES-GCM derivation", async () => {
    const kek = make_kek(10);
    const plaintext = sample_plaintext();
    const wrapped = base64_to_array(
      await wrap_external_private_key(plaintext, kek, USER_ID, FINGERPRINT),
    );
    const encoder = new TextEncoder();
    const ikm = await crypto.subtle.importKey("raw", kek, "HKDF", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: encoder.encode("aster-external-pgp-v1"),
        info: encoder.encode(USER_ID.toLowerCase()),
      },
      ikm,
      256,
    );
    const aes = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, [
      "decrypt",
    ]);
    const opened = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: wrapped.subarray(1, 13),
        additionalData: encoder.encode(
          `aster-external-pgp-v1|${USER_ID.toLowerCase()}|a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4`,
        ),
      },
      aes,
      wrapped.subarray(13),
    );

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });
});
