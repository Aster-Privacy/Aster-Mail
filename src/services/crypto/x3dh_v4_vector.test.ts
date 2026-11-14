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
import { describe, it, expect, vi } from "vitest";

const KEM_SEED = new Uint8Array(64).map((_, i) => (i * 13 + 5) & 0xff);
const KEM_RANDOMNESS = new Uint8Array(32).map((_, i) => (i * 17 + 9) & 0xff);

const ONE_TIME_PREKEY_ID = 0x01020304;
const ALIASED_ONE_TIME_PREKEY_ID = 0x01020305;
const UNKNOWN_ONE_TIME_PREKEY_ID = 99;

vi.mock("./pq_prekey_store", async () => {
  const { ml_kem768 } = await import("@noble/post-quantum/ml-kem.js");
  const seed = new Uint8Array(64).map((_, i) => (i * 13 + 5) & 0xff);
  const keypair = ml_kem768.keygen(seed);

  return {
    save_pq_secret: vi.fn(async () => undefined),
    load_pq_secret: vi.fn(async () => new Uint8Array(keypair.secretKey)),
    delete_pq_secret: vi.fn(async () => undefined),
  };
});

vi.mock("./ec_prekey_store", () => ({
  load_ec_one_time_secret: vi.fn(async (key_id: number) =>
    key_id === 0x01020304 || key_id === 0x01020305
      ? {
          kty: "EC",
          crv: "P-256",
          d: "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw",
        }
      : null,
  ),
}));

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { p256 } from "@noble/curves/nist";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";

import {
  perform_x3dh_receiver,
  compute_signed_prekey_id,
  encode_one_time_prekey_id,
  is_valid_one_time_prekey_id,
  signed_prekey_id_from_private_jwk,
  X3DH_VERSION_KEY_BOUND,
  X3DH_VERSION_ONE_TIME_BOUND,
  X3DH_VERSION_MAX,
  X3DH_READ_VERSION_MAX,
  PQ_IDENTITY_KEY_ID,
} from "./x3dh";

const RECEIVER_IDENTITY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  d: "S-TtOFuUV4kV3U_6iwvv7w_2FsCMvB2JJAP2qEHWENc",
  x: "pV5xYiD-maXwHlWFdNcTXU29RbWx7B2M-emR-q5SWkg",
  y: "49TZk81Zt_rBFqwpi_u3egcVqAoeqoAMliPxQTxFxC4",
  ext: true,
  key_ops: ["deriveBits"],
};

const RECEIVER_SIGNED_PREKEY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  d: "_964242B7JrwBFGRDZSqeWB-34nP1X8JeFrM_kcb2h8",
  x: "PbTXUe1njdNErFScycKZY__RMrTM8lnPkIK8XPmMjRg",
  y: "IgTYHpcXHehrOpf9cUy8sk9Pl6Xi4-JuPtkA-ZiK1Cc",
  ext: true,
  key_ops: ["deriveBits"],
};

const RECEIVER_ONE_TIME_PREKEY_D =
  "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw";

const RECEIVER_ONE_TIME_PREKEY_RAW_B64 =
  "BCR1say+jFjG6SpReRvhFC2KRyeTOj5xHZXoOuldEQr6ZQuEikGWXN5/AKJYN+xh/HjLnqrQG4QpVkzPocFYbJg=";

const SENDER_IDENTITY_RAW_B64 =
  "BN8n2kbWCqaAzmq3WZqLmpl2H7G6DM2o8LP4z0ZA6DWEkVAiEcrDMyM/SF0M6g4KvkIGKE52GkieLoXBCXfcGbs=";
const SENDER_EPHEMERAL_RAW_B64 =
  "BDfQMwe0A3dW5WScHDZPToNk67qpP/VdQspfEd1zHZwW/IoCDYVRxpWBUF92xIgp85tfr76G3fgbq6w1F8NtXjw=";

const EXPECTED_SIGNED_PREKEY_ID = "c5ea95322278e438";

const EXPECTED_CLASSICAL_V3 =
  "09459744acadbaf0e93995b1e78476b89ae2abc12225f3b8471680411f39f075";
const EXPECTED_PQ_V3 =
  "295cb2db9bb952b6beff8dff48ab2bfda87b16c09eb05397a36326361bcc60f4";

const EXPECTED_CLASSICAL_V4 =
  "cd86fc61ca372fd0fe6cef01c44b004d66956e98779c2c115605d5098a42b148";
