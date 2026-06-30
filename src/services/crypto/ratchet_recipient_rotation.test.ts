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

async function try_send(plaintext: string, sender_vault: EncryptedVault) {
  h.vault = sender_vault;

  return encrypt_for_ratchet_recipient(
    SENDER,
    RECIPIENT,
    "recipient",
    plaintext,
    sender_vault,
  );
}

describe("recipient identity pinning (server cannot silently swap ratchet keys)", () => {
  beforeEach(() => {
    h.vault = null;
    h.bundle = null;
    h.store.clear();
  });

  it("reuses the established session when the recipient bundle is unchanged", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for({
      identity_jwk: recipient.ratchet_identity_key!,
      identity_public: recipient.ratchet_identity_public!,
      signed_prekey_jwk: recipient.ratchet_signed_prekey!,
      signed_prekey_public: recipient.ratchet_signed_prekey_public!,
    } as Keys);

    const first = await send("first message", sender_vault);

    expect(first.data.header.message_number).toBe(0);

    const second = await send("second message", sender_vault);

    expect(second.data.header.message_number).toBe(1);
    expect(await receive(first.envelope, recipient)).toBe("first message");
    expect(await receive(second.envelope, recipient)).toBe("second message");
  });

  it("refuses to ratchet-bootstrap onto a recipient identity that differs from the pinned one", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const recipient_gen1 = make_vault((await generate_ratchet_keys())!);
    const recipient_gen2 = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for({
      identity_jwk: recipient_gen1.ratchet_identity_key!,
      identity_public: recipient_gen1.ratchet_identity_public!,
      signed_prekey_jwk: recipient_gen1.ratchet_signed_prekey!,
      signed_prekey_public: recipient_gen1.ratchet_signed_prekey_public!,
    } as Keys);

    const first = await send("first message", sender_vault);

    expect(await receive(first.envelope, recipient_gen1)).toBe("first message");

    h.bundle = bundle_for({
      identity_jwk: recipient_gen2.ratchet_identity_key!,
      identity_public: recipient_gen2.ratchet_identity_public!,
      signed_prekey_jwk: recipient_gen2.ratchet_signed_prekey!,
      signed_prekey_public: recipient_gen2.ratchet_signed_prekey_public!,
    } as Keys);

    const second = await try_send("second message", sender_vault);

    expect(second).toBeNull();
  });

  it("pins on first contact so a swapped identity on the very next send is refused", async () => {
    const sender_vault = make_vault((await generate_ratchet_keys())!);
    const honest = make_vault((await generate_ratchet_keys())!);
    const attacker = make_vault((await generate_ratchet_keys())!);

    h.bundle = bundle_for({
      identity_jwk: honest.ratchet_identity_key!,
      identity_public: honest.ratchet_identity_public!,
      signed_prekey_jwk: honest.ratchet_signed_prekey!,
      signed_prekey_public: honest.ratchet_signed_prekey_public!,
    } as Keys);

    expect(await try_send("legit", sender_vault)).not.toBeNull();

    h.bundle = bundle_for({
      identity_jwk: attacker.ratchet_identity_key!,
      identity_public: attacker.ratchet_identity_public!,
      signed_prekey_jwk: attacker.ratchet_signed_prekey!,
      signed_prekey_public: attacker.ratchet_signed_prekey_public!,
    } as Keys);

    expect(await try_send("intercept", sender_vault)).toBeNull();
  });
});
