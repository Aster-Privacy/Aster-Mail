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
import type { PrivateKey } from "openpgp";

import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PASSPHRASE = "external decrypt passphrase";

const h = vi.hoisted(() => ({
  vault: null as unknown,
  external_keys: [] as PrivateKey[],
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  on_vault_stored: () => () => {},
  get_vault_account_epoch: () => 0,
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => PASSPHRASE,
  get_passphrase_bytes: () => new TextEncoder().encode(PASSPHRASE),
  has_vault_in_memory: () => h.vault !== null,
  wait_for_keys_ready: vi.fn(async () => {}),
  store_vault_in_memory: vi.fn(async () => {}),
  on_vault_cleared: vi.fn(() => () => {}),
}));

vi.mock("@/services/crypto/external_pgp_key", () => ({
  get_external_decryption_keys: () => h.external_keys,
  get_external_unlocked_armored_keys: () =>
    h.external_keys.map((key) => key.armor()),
  is_external_pgp_key_loading: () => false,
  settle_external_pgp_key_load: async () => {},
  get_external_signing_key: () => null,
}));

vi.mock("@/services/crypto/vault_refresh", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  fetch_refreshed_vault: vi.fn(async () => null),
  adopt_refreshed_vault: vi.fn(async () => {}),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async () => ({ code: "NOT_FOUND" })),
    put: vi.fn(async () => ({ data: {} })),
    post: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({})),
  },
}));

vi.mock("@/services/api/keys", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_recipient_public_key: vi.fn(async () => ({ data: { public_key: "" } })),
}));

vi.mock("@/services/account_manager", async (import_original) => ({
  ...(await import_original<Record<string, unknown>>()),
  get_current_account: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

import { resolve_inbound_pgp_body } from "@/utils/email_crypto";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import { decrypt_pgp_message_parallel } from "@/workers/pgp_decrypt_pool";
import { decrypt_attachment_meta } from "@/services/crypto/attachment_crypto";
import { array_to_base64 } from "@/services/crypto/envelope";

let own_private = "";
let external_key: PrivateKey;
let external_public = "";

async function encrypt_to_external(text: string): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: await openpgp.readKey({ armoredKey: external_public }),
    format: "armored",
  })) as string;
}

function as_base64(text: string): string {
  return array_to_base64(new TextEncoder().encode(text));
}

beforeAll(async () => {
  const own = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });
  const external = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    format: "object",
  });

  own_private = own.privateKey;
  external_key = external.privateKey;
  external_public = external.publicKey.armor();
}, 60_000);

beforeEach(() => {
  h.vault = { identity_key: own_private, previous_keys: [] };
  h.external_keys = [external_key];
});

describe("mail encrypted to the imported key", () => {
  it("opens an inline PGP body", async () => {
    const ciphertext = (await encrypt_to_external("hello outside")).trim();

    await expect(resolve_inbound_pgp_body(ciphertext)).resolves.toEqual({
      body: "hello outside",
      decrypted: true,
      verified: false,
    });
  });

  it("leaves an inline PGP body sealed without the imported key", async () => {
    h.external_keys = [];

    const ciphertext = (await encrypt_to_external("hello outside")).trim();
    const resolved = await resolve_inbound_pgp_body(ciphertext);

    expect(resolved.decrypted).toBe(false);
  });

  it("opens a PGP envelope", async () => {
    const envelope = JSON.stringify({
      version: 1,
      subject: "From outside",
      body_text: "Body",
      body_html: "<p>Body</p>",
      from: { name: "", email: "friend@example.org" },
      to: [{ name: "", email: "owner@astermail.org" }],
      cc: [],
      bcc: [],
      sent_at: "2026-11-01T10:00:00.000Z",
    });
    const opened = await decrypt_mail_envelope<{ subject?: string }>(
      as_base64(await encrypt_to_external(envelope)),
      "",
    );

    expect(opened?.subject).toBe("From outside");
  });

  it("opens a message through the list decrypt pool", async () => {
    const ciphertext = await encrypt_to_external("from the list");

    await expect(
      decrypt_pgp_message_parallel(ciphertext, [own_private], PASSPHRASE),
    ).resolves.toBe("from the list");
  });

  it("opens attachment metadata", async () => {
    const meta = JSON.stringify({
      filename: "report.pdf",
      content_type: "application/pdf",
      session_key: "c2Vzc2lvbg==",
    });
    const opened = await decrypt_attachment_meta(
      as_base64(await encrypt_to_external(meta)),
    );

    expect(opened.filename).toBe("report.pdf");
    expect(opened.content_type).toBe("application/pdf");
  });
});
