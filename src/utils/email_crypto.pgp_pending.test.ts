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
import * as openpgp from "openpgp";

const vault_state: { vault: unknown; passphrase: string | null } = {
  vault: null,
  passphrase: null,
};

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => vault_state.vault,
  get_passphrase_from_memory: () => vault_state.passphrase,
  get_passphrase_bytes: () => null,
  wait_for_keys_ready: async () => false,
}));

import { decrypt_body_text_with_bundle } from "./email_crypto";

const PASSPHRASE = "test-passphrase";

async function encrypted_body_with_footer() {
  const key = await openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "me", email: "me@example.test" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  const armored = (await openpgp.encrypt({
    message: await openpgp.createMessage({ text: "the real message" }),
    encryptionKeys: await openpgp.readKey({ armoredKey: key.publicKey }),
    format: "armored",
  })) as string;

  return {
    private_key: key.privateKey,
    body: `${armored}\n\n-- \nlist footer: unsubscribe`,
  };
}

describe("decrypt_body_text_with_bundle PGP status", () => {
  beforeEach(() => {
    vault_state.vault = null;
    vault_state.passphrase = PASSPHRASE;
  });

  it("flags a PGP block it could not decrypt even when text surrounds it", async () => {
    const { body } = await encrypted_body_with_footer();

    const bundle = await decrypt_body_text_with_bundle(
      body,
      "me@example.test",
      "sender@example.test",
      "m1",
    );

    expect(bundle.body).toContain("list footer");
    expect(bundle.pgp_undecrypted).toBe(true);
  });

  it("does not flag a PGP block once the keys can open it", async () => {
    const { body, private_key } = await encrypted_body_with_footer();

    vault_state.vault = { identity_key: private_key, previous_keys: [] };

    const bundle = await decrypt_body_text_with_bundle(
      body,
      "me@example.test",
      "sender@example.test",
      "m1",
    );

    expect(bundle.body).toBe("the real message");
    expect(bundle.pgp_undecrypted).toBe(false);
  });

  it("does not flag a plain body", async () => {
    const bundle = await decrypt_body_text_with_bundle(
      "hello there",
      "me@example.test",
      "sender@example.test",
      "m1",
    );

    expect(bundle.body).toBe("hello there");
    expect(bundle.pgp_undecrypted).toBe(false);
  });
});
