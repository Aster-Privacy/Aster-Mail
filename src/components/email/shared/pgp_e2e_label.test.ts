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
import type { DecryptedEnvelope } from "@/types/email";

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as openpgp from "openpgp";

const vault_state: { vault: unknown; passphrase: string | null } = {
  vault: null,
  passphrase: null,
};

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_from_memory: () => vault_state.vault,
  get_passphrase_from_memory: () => vault_state.passphrase,
  get_passphrase_bytes: () => null,
  get_derived_encryption_key: () => new Uint8Array(32).fill(7),
  has_vault_in_memory: () => vault_state.vault !== null,
  wait_for_keys_ready: async () => false,
}));

vi.mock("@/utils/unsubscribe_detector", () => ({
  detect_unsubscribe_info: () => undefined,
}));

import { process_envelope_body } from "./build_email_from_envelope";

const PASSPHRASE = "test-passphrase";

async function make_key(email: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: email, email }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
}

async function encrypt_to(public_key_armored: string, text: string) {
  const encryptionKeys = await openpgp.readKey({
    armoredKey: public_key_armored,
  });

  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys,
    format: "armored",
  })) as string;
}

function make_envelope(body_text: string): DecryptedEnvelope {
  return {
    version: 1,
    from: { email: "sender@example.test", name: "Sender" },
    to: [{ email: "recipient@aster.cx", name: "" }],
    cc: [],
    bcc: [],
    subject: "Hello",
    sent_at: "2026-11-03T12:00:00.000Z",
    body_text,
    body_html: "",
  } as unknown as DecryptedEnvelope;
}

describe("end-to-end flag for inbound PGP mail", () => {
  beforeEach(() => {
    vault_state.vault = null;
    vault_state.passphrase = PASSPHRASE;
  });

  it("marks a body decrypted with our key as end-to-end", async () => {
    const key = await make_key("recipient@aster.cx");

    vault_state.vault = { identity_key: key.privateKey, previous_keys: [] };
    const ciphertext = await encrypt_to(key.publicKey, "hello from outside");
    const result = await process_envelope_body(make_envelope(ciphertext));

    expect(result.body_text).toContain("hello from outside");
    expect(result.e2e_verified).toBe(true);
  });

  it("does not mark a body that no held key can decrypt", async () => {
    const identity = await make_key("recipient@aster.cx");
    const stranger = await make_key("stranger@example.test");

    vault_state.vault = {
      identity_key: identity.privateKey,
      previous_keys: [],
    };
    const ciphertext = await encrypt_to(stranger.publicKey, "secret");
    const result = await process_envelope_body(make_envelope(ciphertext));

    expect(result.e2e_verified).toBe(false);
  });

  it("does not mark plain mail", async () => {
    const result = await process_envelope_body(
      make_envelope("just a normal message"),
    );

    expect(result.e2e_verified).toBe(false);
  });
});
