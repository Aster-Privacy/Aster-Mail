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
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as openpgp from "openpgp";

const h = vi.hoisted(() => ({
  identity_key: "" as string,
  previous_keys: [] as string[],
  passphrase: "attachment passphrase" as string | null,
  capabilities: { data: { format_writes: true } } as unknown,
  capability_fetches: 0,
}));

vi.mock("./memory_key_store", () => ({
  get_passphrase_from_memory: () => h.passphrase,
  get_passphrase_bytes: () =>
    h.passphrase === null ? null : new TextEncoder().encode(h.passphrase),
  get_vault_from_memory: () => ({
    identity_key: h.identity_key,
    previous_keys: h.previous_keys,
  }),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  attachment_keys_version: () => 0,
  get_attachment_key: vi.fn(() => ""),
  get_attachment_entry: vi.fn(() => null),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: vi.fn(async (url: string) => {
      if (url === "/crypto/v1/keys/account-key/capabilities") {
        h.capability_fetches++;
        if (h.capabilities instanceof Error) throw h.capabilities;

        return h.capabilities;
      }

      return { code: "NOT_FOUND" };
    }),
  },
}));

import {
  encrypt_attachments_for_send,
  decrypt_attachment_meta,
  decrypt_attachment_data,
  clear_unreadable_attachment_rows,
} from "./attachment_crypto";
import { base64_to_array } from "./envelope";

import { reset_account_key_capabilities_cache } from "@/services/api/account_key";

import type { Attachment } from "@/components/compose/compose_shared";

const PASSPHRASE = "attachment passphrase";

let own_key = "";
let own_public = "";
let other_key = "";

function make_attachment(name: string, bytes: Uint8Array): Attachment {
  return {
    id: name,
    name,
    mime_type: "application/pdf",
    size_bytes: bytes.byteLength,
    data: bytes.buffer.slice(0),
    is_inline: false,
    content_id: "cid-1",
  } as unknown as Attachment;
}

function decode_text(b64: string): string {
  return new TextDecoder().decode(base64_to_array(b64));
}

async function send_one(bytes: Uint8Array) {
  const [att] = await encrypt_attachments_for_send([
    make_attachment("report.pdf", bytes),
  ]);

  return att;
}

async function generate(): Promise<{
  private_key: string;
  public_key: string;
}> {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email: "owner@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  return { private_key: privateKey, public_key: publicKey };
}

beforeAll(async () => {
  const own = await generate();
  const other = await generate();

  own_key = own.private_key;
  own_public = own.public_key;
  other_key = other.private_key;
}, 30000);

beforeEach(() => {
  reset_account_key_capabilities_cache();
  clear_unreadable_attachment_rows();
  h.identity_key = own_key;
  h.previous_keys = [];
  h.passphrase = PASSPHRASE;
  h.capabilities = { data: { format_writes: true } };
  h.capability_fetches = 0;
});

describe("sender attachment metadata sealed to the identity key", () => {
  it("writes an armored PGP message with a zero nonce when enabled", async () => {
    const att = await send_one(new Uint8Array([1, 2, 3]));
    const armored = decode_text(att.sender_encrypted_meta);

    expect(armored.startsWith("-----BEGIN PGP MESSAGE-----")).toBe(true);
    expect(armored).not.toContain("report.pdf");
    expect(base64_to_array(att.sender_meta_nonce)).toEqual(new Uint8Array(12));
  });

  it("opens through the reader and decrypts the attachment", async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(4096));
    const att = await send_one(bytes);
    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
    expect(meta.content_type).toBe("application/pdf");
    expect(meta.content_id).toBe("cid-1");

    const data = await decrypt_attachment_data(
      att.encrypted_data,
      att.data_nonce,
      meta.session_key,
      undefined,
      0,
    );

    expect(new Uint8Array(data)).toEqual(bytes);
  });

  it("is signed by the owner", async () => {
    const att = await send_one(new Uint8Array([4, 5]));
    const key = await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: own_key }),
      passphrase: PASSPHRASE,
    });
    const result = await openpgp.decrypt({
      message: await openpgp.readMessage({
        armoredMessage: decode_text(att.sender_encrypted_meta),
      }),
      decryptionKeys: key,
      verificationKeys: await openpgp.readKey({ armoredKey: own_public }),
      expectSigned: true,
    });

    expect(JSON.parse(result.data as string).filename).toBe("report.pdf");
  });

  it("still opens after the key is relocked with a new password", async () => {
    const att = await send_one(new Uint8Array([6]));
    const relocked = await openpgp.encryptKey({
      privateKey: await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: own_key }),
        passphrase: PASSPHRASE,
      }),
      passphrase: "a brand new password",
    });

    h.identity_key = relocked.armor();
    h.passphrase = "a brand new password";

    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
  });

  it("still opens after the identity key moves to previous keys", async () => {
    const att = await send_one(new Uint8Array([7]));

    h.identity_key = other_key;
    h.previous_keys = [own_key];

    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
  });

  it("checks the flag once for several attachments", async () => {
    const results = await encrypt_attachments_for_send([
      make_attachment("a.pdf", new Uint8Array([1])),
      make_attachment("b.pdf", new Uint8Array([2])),
    ]);

    expect(h.capability_fetches).toBe(1);
    for (const att of results) {
      expect(
        decode_text(att.sender_encrypted_meta).startsWith(
          "-----BEGIN PGP MESSAGE-----",
        ),
      ).toBe(true);
    }
  });
});

describe("legacy sender attachment metadata", () => {
  async function expect_legacy() {
    const att = await send_one(new Uint8Array([9, 9]));

    expect(decode_text(att.sender_encrypted_meta)).not.toContain("BEGIN PGP");
    expect(base64_to_array(att.sender_meta_nonce)).toHaveLength(12);
    expect(base64_to_array(att.sender_meta_nonce).some((b) => b !== 0)).toBe(
      true,
    );

    const meta = await decrypt_attachment_meta(
      att.sender_encrypted_meta,
      att.sender_meta_nonce,
    );

    expect(meta.filename).toBe("report.pdf");
  }

  it("is written when the flag is off", async () => {
    h.capabilities = { data: { format_writes: false } };
    await expect_legacy();
  });

  it("is written when the server predates the flag", async () => {
    h.capabilities = { code: "NOT_FOUND", error: "not found" };
    await expect_legacy();
  });

  it("is written when the flag is not a boolean", async () => {
    h.capabilities = { data: { format_writes: "true" } };
    await expect_legacy();
  });

  it("is written when the capability request throws", async () => {
    h.capabilities = new Error("offline");
    await expect_legacy();
  });

  it("is written when the identity key does not open with the passphrase", async () => {
    h.identity_key = JSON.stringify({ kty: "EC" });
    await expect_legacy();
  });
});
