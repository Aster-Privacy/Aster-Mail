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

vi.mock("./crypto_enforcement_policy", async (import_original) => {
  const original =
    await import_original<typeof import("./crypto_enforcement_policy")>();

  return {
    ...original,
    is_pqxdh_transcript_binding_enabled: () => true,
  };
});

vi.mock("./pq_prekey_store", () => ({
  save_pq_secret: vi.fn(async () => {}),
  load_pq_secret: vi.fn(async () => null),
  delete_pq_secret: vi.fn(async () => {}),
}));

import {
  perform_x3dh_sender,
  perform_x3dh_receiver,
  bundle_supports_transcript_binding,
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

async function build_parties(x3dh_max_version?: number | null) {
  const sender_identity = await generate_exportable_ke_keypair();
  const recipient_identity = await generate_exportable_ke_keypair();
  const recipient_signed_prekey = await generate_exportable_ke_keypair();

  const bundle: PrekeyBundle = {
    kem_identity_key: array_to_base64(recipient_identity.public_key_raw),
    signed_prekey: array_to_base64(recipient_signed_prekey.public_key_raw),
    signed_prekey_signature: "",
    x3dh_max_version,
  };

  return {
    sender_identity,
    recipient_identity,
    recipient_signed_prekey,
    bundle,
  };
}

describe("x3dh transcript binding capability gate", () => {
  it("treats a missing advertisement as legacy", () => {
    expect(
      bundle_supports_transcript_binding({
        kem_identity_key: "",
        signed_prekey: "",
        signed_prekey_signature: "",
      }),
    ).toBe(false);
  });

  it("rejects every value below the transcript bound version", () => {
    for (const advertised of [null, undefined, 0, 1, -1, NaN, Infinity]) {
      expect(
        bundle_supports_transcript_binding({
          kem_identity_key: "",
          signed_prekey: "",
          signed_prekey_signature: "",
          x3dh_max_version: advertised as number,
        }),
      ).toBe(false);
    }
  });

  it("accepts the transcript bound version and anything newer", () => {
    for (const advertised of [2, 3, 99]) {
      expect(
        bundle_supports_transcript_binding({
          kem_identity_key: "",
          signed_prekey: "",
          signed_prekey_signature: "",
          x3dh_max_version: advertised,
        }),
      ).toBe(true);
    }
  });

  it("stays on legacy derivation for a recipient that only advertises v1", async () => {
    const parties = await build_parties(1);

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.x3dh_version).toBe(1);

    const received = await perform_x3dh_receiver(
      parties.recipient_identity.secret_key_jwk,
      parties.recipient_signed_prekey.secret_key_jwk,
      parties.sender_identity.public_key_raw,
      result.ephemeral_public_key,
      null,
      null,
      result.x3dh_version,
    );

    expect(Array.from(received)).toEqual(Array.from(result.shared_secret));
  });

  it("stays on legacy derivation for a recipient that advertises nothing", async () => {
    const parties = await build_parties(undefined);

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.x3dh_version).toBe(1);
  });

  it("uses transcript bound derivation once the recipient advertises v2", async () => {
    const parties = await build_parties(2);

    const result = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(result.x3dh_version).toBe(2);

    const received = await perform_x3dh_receiver(
      parties.recipient_identity.secret_key_jwk,
      parties.recipient_signed_prekey.secret_key_jwk,
      parties.sender_identity.public_key_raw,
      result.ephemeral_public_key,
      null,
      null,
      result.x3dh_version,
    );

    expect(Array.from(received)).toEqual(Array.from(result.shared_secret));

    const legacy_attempt = await perform_x3dh_receiver(
      parties.recipient_identity.secret_key_jwk,
      parties.recipient_signed_prekey.secret_key_jwk,
      parties.sender_identity.public_key_raw,
      result.ephemeral_public_key,
      null,
      null,
      1,
    );

    expect(Array.from(legacy_attempt)).not.toEqual(
      Array.from(result.shared_secret),
    );
  });
});