const EXPECTED_PQ_V4 =
  "80a66a85ce5a08d96469b61f1a35e8512b431519342d5bd597ff86a5bf7ec50a";
const EXPECTED_PQ_IDENTITY_V4 =
  "49e59d658796cf02446ae941a33c01f0f8bb954ce1f968a45738598c36132818";

function base64_to_bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64url_to_bytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");

  return base64_to_bytes(
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4),
  );
}

function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";

  bytes.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function concat(parts: Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;

  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }

  return joined;
}

function agree(private_d: string, public_raw: Uint8Array): Uint8Array {
  return p256
    .getSharedSecret(base64url_to_bytes(private_d), public_raw, false)
    .slice(1, 33);
}

const sender_identity_raw = base64_to_bytes(SENDER_IDENTITY_RAW_B64);
const sender_ephemeral_raw = base64_to_bytes(SENDER_EPHEMERAL_RAW_B64);
const one_time_prekey_raw = base64_to_bytes(RECEIVER_ONE_TIME_PREKEY_RAW_B64);

const kem_keypair = ml_kem768.keygen(KEM_SEED);
const kem_encapsulation = ml_kem768.encapsulate(
  kem_keypair.publicKey,
  KEM_RANDOMNESS,
);

function reference_secret(info: string, with_pq: boolean): string {
  const receiver_identity_raw = p256.getPublicKey(
    base64url_to_bytes(RECEIVER_IDENTITY_JWK.d!),
    false,
  );
  const receiver_signed_prekey_raw = p256.getPublicKey(
    base64url_to_bytes(RECEIVER_SIGNED_PREKEY_JWK.d!),
    false,
  );
  const input = concat([
    agree(RECEIVER_SIGNED_PREKEY_JWK.d!, sender_identity_raw),
    agree(RECEIVER_IDENTITY_JWK.d!, sender_ephemeral_raw),
    agree(RECEIVER_SIGNED_PREKEY_JWK.d!, sender_ephemeral_raw),
    agree(RECEIVER_ONE_TIME_PREKEY_D, sender_ephemeral_raw),
    ...(with_pq ? [kem_encapsulation.sharedSecret] : []),
    sender_identity_raw,
    receiver_identity_raw,
    receiver_signed_prekey_raw,
    sender_ephemeral_raw,
    one_time_prekey_raw,
    new Uint8Array([0x01, 0x02, 0x03, 0x04]),
    ...(with_pq ? [kem_encapsulation.cipherText] : []),
  ]);

  return to_hex(
    hkdf(
      sha256,
      input,
      new Uint8Array(32),
      new TextEncoder().encode(info),
      32,
    ),
  );
}

async function receive(
  version: number,
  pq: boolean,
  identity_lane: boolean,
  one_time_prekey_id?: number,
): Promise<string> {
  const secret = await perform_x3dh_receiver(
    RECEIVER_IDENTITY_JWK,
    RECEIVER_SIGNED_PREKEY_JWK,
    sender_identity_raw,
    sender_ephemeral_raw,
    pq
      ? {
          pq_ciphertext: kem_encapsulation.cipherText,
          pq_key_id: identity_lane ? PQ_IDENTITY_KEY_ID : 7,
        }
      : null,
    identity_lane ? bytes_to_base64(kem_keypair.secretKey) : null,
    version,
    one_time_prekey_id,
  );

  return to_hex(secret);
}

