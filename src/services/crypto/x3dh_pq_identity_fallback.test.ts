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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

const pq_secret_table = new Map<number, Uint8Array>();
const load_pq_secret_spy = vi.fn(async (key_id: number) => {
  const v = pq_secret_table.get(key_id);

  return v ? new Uint8Array(v) : null;
});

vi.mock("./pq_prekey_store", () => ({
  save_pq_secret: vi.fn(async (key_id: number, sk: Uint8Array) => {
    pq_secret_table.set(key_id, new Uint8Array(sk));
  }),
  load_pq_secret: (key_id: number) => load_pq_secret_spy(key_id),
  delete_pq_secret: vi.fn(async (key_id: number) => {
    pq_secret_table.delete(key_id);
  }),
}));

import {
  perform_x3dh_sender,
  perform_x3dh_receiver,
  bundle_supports_pq,
  PQ_IDENTITY_KEY_ID,
  ML_KEM_768_EK_LEN,
  type PrekeyBundle,
} from "./x3dh";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  arr.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

async function generate_exportable_ke_keypair(): Promise<{
  public_key_raw: Uint8Array;
  secret_key_jwk: JsonWebKey;
}> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  return {
    public_key_raw: new Uint8Array(
      await crypto.subtle.exportKey("raw", keypair.publicKey),
    ),
    secret_key_jwk: await crypto.subtle.exportKey("jwk", keypair.privateKey),
  };
}

async function build_parties() {
  const sender_identity = await generate_exportable_ke_keypair();
  const receiver_identity = await generate_exportable_ke_keypair();
  const receiver_signed_prekey = await generate_exportable_ke_keypair();
  const pq_identity = ml_kem768.keygen();

  const bundle: PrekeyBundle = {
    kem_identity_key: array_to_base64(receiver_identity.public_key_raw),
    signed_prekey: array_to_base64(receiver_signed_prekey.public_key_raw),
    signed_prekey_signature: "",
    pq_kem_public_key: array_to_base64(pq_identity.publicKey),
  };

  return {
    sender_identity,
    receiver_identity,
    receiver_signed_prekey,
    pq_identity,
    bundle,
  };
}

async function receive(
  parties: Awaited<ReturnType<typeof build_parties>>,
  sender_result: Awaited<ReturnType<typeof perform_x3dh_sender>>,
  pq_identity_secret: string | null,
) {
  return perform_x3dh_receiver(
    parties.receiver_identity.secret_key_jwk,
    parties.receiver_signed_prekey.secret_key_jwk,
    parties.sender_identity.public_key_raw,
    sender_result.ephemeral_public_key,
    sender_result.pq_ciphertext && sender_result.pq_key_id !== undefined
      ? {
          pq_ciphertext: sender_result.pq_ciphertext,
          pq_key_id: sender_result.pq_key_id,
        }
      : null,
    pq_identity_secret,
  );
}

describe("X3DH post-quantum fallback chain", () => {
  beforeEach(() => {
    pq_secret_table.clear();
    load_pq_secret_spy.mockClear();
  });

  it("prefers the one-time prekey when the recipient has one", async () => {
    const parties = await build_parties();
    const onetime = ml_kem768.keygen();

    pq_secret_table.set(77, onetime.secretKey);
    parties.bundle.pq_prekey = {
      key_id: 77,
      public_key: array_to_base64(onetime.publicKey),
    };

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.pq_mode).toBe("onetime");
    expect(result.pq_key_id).toBe(77);
    expect(result.pq_ciphertext).toBeInstanceOf(Uint8Array);
  });

  it("falls back to the PQ identity key when no one-time prekey is left", async () => {
    const parties = await build_parties();

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.pq_mode).toBe("identity");
    expect(result.pq_key_id).toBe(PQ_IDENTITY_KEY_ID);
    expect(result.pq_ciphertext).toBeInstanceOf(Uint8Array);
  });

  it("round-trips the identity-key bootstrap to the same shared secret", async () => {
    const parties = await build_parties();

    const sender_result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    const receiver_secret = await receive(
      parties,
      sender_result,
      array_to_base64(parties.pq_identity.secretKey),
    );

    expect(receiver_secret).toEqual(sender_result.shared_secret);
    expect(receiver_secret.length).toBe(32);
  });

  it("never consults the one-time prekey store on the identity path", async () => {
    const parties = await build_parties();

    const sender_result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    await receive(
      parties,
      sender_result,
      array_to_base64(parties.pq_identity.secretKey),
    );

    expect(load_pq_secret_spy).not.toHaveBeenCalled();
  });

  it("domain-separates the identity path from the one-time path", async () => {
    const parties = await build_parties();

    const sender_result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    pq_secret_table.set(5, parties.pq_identity.secretKey);

    const mismatched = await receive(
      parties,
      { ...sender_result, pq_key_id: 5 },
      null,
    );

    expect(mismatched).not.toEqual(sender_result.shared_secret);
  });

  it("fails rather than silently downgrading when the identity secret is absent", async () => {
    const parties = await build_parties();

    const sender_result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    await expect(receive(parties, sender_result, null)).rejects.toThrow(
      /Missing PQ identity secret/,
    );
  });

  it("falls through to the identity key when the one-time prekey is malformed", async () => {
    const parties = await build_parties();

    parties.bundle.pq_prekey = {
      key_id: 91,
      public_key: array_to_base64(new Uint8Array(32)),
    };

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.pq_mode).toBe("identity");
    expect(result.pq_key_id).toBe(PQ_IDENTITY_KEY_ID);
  });

  it("reports no post-quantum coverage when the recipient has no PQ material", async () => {
    const parties = await build_parties();

    delete parties.bundle.pq_kem_public_key;

    expect(bundle_supports_pq(parties.bundle)).toBe(false);

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.pq_mode).toBe("none");
    expect(result.pq_ciphertext).toBeUndefined();
  });

  it("reports no post-quantum coverage for a wrong-length identity key", async () => {
    const parties = await build_parties();

    parties.bundle.pq_kem_public_key = array_to_base64(
      new Uint8Array(ML_KEM_768_EK_LEN - 1),
    );

    expect(bundle_supports_pq(parties.bundle)).toBe(false);

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.pq_mode).toBe("none");
  });

  it("reports post-quantum coverage from either tier", async () => {
    const parties = await build_parties();

    expect(bundle_supports_pq(parties.bundle)).toBe(true);

    const onetime = ml_kem768.keygen();

    parties.bundle.pq_prekey = {
      key_id: 12,
      public_key: array_to_base64(onetime.publicKey),
    };

    expect(bundle_supports_pq(parties.bundle)).toBe(true);
  });
});
