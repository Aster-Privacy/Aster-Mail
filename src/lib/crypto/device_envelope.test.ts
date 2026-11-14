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
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { randomBytes } from "@noble/hashes/utils";

import vector_text from "./device_envelope_vector.txt?raw";
import {
  type envelope_recipient,
  type envelope_version,
  base64url_decode,
  base64url_encode,
  choose_envelope_version,
  open_vault_key_envelope,
  seal_vault_key_for_device,
} from "./device_envelope";

const vector = Object.fromEntries(
  vector_text
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");

      return [line.slice(0, index), line.slice(index + 1).trim()];
    }),
) as Record<string, string>;

const text = new TextEncoder();
const vector_mlkem_sk = base64url_decode(vector.mlkem_decaps);
const vector_x25519_sk = base64url_decode(vector.x25519_scalar);
const vector_recipient: envelope_recipient = {
  ed25519_pk: base64url_decode(vector.ed25519_pk),
  mlkem_pk: base64url_decode(vector.mlkem_pk),
  x25519_pk: base64url_decode(vector.x25519_pk),
};

function open_vector(sealed: Uint8Array, recipient = vector_recipient) {
  return open_vault_key_envelope(
    sealed,
    recipient,
    vector_mlkem_sk,
    vector_x25519_sk,
  );
}

function fresh_device() {
  const ed25519_sk = randomBytes(32);
  const x25519_sk = randomBytes(32);
  const mlkem = ml_kem768.keygen();

  return {
    recipient: {
      ed25519_pk: ed25519.getPublicKey(ed25519_sk),
      mlkem_pk: mlkem.publicKey,
      x25519_pk: x25519.getPublicKey(x25519_sk),
    },
    mlkem_sk: mlkem.secretKey,
    x25519_sk,
  };
}

describe("device envelope shared vector", () => {
  it("derives the vector public keys", () => {
    expect(base64url_encode(x25519.getPublicKey(vector_x25519_sk))).toBe(
      vector.x25519_pk,
    );
    expect(
      base64url_encode(ed25519.getPublicKey(new Uint8Array(32).fill(0x11))),
    ).toBe(vector.ed25519_pk);
  });

  it("opens the v1 and v2 envelopes sealed by the Rust implementation", () => {
    for (const key of ["envelope", "envelope_v2"]) {
      const opened = open_vector(base64url_decode(vector[key]));

      expect(new TextDecoder().decode(opened)).toBe(vector.plaintext);
    }
  });

  it("binds a v2 envelope to the device signing key", () => {
    const other = {
      ...vector_recipient,
      ed25519_pk: ed25519.getPublicKey(new Uint8Array(32).fill(0x12)),
    };

    expect(() =>
      open_vector(base64url_decode(vector.envelope_v2), other),
    ).toThrow();
    expect(
      new TextDecoder().decode(
        open_vector(base64url_decode(vector.envelope), other),
      ),
    ).toBe(vector.plaintext);
  });

  it("rejects a v2 envelope with its version header stripped", () => {
    const sealed = base64url_decode(vector.envelope_v2);

    expect(() => open_vector(sealed.subarray(4))).toThrow();
  });

  it("rejects a tampered v2 envelope", () => {
    const sealed = base64url_decode(vector.envelope_v2);
    const header_end = 4 + 32 + 1088 + 24;

    for (const index of [0, 4, 4 + 32, header_end - 1, sealed.length - 1]) {
      const tampered = sealed.slice();

      tampered[index] ^= 1;
      expect(() => open_vector(tampered), `byte ${index}`).toThrow();
    }
  });

  it("rejects a truncated envelope", () => {
    const sealed = base64url_decode(vector.envelope_v2);

    expect(() => open_vector(sealed.subarray(0, 4 + 32 + 1088 + 24 + 15))).toThrow(
      "envelope too short",
    );
    expect(() => open_vector(new Uint8Array(0))).toThrow("envelope too short");
  });
});

describe("seal_vault_key_for_device", () => {
  it.each([1, 2] as const)("round-trips a v%i envelope", async (version) => {
    const device = fresh_device();
    const plaintext = text.encode("vault passphrase");
    const sealed = await seal_vault_key_for_device(
      plaintext,
      device.recipient,
      version,
    );
    const starts_with_magic =
      new TextDecoder().decode(sealed.subarray(0, 4)) === "AEV2";

    expect(starts_with_magic).toBe(version === 2);
    expect(
      open_vault_key_envelope(
        sealed,
        device.recipient,
        device.mlkem_sk,
        device.x25519_sk,
      ),
    ).toEqual(plaintext);
  });

  it("refuses an unsupported version", async () => {
    const device = fresh_device();

    await expect(
      seal_vault_key_for_device(
        text.encode("x"),
        device.recipient,
        3 as envelope_version,
      ),
    ).rejects.toThrow("unsupported envelope version");
  });

  it("refuses recipient keys of the wrong size", async () => {
    const device = fresh_device();
    const recipient = {
      ...device.recipient,
      ed25519_pk: device.recipient.ed25519_pk.subarray(1),
    };

    await expect(
      seal_vault_key_for_device(text.encode("x"), recipient, 2),
    ).rejects.toThrow("envelope recipient key size");
  });

  it("does not open for another device", async () => {
    const device = fresh_device();
    const other = fresh_device();
    const sealed = await seal_vault_key_for_device(
      text.encode("x"),
      device.recipient,
      2,
    );

    expect(() =>
      open_vault_key_envelope(
        sealed,
        other.recipient,
        other.mlkem_sk,
        other.x25519_sk,
      ),
    ).toThrow();
  });
});

describe("choose_envelope_version", () => {
  it.each([
    [[1, 2], 2],
    [[2], 2],
    [[1], 1],
    [[], 1],
    [undefined, 1],
    [null, 1],
    ["2", 1],
    [{ 0: 2 }, 1],
  ])("picks the version for %j", (offered, expected) => {
    expect(choose_envelope_version(offered)).toBe(expected);
  });
});
