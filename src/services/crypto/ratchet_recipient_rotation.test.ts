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
import { describe, it, expect, beforeEach, vi } from "vitest";

import type { EncryptedVault } from "@/services/crypto/key_manager";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  bundle: null as unknown,
  store: new Map<string, unknown>(),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => null,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => h.vault !== null,
}));

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_get: vi.fn(async (key: string) =>
    h.store.has(key) ? JSON.parse(JSON.stringify(h.store.get(key))) : undefined,
  ),
  encrypted_set: vi.fn(async (key: string, value: unknown) => {
    h.store.set(key, JSON.parse(JSON.stringify(value)));
  }),
  encrypted_delete: vi.fn(async (key: string) => {
    h.store.delete(key);
  }),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  get_cached_ratchet_plaintext: vi.fn(async () => null),
  set_cached_ratchet_plaintext: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) =>
      url.includes("prekey-bundle") ? { data: h.bundle } : { code: "NOT_FOUND" },
    ),
    put: vi.fn(async () => ({ data: { state_version: 1 } })),
    post: vi.fn(async () => ({ data: { state_version: 1 } })),
    delete: vi.fn(async () => ({})),
  },
}));

import {
  generate_ratchet_keys,
  encrypt_for_ratchet_recipient,
  build_ratchet_envelope,
  parse_ratchet_envelope,
  decrypt_ratchet_message,
} from "@/services/crypto/ratchet_manager";

const SENDER = "sender@astermail.org";
const RECIPIENT = "recipient@astermail.org";

type Keys = NonNullable<Awaited<ReturnType<typeof generate_ratchet_keys>>>;

function make_vault(keys: Keys): EncryptedVault {
  return {
    identity_key: "",
    ratchet_identity_key: keys.identity_jwk,
    ratchet_identity_public: keys.identity_public,
    ratchet_signed_prekey: keys.signed_prekey_jwk,
    ratchet_signed_prekey_public: keys.signed_prekey_public,
  } as unknown as EncryptedVault;
}

function bundle_for(keys: Keys) {
  return {
    kem_identity_key: keys.identity_public,
    signed_prekey: keys.signed_prekey_public,
    signed_prekey_signature: "",
    one_time_prekey: null,
    pq_prekey: null,
  };
}

async function send(plaintext: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;
  const data = await encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    plaintext,
    sender_vault,
  );

  expect(data).not.toBeNull();

  const envelope = build_ratchet_envelope(sender_vault.ratchet_identity_public!, {
    [RECIPIENT]: data!,
  });

  return { data: data!, envelope };
}

async function receive(envelope_json: string, receiver_vault: EncryptedVault) {
  h.vault = receiver_vault;
  const parsed = parse_ratchet_envelope(envelope_json)!;

  return decrypt_ratchet_message(RECIPIENT, SENDER, parsed, receiver_vault);
}

describe("sender re-bootstraps when the recipient rotates identity (incident repro)", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
  });

  it("delivers a readable message after the recipient rotated to a generation the sender never saw", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient_gen1 = make_vault((await generate_ratchet_keys())!);
    const recipient_gen2 = make_vault((await generate_ratchet_keys())!);

    // 1. Sender establishes a session against the recipient's gen-1 bundle.
    h.bundle = bundle_for({
      identity_jwk: recipient_gen1.ratchet_identity_key!,
      identity_public: recipient_gen1.ratchet_identity_public!,
      signed_prekey_jwk: recipient_gen1.ratchet_signed_prekey!,
      signed_prekey_public: recipient_gen1.ratchet_signed_prekey_public!,
    } as Keys);

    const first = await send("first message", sender_vault);

    expect(await receive(first.envelope, recipient_gen1)).toBe("first message");

    // 2. Recipient force-regenerates identity (the incident) and publishes a
    //    new bundle. Their gen-1 keys are gone (aged out), modelling a recipient
    //    that rotated more than the retained window.
    h.bundle = bundle_for({
      identity_jwk: recipient_gen2.ratchet_identity_key!,
      identity_public: recipient_gen2.ratchet_identity_public!,
      signed_prekey_jwk: recipient_gen2.ratchet_signed_prekey!,
      signed_prekey_public: recipient_gen2.ratchet_signed_prekey_public!,
    } as Keys);

    // 3. Sender sends again. It must NOT reuse the gen-1 session; it must detect
    //    the rotation and re-bootstrap to gen-2.
    const second = await send("second message", sender_vault);

    // A re-bootstrap is a fresh session: message number resets to 0.
    expect(second.data.header.message_number).toBe(0);

    // 4. The recipient on its current (gen-2) keys can read it.
    expect(await receive(second.envelope, recipient_gen2)).toBe("second message");
  });
});
