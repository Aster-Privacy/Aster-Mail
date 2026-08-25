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
import { describe, it, expect, beforeAll } from "vitest";
import * as openpgp from "openpgp";

import {
  sign_ratchet_prekey_bundle,
  verify_ratchet_prekey_bundle,
} from "./key_manager_pgp";
import { array_to_base64 } from "./key_manager_core";

const PASSPHRASE = "correct horse battery staple";

const KEM_IDENTITY = array_to_base64(new Uint8Array(65).fill(7));
const SIGNED_PREKEY = array_to_base64(new Uint8Array(65).fill(9));
const PQ_IDENTITY = array_to_base64(new Uint8Array(1184).fill(11));

let owner_private = "";
let owner_public = "";
let attacker_public = "";

async function sign_canonical(text: string): Promise<string> {
  const identity_key = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: owner_private }),
    passphrase: PASSPHRASE,
  });

  const message = await openpgp.createCleartextMessage({ text });
  const signed = await openpgp.sign({
    message,
    signingKeys: identity_key,
    format: "armored",
  });

  return array_to_base64(new TextEncoder().encode(String(signed)));
}

async function generate_pgp(): Promise<{
  privateKey: string;
  publicKey: string;
}> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "Test", email: "test@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { privateKey, publicKey };
}

beforeAll(async () => {
  const owner = await generate_pgp();

  owner_private = owner.privateKey;
  owner_public = owner.publicKey;

  const attacker = await generate_pgp();

  attacker_public = attacker.publicKey;
}, 60000);

describe("ratchet prekey bundle signature", () => {
  it("round-trips: a freshly signed bundle verifies as 'verified'", async () => {
    const field = await sign_ratchet_prekey_bundle(
      owner_private,
      PASSPHRASE,
      KEM_IDENTITY,
      SIGNED_PREKEY,
    );

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      owner_public,
    );

    expect(verdict).toBe("verified");
  });

  it("flags a swapped identity key as 'tampered'", async () => {
    const field = await sign_ratchet_prekey_bundle(
      owner_private,
      PASSPHRASE,
      KEM_IDENTITY,
      SIGNED_PREKEY,
    );

    const swapped_kem = array_to_base64(new Uint8Array(65).fill(42));

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      swapped_kem,
      SIGNED_PREKEY,
      owner_public,
    );

    expect(verdict).toBe("tampered");
  });

  it("flags a swapped signed prekey as 'tampered'", async () => {
    const field = await sign_ratchet_prekey_bundle(
      owner_private,
      PASSPHRASE,
      KEM_IDENTITY,
      SIGNED_PREKEY,
    );

    const swapped_spk = array_to_base64(new Uint8Array(65).fill(42));

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      swapped_spk,
      owner_public,
    );

    expect(verdict).toBe("tampered");
  });

  it("flags a valid signature from the wrong identity key as 'tampered'", async () => {
    const field = await sign_ratchet_prekey_bundle(
      owner_private,
      PASSPHRASE,
      KEM_IDENTITY,
      SIGNED_PREKEY,
    );

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      attacker_public,
    );

    expect(verdict).toBe("tampered");
  });

  it("treats a legacy hash signature field as 'legacy' (non-rejecting)", async () => {
    const input = new TextEncoder().encode(KEM_IDENTITY + SIGNED_PREKEY);
    const hash = await crypto.subtle.digest("SHA-256", input);
    const legacy_field = array_to_base64(new Uint8Array(hash));

    const verdict = await verify_ratchet_prekey_bundle(
      legacy_field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      owner_public,
    );

    expect(verdict).toBe("legacy");
  });

  it("returns 'unknown' (non-rejecting) when the owner key is unavailable", async () => {
    const field = await sign_ratchet_prekey_bundle(
      owner_private,
      PASSPHRASE,
      KEM_IDENTITY,
      SIGNED_PREKEY,
    );

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      null,
    );

    expect(verdict).toBe("unknown");
  });

  it("verifies a v2 canonical binding the pq identity key", async () => {
    const v2_text = `aster-ratchet-prekey-v2:${KEM_IDENTITY}.${SIGNED_PREKEY}.${PQ_IDENTITY}`;
    const field = await sign_canonical(v2_text);

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      owner_public,
      PQ_IDENTITY,
    );

    expect(verdict).toBe("verified");
  });

  it("flags a v2 bundle with a swapped pq identity key as 'tampered'", async () => {
    const v2_text = `aster-ratchet-prekey-v2:${KEM_IDENTITY}.${SIGNED_PREKEY}.${PQ_IDENTITY}`;
    const field = await sign_canonical(v2_text);

    const swapped_pq = array_to_base64(new Uint8Array(1184).fill(42));

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      owner_public,
      swapped_pq,
    );

    expect(verdict).toBe("tampered");
  });

  it("still verifies a v1 bundle when a pq identity key is also supplied", async () => {
    const field = await sign_ratchet_prekey_bundle(
      owner_private,
      PASSPHRASE,
      KEM_IDENTITY,
      SIGNED_PREKEY,
    );

    const verdict = await verify_ratchet_prekey_bundle(
      field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      owner_public,
      PQ_IDENTITY,
    );

    expect(verdict).toBe("verified");
  });

  it("never returns 'tampered' for a legacy bundle even with a wrong key", async () => {
    const input = new TextEncoder().encode(KEM_IDENTITY + SIGNED_PREKEY);
    const hash = await crypto.subtle.digest("SHA-256", input);
    const legacy_field = array_to_base64(new Uint8Array(hash));

    const verdict = await verify_ratchet_prekey_bundle(
      legacy_field,
      KEM_IDENTITY,
      SIGNED_PREKEY,
      attacker_public,
    );

    expect(verdict).toBe("legacy");
  });
});
