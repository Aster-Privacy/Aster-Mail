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
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import {
  has_inbound_pgp_block,
  resolve_inbound_pgp_body,
  try_decrypt_pgp_body,
} from "./email_crypto";

import { PATCH_WITH_ARMOR_BODY } from "@/lib/literal_text_fixtures";

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
  const encrypted = await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: public_key_armored }),
    format: "armored",
  });

  return (encrypted as string).trim();
}

describe("undecryptable pgp armor stays visible", () => {
  let stranger_ciphertext = "";

  beforeEach(async () => {
    const own = await make_key("me@astermail.org");
    const stranger = await make_key("friend@example.org");

    stranger_ciphertext = await encrypt_to(stranger.publicKey, "for a friend");
    vault_state.vault = { identity_key: own.privateKey, previous_keys: [] };
    vault_state.passphrase = PASSPHRASE;
  });

  it("returns the armored block when it was encrypted to another key", async () => {
    const resolved = await resolve_inbound_pgp_body(stranger_ciphertext);

    expect(resolved).toEqual({ body: stranger_ciphertext, decrypted: false });
  });

  it("keeps the text before and after the block", async () => {
    const body = `Hi Bob,\n\nThe gpg output is below.\n\n${stranger_ciphertext}\n\nCheers,\nAlice\n`;
    const resolved = await resolve_inbound_pgp_body(body);

    expect(resolved.decrypted).toBe(false);
    expect(resolved.body).toBe(body);
  });

  it("keeps the armor when the keys are not loaded", async () => {
    vault_state.vault = null;

    expect(await try_decrypt_pgp_body(stranger_ciphertext)).toBe(
      stranger_ciphertext,
    );
  });

  it("keeps armor pasted into the rich text composer", async () => {
    const html =
      "<div>Encrypted with my offline key:</div>" +
      stranger_ciphertext
        .split("\n")
        .map((line) => (line ? `<div>${line}</div>` : "<div><br></div>"))
        .join("");
    const resolved = await resolve_inbound_pgp_body(html);

    expect(resolved).toEqual({ body: html, decrypted: false });
  });

  it("ignores armor that sits inside diff lines of a patch", async () => {
    expect(has_inbound_pgp_block(PATCH_WITH_ARMOR_BODY)).toBe(false);

    const resolved = await resolve_inbound_pgp_body(PATCH_WITH_ARMOR_BODY);

    expect(resolved).toEqual({
      body: PATCH_WITH_ARMOR_BODY,
      decrypted: false,
    });
  });

  it("still decrypts a block addressed to the account key", async () => {
    const own = await make_key("me2@astermail.org");

    vault_state.vault = { identity_key: own.privateKey, previous_keys: [] };

    const ciphertext = await encrypt_to(own.publicKey, "hello me");
    const resolved = await resolve_inbound_pgp_body(
      `Forwarded by my phone:\n${ciphertext}`,
    );

    expect(resolved).toEqual({ body: "hello me", decrypted: true });
  });
});
