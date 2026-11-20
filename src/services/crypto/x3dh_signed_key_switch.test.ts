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

const h = vi.hoisted(() => ({
  require_signed: false,
  one_time_secrets: new Map<number, JsonWebKey>(),
}));

vi.mock("./crypto_enforcement_policy", async (import_original) => {
  const original =
    await import_original<typeof import("./crypto_enforcement_policy")>();

  return {
    ...original,
    is_pqxdh_transcript_binding_enabled: () => true,
    is_signed_ratchet_keys_required: () => h.require_signed,
  };
});

vi.mock("./pq_prekey_store", () => ({
  save_pq_secret: vi.fn(async () => {}),
  load_pq_secret: vi.fn(async () => null),
  delete_pq_secret: vi.fn(async () => {}),
}));

vi.mock("./pq_secret_reconciler", () => ({
  handle_missing_pq_secret: vi.fn(async () => {}),
}));

vi.mock("./ec_prekey_store", () => ({
  load_ec_one_time_secret: vi.fn(
    async (key_id: number) => h.one_time_secrets.get(key_id) ?? null,
  ),
}));

import {
  negotiate_x3dh_version,
  perform_x3dh_receiver,
  perform_x3dh_sender,
  restrict_bundle_to_signed_pq_key,
  X3DH_VERSION_KEY_BOUND,
  X3DH_VERSION_LEGACY,
  X3DH_VERSION_ONE_TIME_BOUND,
  type PrekeyBundle,
  type X3dhSenderResult,
} from "./x3dh";

const INJECTED_PREKEY_ID = 5151;

function array_to_base64(arr: Uint8Array): string {
  let binary = "";

  arr.forEach((b) => (binary += String.fromCharCode(b)));

  return btoa(binary);
}

function to_hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function generate_keypair() {
  const keypair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
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

async function build_parties(bundle_fields: Partial<PrekeyBundle> = {}) {
  const sender_identity = await generate_keypair();
  const recipient_identity = await generate_keypair();
  const recipient_signed_prekey = await generate_keypair();

  const bundle: PrekeyBundle = {
    kem_identity_key: array_to_base64(recipient_identity.public_key_raw),
    signed_prekey: array_to_base64(recipient_signed_prekey.public_key_raw),
    signed_prekey_signature: "",
    ...bundle_fields,
  };

  return {
    sender_identity,
    recipient_identity,
    recipient_signed_prekey,
    bundle,
  };
}

async function injected_one_time_prekey() {
  const unknown_to_recipient = await generate_keypair();

  return {
    key_id: INJECTED_PREKEY_ID,
    public_key: array_to_base64(unknown_to_recipient.public_key_raw),
  };
}

type Parties = Awaited<ReturnType<typeof build_parties>>;

async function receive(
  parties: Parties,
  sent: X3dhSenderResult,
): Promise<Uint8Array> {
  return perform_x3dh_receiver(
    parties.recipient_identity.secret_key_jwk,
    parties.recipient_signed_prekey.secret_key_jwk,
    parties.sender_identity.public_key_raw,
    sent.ephemeral_public_key,
    null,
    null,
    sent.x3dh_version,
    sent.one_time_prekey_id,
  );
}

beforeEach(() => {
  h.require_signed = false;
  h.one_time_secrets.clear();
});

describe("unsigned key agreement fields with the signed key switch off", () => {
  it("keeps the advertised one-time handshake as before", async () => {
    const parties = await build_parties({
      x3dh_max_version: 4,
      ec_one_time_prekey: await injected_one_time_prekey(),
    });

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(sent.one_time_prekey_id).toBe(INJECTED_PREKEY_ID);
  });

  it("keeps the legacy handshake for a bundle with no advertised version", async () => {
    const parties = await build_parties();

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_LEGACY);
    expect(negotiate_x3dh_version(null, null)).toBe(X3DH_VERSION_LEGACY);
  });
});

describe("unsigned key agreement fields with the signed key switch on", () => {
  beforeEach(() => {
    h.require_signed = true;
  });

  it("keeps the advertised one-time prekey so the handshake stays one-time bound", async () => {
    const one_time = await generate_keypair();
    const parties = await build_parties({
      x3dh_max_version: 4,
      ec_one_time_prekey: {
        key_id: INJECTED_PREKEY_ID,
        public_key: array_to_base64(one_time.public_key_raw),
      },
    });

    h.one_time_secrets.set(INJECTED_PREKEY_ID, one_time.secret_key_jwk);

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(sent.one_time_prekey_id).toBe(INJECTED_PREKEY_ID);
    expect(sent.one_time_prekey_missing).toBeUndefined();
    expect(to_hex(await receive(parties, sent))).toBe(
      to_hex(sent.shared_secret),
    );
  });

  it("gives the server nothing from a swapped one-time prekey beyond a failed handshake", async () => {
    const real_one_time = await generate_keypair();
    const parties = await build_parties({
      x3dh_max_version: 4,
      ec_one_time_prekey: await injected_one_time_prekey(),
    });

    h.one_time_secrets.set(INJECTED_PREKEY_ID, real_one_time.secret_key_jwk);

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_ONE_TIME_BOUND);
    expect(to_hex(await receive(parties, sent))).not.toBe(
      to_hex(sent.shared_secret),
    );
  });

  it("does not fall below the key bound handshake when the advertised version is removed", async () => {
    const parties = await build_parties();

    const sent = await perform_x3dh_sender(
      parties.sender_identity.secret_key_jwk,
      parties.bundle,
    );

    expect(sent.x3dh_version).toBe(X3DH_VERSION_KEY_BOUND);
    expect(negotiate_x3dh_version(1, null)).toBe(X3DH_VERSION_KEY_BOUND);
    expect(to_hex(await receive(parties, sent))).toBe(
      to_hex(sent.shared_secret),
    );
  });

  it("drops the unsigned one-time post-quantum prekey even when the signature does not cover the identity key", async () => {
    const parties = await build_parties({
      pq_prekey: { key_id: 9, public_key: "AAAA" },
    });

    expect(
      restrict_bundle_to_signed_pq_key(parties.bundle, false).pq_prekey,
    ).toBeUndefined();
  });
});
