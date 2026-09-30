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

import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

import {
  perform_x3dh_receiver,
  X3DH_VERSION_LEGACY,
  X3DH_VERSION_TRANSCRIPT_BOUND,
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

const SENDER_IDENTITY_RAW_B64 =
  "BN8n2kbWCqaAzmq3WZqLmpl2H7G6DM2o8LP4z0ZA6DWEkVAiEcrDMyM/SF0M6g4KvkIGKE52GkieLoXBCXfcGbs=";
const SENDER_EPHEMERAL_RAW_B64 =
  "BDfQMwe0A3dW5WScHDZPToNk67qpP/VdQspfEd1zHZwW/IoCDYVRxpWBUF92xIgp85tfr76G3fgbq6w1F8NtXjw=";

const EXPECTED_CLASSICAL_V1 =
  "8d18029bb35dde7d83b8f9228152e49d34e096819b1fb7c810ef70ac5bc600b6";
const EXPECTED_CLASSICAL_V2 =
  "6bb032c615db5f87012e62cf8da751b52343c2b4c2d5ed8f140a2c1bb6014f48";
const EXPECTED_PQ_V1 =
  "efa41c478ff0477bfea970527a6a9cee3d8a348e3e4704e255593aa18e3b25f6";
const EXPECTED_PQ_V2 =
  "023e364282464ccbe2c013d61f7453907d94e2a464f0ee5025cb485eb9cc324c";
const EXPECTED_PQ_IDENTITY_V2 =
  "1ffb50c01be8f1aa988305dc1152a159a7ab59ad9f845e2f3f7544bf272af88a";

const EXPECTED_PQ_SHARED_SECRET =
  "5c21a072f4c2a105009f3b845108363b3768e0a0acaa9f3b8c8e2998eb77cc41";
const EXPECTED_PQ_CIPHERTEXT_DIGEST =
  "a43360145b62962fd1e7a66fe28a609b95eb15292119638cbff121b9e1dfa341";

function base64_to_bytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
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

async function sha256_hex(bytes: Uint8Array): Promise<string> {
  return to_hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

const sender_identity_raw = base64_to_bytes(SENDER_IDENTITY_RAW_B64);
const sender_ephemeral_raw = base64_to_bytes(SENDER_EPHEMERAL_RAW_B64);

const kem_keypair = ml_kem768.keygen(KEM_SEED);
const kem_encapsulation = ml_kem768.encapsulate(
  kem_keypair.publicKey,
  KEM_RANDOMNESS,
);

async function receive(
  version: number | undefined,
  pq: boolean,
  identity_lane: boolean,
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
  );

  return to_hex(secret);
}

describe("x3dh cross client vectors", () => {
  it("pins the deterministic ml-kem material the vectors are built on", async () => {
    expect(to_hex(kem_encapsulation.sharedSecret)).toBe(
      EXPECTED_PQ_SHARED_SECRET,
    );
    expect(await sha256_hex(kem_encapsulation.cipherText)).toBe(
      EXPECTED_PQ_CIPHERTEXT_DIGEST,
    );
  });

  it("derives the legacy classical secret", async () => {
    expect(await receive(X3DH_VERSION_LEGACY, false, false)).toBe(
      EXPECTED_CLASSICAL_V1,
    );
  });

  it("treats a missing version as legacy", async () => {
    expect(await receive(undefined, false, false)).toBe(EXPECTED_CLASSICAL_V1);
  });

  it("derives the transcript bound classical secret", async () => {
    expect(await receive(X3DH_VERSION_TRANSCRIPT_BOUND, false, false)).toBe(
      EXPECTED_CLASSICAL_V2,
    );
  });

  it("derives the legacy post-quantum secret", async () => {
    expect(await receive(X3DH_VERSION_LEGACY, true, false)).toBe(
      EXPECTED_PQ_V1,
    );
  });

  it("derives the transcript bound post-quantum secret", async () => {
    expect(await receive(X3DH_VERSION_TRANSCRIPT_BOUND, true, false)).toBe(
      EXPECTED_PQ_V2,
    );
  });

  it("derives the transcript bound identity lane secret", async () => {
    expect(await receive(X3DH_VERSION_TRANSCRIPT_BOUND, true, true)).toBe(
      EXPECTED_PQ_IDENTITY_V2,
    );
  });

  it("separates every version and lane", async () => {
    const secrets = new Set([
      EXPECTED_CLASSICAL_V1,
      EXPECTED_CLASSICAL_V2,
      EXPECTED_PQ_V1,
      EXPECTED_PQ_V2,
      EXPECTED_PQ_IDENTITY_V2,
    ]);

    expect(secrets.size).toBe(5);
  });
});
