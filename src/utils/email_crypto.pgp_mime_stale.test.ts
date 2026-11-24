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
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
  get_vault_from_memory: () => vault_state.vault,
  get_passphrase_from_memory: () => vault_state.passphrase,
  get_passphrase_bytes: () => null,
  wait_for_keys_ready: async () => false,
}));

import { resolve_inbound_pgp_body } from "./email_crypto";

import {
  clear_decrypted_mime_attachments,
  get_decrypted_mime_attachments,
} from "@/services/decrypted_mime_attachments";
import {
  file_part,
  multipart,
  text_part,
} from "@/tests/fixtures/pgp_mime_fixture";

const passphrase = "throwaway-test-passphrase";
const MAIL_ITEM_ID = "mail-stale-1";

async function make_test_key(email: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "Throwaway Test Key", email }],
    passphrase,
    format: "armored",
  });
}

async function encrypt_text(
  recipient_public: string,
  text: string,
): Promise<string> {
  const encryptionKeys = await openpgp.readKey({ armoredKey: recipient_public });

  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys,
    format: "armored",
  })) as string;
}

function with_file(): string {
  return multipart("mixed", "stale-outer", [
    text_part("plain", "First body."),
    file_part({
      filename_header: 'filename="earlier.pdf"',
      content_type: "application/pdf",
      data: new TextEncoder().encode("%PDF-1.4\n%fixture\n"),
    }),
  ]);
}

function filenames(): string[] {
  return get_decrypted_mime_attachments(MAIL_ITEM_ID).map((p) => p.filename);
}

describe("decrypted files follow the latest decrypt of a message", () => {
  let public_key = "";

  beforeEach(async () => {
    const key = await make_test_key("recipient@test.invalid");

    public_key = key.publicKey;
    vault_state.vault = { identity_key: key.privateKey, previous_keys: [] };
    vault_state.passphrase = passphrase;
    clear_decrypted_mime_attachments();
  });

  it("drops earlier files when a later decrypt is plain text", async () => {
    await resolve_inbound_pgp_body(
      await encrypt_text(public_key, with_file()),
      undefined,
      MAIL_ITEM_ID,
    );

    expect(filenames()).toEqual(["earlier.pdf"]);

    const later = await resolve_inbound_pgp_body(
      await encrypt_text(public_key, "just words"),
      undefined,
      MAIL_ITEM_ID,
    );

    expect(later.decrypted).toBe(true);
    expect(filenames()).toEqual([]);
  }, 60_000);

  it("drops earlier files when a later MIME decrypt has none", async () => {
    await resolve_inbound_pgp_body(
      await encrypt_text(public_key, with_file()),
      undefined,
      MAIL_ITEM_ID,
    );

    await resolve_inbound_pgp_body(
      await encrypt_text(
        public_key,
        multipart("mixed", "plain-outer", [text_part("plain", "No files.")]),
      ),
      undefined,
      MAIL_ITEM_ID,
    );

    expect(filenames()).toEqual([]);
  }, 60_000);

  it("gives each decrypted text its own tag", async () => {
    const first = await resolve_inbound_pgp_body(
      await encrypt_text(public_key, with_file()),
      undefined,
      MAIL_ITEM_ID,
    );
    const second = await resolve_inbound_pgp_body(
      await encrypt_text(public_key, "just words"),
      undefined,
      MAIL_ITEM_ID,
    );
    const again = await resolve_inbound_pgp_body(
      await encrypt_text(public_key, "just words"),
    );

    expect(first.decrypted_content_tag).toMatch(/^[0-9a-f]{64}$/);
    expect(second.decrypted_content_tag).toMatch(/^[0-9a-f]{64}$/);
    expect(second.decrypted_content_tag).not.toBe(first.decrypted_content_tag);
    expect(again.decrypted_content_tag).toBe(second.decrypted_content_tag);
  }, 60_000);
});
