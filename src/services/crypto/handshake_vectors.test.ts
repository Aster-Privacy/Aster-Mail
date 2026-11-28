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
import { writeFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import vectors from "../../../docs/protocol/handshake_v5_vectors.json";

const KEM_SEED = new Uint8Array(64).map((_, i) => (i * 13 + 5) & 0xff);
const KEM_RANDOMNESS = new Uint8Array(32).map((_, i) => (i * 17 + 9) & 0xff);

vi.mock("./pq_prekey_store", async () => {
  const { ml_kem768: kem } = await import("@noble/post-quantum/ml-kem.js");
  const keypair = kem.keygen(
    new Uint8Array(64).map((_, i) => (i * 13 + 5) & 0xff),
  );

  return {
    load_pq_secret: vi.fn(async () => new Uint8Array(keypair.secretKey)),
    refuse_used_pq_prekey: vi.fn(async () => false),
  };
});

vi.mock("./ec_prekey_store", () => ({
  load_ec_one_time_secret: vi.fn(async () => ({
    kty: "EC",
    crv: "P-256",
    d: "AwoRGB8mLTQ7QklQV15lbHN6gYiPlp2kq7K5wMfO1dw",
  })),
}));

import { perform_x3dh_receiver, PQ_IDENTITY_KEY_ID } from "./x3dh";

const RECEIVER_IDENTITY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  d: "S-TtOFuUV4kV3U_6iwvv7w_2FsCMvB2JJAP2qEHWENc",
  x: "pV5xYiD-maXwHlWFdNcTXU29RbWx7B2M-emR-q5SWkg",
  y: "49TZk81Zt_rBFqwpi_u3egcVqAoeqoAMliPxQTxFxC4",
};
const RECEIVER_SIGNED_PREKEY_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  d: "_964242B7JrwBFGRDZSqeWB-34nP1X8JeFrM_kcb2h8",
  x: "PbTXUe1njdNErFScycKZY__RMrTM8lnPkIK8XPmMjRg",
  y: "IgTYHpcXHehrOpf9cUy8sk9Pl6Xi4-JuPtkA-ZiK1Cc",
};
const SENDER_IDENTITY_RAW_B64 =
  "BN8n2kbWCqaAzmq3WZqLmpl2H7G6DM2o8LP4z0ZA6DWEkVAiEcrDMyM/SF0M6g4KvkIGKE52GkieLoXBCXfcGbs=";
const SENDER_EPHEMERAL_RAW_B64 =
  "BDfQMwe0A3dW5WScHDZPToNk67qpP/VdQspfEd1zHZwW/IoCDYVRxpWBUF92xIgp85tfr76G3fgbq6w1F8NtXjw=";
const ONE_TIME_PREKEY_ID = 0x01020304;
const PQ_PREKEY_ID = 7;

function from_base64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function to_base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const kem_keypair = ml_kem768.keygen(KEM_SEED);
const kem = ml_kem768.encapsulate(kem_keypair.publicKey, KEM_RANDOMNESS);

type LegacyMode = "none" | "identity" | "onetime";

async function legacy_secret(version: number, mode: LegacyMode) {
  const secret = await perform_x3dh_receiver(
    RECEIVER_IDENTITY_JWK,
    RECEIVER_SIGNED_PREKEY_JWK,
    from_base64(SENDER_IDENTITY_RAW_B64),
    from_base64(SENDER_EPHEMERAL_RAW_B64),
    mode === "none"
      ? null
      : {
          pq_ciphertext: kem.cipherText,
          pq_key_id: mode === "identity" ? PQ_IDENTITY_KEY_ID : PQ_PREKEY_ID,
        },
    mode === "identity" ? to_base64(kem_keypair.secretKey) : null,
    version,
    version === 4 ? ONE_TIME_PREKEY_ID : undefined,
  );

  return to_hex(secret);
}

async function compute_legacy() {
  const out: { version: number; mode: LegacyMode; expected_output: string }[] = [];

  for (const version of [1, 2, 3, 4]) {
    for (const mode of ["none", "identity", "onetime"] as LegacyMode[]) {
      out.push({ version, mode, expected_output: await legacy_secret(version, mode) });
    }
  }

  return out;
}

describe("handshake conformance vectors", () => {
  it("keeps versions 1 to 4 byte-identical", async () => {
    const legacy = await compute_legacy();
    const out_path = process.env.HANDSHAKE_VECTORS_OUT;

    if (out_path) {
      writeFileSync(out_path, JSON.stringify({ ...vectors, legacy }, null, 2));
    }

    expect(legacy).toEqual(vectors.legacy);
  });
});