describe("x3dh one-time bound vectors", () => {
  it("keeps the write ceiling below the one-time bound version", () => {
    expect(X3DH_VERSION_MAX).toBe(X3DH_VERSION_KEY_BOUND);
    expect(X3DH_READ_VERSION_MAX).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(X3DH_VERSION_ONE_TIME_BOUND).toBe(4);
  });

  it("pins the one-time prekey public key the vectors are built on", () => {
    expect(
      bytes_to_base64(
        p256.getPublicKey(
          base64url_to_bytes(RECEIVER_ONE_TIME_PREKEY_D),
          false,
        ),
      ),
    ).toBe(RECEIVER_ONE_TIME_PREKEY_RAW_B64);
  });

  it("encodes the one-time prekey id as four big-endian bytes", () => {
    expect(to_hex(encode_one_time_prekey_id(ONE_TIME_PREKEY_ID))).toBe(
      "01020304",
    );
    expect(to_hex(encode_one_time_prekey_id(1))).toBe("00000001");
    expect(to_hex(encode_one_time_prekey_id(0x7fffffff))).toBe("7fffffff");
  });

  it("rejects ids outside the positive 31-bit range", () => {
    for (const value of [0, -1, 0x80000000, 1.5, NaN, "7", null, undefined]) {
      expect(is_valid_one_time_prekey_id(value)).toBe(false);
    }

    expect(() => encode_one_time_prekey_id(0)).toThrow();
    expect(() => encode_one_time_prekey_id(0x80000000)).toThrow();
  });

  it("derives the signed prekey id from the public key", async () => {
    expect(
      await signed_prekey_id_from_private_jwk(RECEIVER_SIGNED_PREKEY_JWK),
    ).toBe(EXPECTED_SIGNED_PREKEY_ID);
    expect(
      await compute_signed_prekey_id(
        p256.getPublicKey(
          base64url_to_bytes(RECEIVER_SIGNED_PREKEY_JWK.d!),
          false,
        ),
      ),
    ).toBe(EXPECTED_SIGNED_PREKEY_ID);
  });

  it("derives the one-time bound classical secret", async () => {
    expect(
      await receive(
        X3DH_VERSION_ONE_TIME_BOUND,
        false,
        false,
        ONE_TIME_PREKEY_ID,
      ),
    ).toBe(EXPECTED_CLASSICAL_V4);
  });

  it("derives the one-time bound post-quantum secret", async () => {
    expect(
      await receive(
        X3DH_VERSION_ONE_TIME_BOUND,
        true,
        false,
        ONE_TIME_PREKEY_ID,
      ),
    ).toBe(EXPECTED_PQ_V4);
  });

  it("derives the one-time bound identity lane secret", async () => {
    expect(
      await receive(X3DH_VERSION_ONE_TIME_BOUND, true, true, ONE_TIME_PREKEY_ID),
    ).toBe(EXPECTED_PQ_IDENTITY_V4);
  });

  it("matches an independent derivation of every lane", () => {
    expect(reference_secret("Aster Mail_X3DH_v4", false)).toBe(
      EXPECTED_CLASSICAL_V4,
    );
    expect(reference_secret("Aster Mail_PQXDH_v4", true)).toBe(EXPECTED_PQ_V4);
    expect(reference_secret("Aster Mail_PQXDH_identity_v4", true)).toBe(
      EXPECTED_PQ_IDENTITY_V4,
    );
  });

  it("binds the one-time prekey id into the secret", async () => {
    expect(
      await receive(
        X3DH_VERSION_ONE_TIME_BOUND,
        false,
        false,
        ALIASED_ONE_TIME_PREKEY_ID,
      ),
    ).not.toBe(EXPECTED_CLASSICAL_V4);
  });

  it("refuses the one-time bound version without a key id", async () => {
    await expect(
      receive(X3DH_VERSION_ONE_TIME_BOUND, false, false),
    ).rejects.toThrow("Missing one-time prekey id");
  });

  it("refuses an out of range key id", async () => {
    for (const key_id of [0, -5, 0x80000000, 2.5]) {
      await expect(
        receive(X3DH_VERSION_ONE_TIME_BOUND, false, false, key_id),
      ).rejects.toThrow("Missing one-time prekey id");
    }
  });

  it("fails cleanly when the one-time secret is gone", async () => {
    await expect(
      receive(
        X3DH_VERSION_ONE_TIME_BOUND,
        false,
        false,
        UNKNOWN_ONE_TIME_PREKEY_ID,
      ),
    ).rejects.toThrow("Missing one-time prekey secret");
  });

  it("leaves the key bound secrets untouched by a stray key id", async () => {
    expect(
      await receive(X3DH_VERSION_KEY_BOUND, false, false, ONE_TIME_PREKEY_ID),
    ).toBe(EXPECTED_CLASSICAL_V3);
    expect(
      await receive(X3DH_VERSION_KEY_BOUND, true, false, ONE_TIME_PREKEY_ID),
    ).toBe(EXPECTED_PQ_V3);
  });

  it("keeps the one-time bound secrets apart from the key bound ones", () => {
    const secrets = new Set([
      EXPECTED_CLASSICAL_V3,
      EXPECTED_PQ_V3,
      EXPECTED_CLASSICAL_V4,
      EXPECTED_PQ_V4,
      EXPECTED_PQ_IDENTITY_V4,
    ]);

    expect(secrets.size).toBe(5);
  });
});
