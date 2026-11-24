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
  bytes_to_base64_lines,
  sha256_hex,
} from "@/tests/fixtures/pgp_mime_fixture";

const passphrase = "throwaway-test-passphrase";

async function make_test_key(email: string) {
  return openpgp.generateKey({
    type: "ecc",
    curve: "ed25519Legacy",
    userIDs: [{ name: "Throwaway Test Key", email }],
    passphrase,
    format: "armored",
  });
}

function relay_rewrite(raw: string, protected_headers: boolean): string {
  const lines = raw.replace(/\s+$/, "").split(/\r\n|\r|\n/);
  let plain_text_only = false;
  const out = lines.map((line, index) => {
    const lower = line.toLowerCase();

    if (
      protected_headers &&
      (lower.startsWith("content-type: text/plain") ||
        lower.startsWith("content-type: multipart/"))
    ) {
      if (lower.startsWith("content-type: text/plain")) plain_text_only = true;

      return `${line.trimEnd()}; protected-headers="v1"\r\n`;
    }

    if (protected_headers && plain_text_only && index === lines.length - 1) {
      return `${line.trimEnd()}\r\n--\r\n`;
    }

    return `${line.trimEnd()}\r\n`;
  });

  return `${out.join("").replace(/\s+$/, "")}\r\n`;
}

const pdf_bytes = new TextEncoder().encode("%PDF-1.4\n%relay fixture\n%%EOF\n");
const png_bytes = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13,
]);

function relay_body(): string {
  return [
    "Content-Type: multipart/mixed; boundary=Ab3-dE_f",
    "",
    "--Ab3-dE_f",
    "Content-Type: multipart/related; boundary=Rr9_xY-z",
    "",
    "--Rr9_xY-z",
    "Content-Type: multipart/alternative; boundary=Qw1-eR_t",
    "",
    "--Qw1-eR_t",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Here are the files.   ",
    "--Qw1-eR_t",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    '<p>Here are the files.</p><img src=3D"cid:logo@relay">',
    "--Qw1-eR_t--",
    "",
    "--Rr9_xY-z",
    "Content-Type: image/png; name=logo.png",
    "Content-Transfer-Encoding: base64",
    "Content-ID: <logo@relay>",
    "Content-Disposition: inline; name=logo.png; filename=logo.png",
    "",
    bytes_to_base64_lines(png_bytes),
    "--Rr9_xY-z--",
    "",
    "--Ab3-dE_f",
    "Content-Type: application/pdf; name=invoice.pdf",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; name=invoice.pdf; filename=invoice.pdf",
    "",
    bytes_to_base64_lines(pdf_bytes),
    "--Ab3-dE_f--",
    "",
  ].join("\r\n");
}

function relay_full_message(): string {
  return [
    "From: Sender <sender@test.invalid>",
    "To: alias@test.invalid",
    "Subject: Files",
    "Date: Mon, 23 Nov 2026 10:00:00 +0000",
    "Message-ID: <relay-1@test.invalid>",
    "MIME-Version: 1.0",
    relay_body(),
  ].join("\r\n");
}

async function encrypt_like_gnupg(
  recipient_public: string,
  signer_private: string,
  plaintext: string,
): Promise<string> {
  return (await openpgp.encrypt({
    message: await openpgp.createMessage({
      binary: new TextEncoder().encode(plaintext),
      format: "binary",
    }),
    encryptionKeys: await openpgp.readKey({ armoredKey: recipient_public }),
    signingKeys: await openpgp.decryptKey({
      privateKey: await openpgp.readPrivateKey({ armoredKey: signer_private }),
      passphrase,
    }),
    config: { preferredCompressionAlgorithm: openpgp.enums.compression.zlib },
    format: "armored",
  })) as string;
}

describe("encrypted multipart mail rewritten by a forwarding relay", () => {
  beforeEach(() => {
    vault_state.vault = null;
    vault_state.passphrase = passphrase;
    clear_decrypted_mime_attachments();
  });

  for (const protected_headers of [false, true]) {
    it(`keeps the attachments when protected headers are ${protected_headers ? "on" : "off"}`, async () => {
      const recipient = await make_test_key("recipient@test.invalid");
      const relay = await make_test_key("relay@test.invalid");

      vault_state.vault = {
        identity_key: recipient.privateKey,
        previous_keys: [],
      };

      const plaintext = relay_rewrite(
        protected_headers ? relay_full_message() : relay_body(),
        protected_headers,
      );
      const armored = await encrypt_like_gnupg(
        recipient.publicKey,
        relay.privateKey,
        plaintext,
      );
      const id = `relay-${protected_headers}`;
      const resolved = await resolve_inbound_pgp_body(
        `${armored}\r\n`,
        "sender@test.invalid",
        id,
      );

      expect(resolved.decrypted).toBe(true);
      expect(resolved.body).toContain("Here are the files.");

      const parts = get_decrypted_mime_attachments(id);

      expect(parts.map((p) => p.filename)).toEqual(["logo.png", "invoice.pdf"]);
      expect(await sha256_hex(parts[1]!.data)).toBe(
        await sha256_hex(pdf_bytes),
      );
      expect(resolved.decrypted_content_tag).toBeTruthy();
    }, 60_000);
  }
});
