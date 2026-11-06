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
import * as openpgp from "openpgp";
import { describe, expect, it } from "vitest";

import vectors from "./__fixtures__/external_pgp_key_vectors.json";
import { array_to_base64, base64_to_array } from "./base64";
import {
  external_key_unwrap_error,
  external_wrap_aad,
  unwrap_external_private_key,
  wrap_external_private_key,
} from "./external_pgp_wrap";
import { read_unprotected_key } from "./external_pgp_import";

function hex_to_bytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);

  for (let index = 0; index < out.length; index += 1) {
    out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return out;
}

function bytes_to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

describe("shared external key vectors", () => {
  it("derives the same wrap key", async () => {
    const ikm = await crypto.subtle.importKey(
      "raw",
      hex_to_bytes(vectors.data_kek_hex),
      "HKDF",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode(vectors.label),
        info: new TextEncoder().encode(vectors.user_id.toLowerCase()),
      },
      ikm,
      256,
    );

    expect(bytes_to_hex(new Uint8Array(bits))).toBe(vectors.wrap_key_hex);
  });

  it("builds the same AAD", () => {
    expect(
      new TextDecoder().decode(
        external_wrap_aad(vectors.user_id, vectors.fingerprint),
      ),
    ).toBe(vectors.aad);
  });

  it("unwraps the shared blob to the same secret key", async () => {
    const opened = await unwrap_external_private_key(
      vectors.wrapped_private_key,
      hex_to_bytes(vectors.data_kek_hex),
      vectors.user_id,
      vectors.fingerprint,
    );

    expect(array_to_base64(opened)).toBe(vectors.secret_key_b64);
  });

  it("refuses the blob under another fingerprint", async () => {
    await expect(
      unwrap_external_private_key(
        vectors.wrapped_private_key,
        hex_to_bytes(vectors.data_kek_hex),
        vectors.user_id,
        "0".repeat(40),
      ),
    ).rejects.toBeInstanceOf(external_key_unwrap_error);
  });

  it("opens a blob it wraps with the shared nonce layout", async () => {
    const wrapped = base64_to_array(
      await wrap_external_private_key(
        base64_to_array(vectors.secret_key_b64),
        hex_to_bytes(vectors.data_kek_hex),
        vectors.user_id,
        vectors.fingerprint,
      ),
    );

    expect(wrapped.length).toBe(base64_to_array(vectors.wrapped_private_key).length);
    expect(base64_to_array(vectors.wrapped_private_key).subarray(1, 13)).toEqual(
      hex_to_bytes(vectors.nonce_hex),
    );
  });

  it("decrypts the shared message with the unwrapped key", async () => {
    const opened = await unwrap_external_private_key(
      vectors.wrapped_private_key,
      hex_to_bytes(vectors.data_kek_hex),
      vectors.user_id,
      vectors.fingerprint,
    );
    const key = await read_unprotected_key(opened);

    expect(key.getFingerprint().toLowerCase()).toBe(vectors.fingerprint);

    const public_key = await openpgp.readKey({
      armoredKey: vectors.public_key_armored,
    });

    expect(public_key.getFingerprint().toLowerCase()).toBe(vectors.fingerprint);

    const { data } = await openpgp.decrypt({
      message: await openpgp.readMessage({
        armoredMessage: vectors.message_armored,
      }),
      decryptionKeys: key,
    });

    expect(data).toBe(vectors.message_plaintext);
  });
});
