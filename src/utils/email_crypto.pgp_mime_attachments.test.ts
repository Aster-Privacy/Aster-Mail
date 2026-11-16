//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
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
  pseudo_random_bytes,
  sha256_hex,
  text_part,
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

async function encrypt_mime(
  recipient_public: string,
  mime: string,
  signer_private?: string,
): Promise<string> {
  const encryptionKeys = await openpgp.readKey({ armoredKey: recipient_public });
  const signingKeys = signer_private
    ? await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({ armoredKey: signer_private }),
        passphrase,
      })
    : undefined;

  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text: mime }),
    encryptionKeys,
    signingKeys,
    format: "armored",
  })) as string;
}

const pdf_bytes = new TextEncoder().encode("%PDF-1.4\n%throwaway fixture\n");
const image_bytes = pseudo_random_bytes(4096, 42);
const large_bytes = pseudo_random_bytes(5 * 1024 * 1024, 77);

function forwarded_mime(): string {
  return [
    'Content-Type: multipart/mixed; boundary="fwd-outer"; protected-headers="v1"',
    "Subject: Quarterly files",
    "",
    "--fwd-outer",
    multipart("related", "fwd-rel", [
      multipart("alternative", "fwd-alt", [
        text_part("plain", "Files attached."),
        text_part("html", '<p>Files attached.</p><img src="cid:chart@fixture">'),
      ]),
      file_part({
        filename_header: 'filename="chart.png"',
        content_type: "image/png",
        data: image_bytes,
        disposition: "inline",
        content_id: "chart@fixture",
      }),
    ]),
    "--fwd-outer",
    file_part({
      filename_header: "filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
      content_type: "application/pdf",
      data: pdf_bytes,
    }),
    "--fwd-outer",
    file_part({
      filename_header: 'filename="large.bin"',
      content_type: "application/octet-stream",
      data: large_bytes,
    }),
    "--fwd-outer--",
    "",
  ].join("\r\n");
}

describe("resolve_inbound_pgp_body with encrypted multipart attachments", () => {
  beforeEach(() => {
    vault_state.vault = null;
    vault_state.passphrase = passphrase;
    clear_decrypted_mime_attachments();
  });

  it("keeps every attachment of the decrypted MIME tree for the message", async () => {
    const key = await make_test_key("recipient@test.invalid");

    vault_state.vault = { identity_key: key.privateKey, previous_keys: [] };

    const armored = await encrypt_mime(key.publicKey, forwarded_mime());
    const resolved = await resolve_inbound_pgp_body(armored, undefined, "mail-1");

    expect(resolved.decrypted).toBe(true);
    expect(resolved.body).toContain("Files attached.");

    const parts = get_decrypted_mime_attachments("mail-1");

    expect(parts.map((p) => p.filename)).toEqual([
      "chart.png",
      "résumé.pdf",
      "large.bin",
    ]);
    expect(parts[0]?.content_id).toBe("chart@fixture");
    expect(await sha256_hex(parts[0]!.data)).toBe(await sha256_hex(image_bytes));
    expect(await sha256_hex(parts[1]!.data)).toBe(await sha256_hex(pdf_bytes));
    expect(await sha256_hex(parts[2]!.data)).toBe(await sha256_hex(large_bytes));
  }, 60_000);

  it("keeps attachments from a signed and encrypted message", async () => {
    const recipient = await make_test_key("recipient@test.invalid");
    const sender = await make_test_key("sender@test.invalid");

    vault_state.vault = { identity_key: recipient.privateKey, previous_keys: [] };

    const mime = multipart(
      "signed",
      "sig-outer",
      [
        multipart("mixed", "sig-inner", [
          text_part("plain", "Signed body."),
          file_part({
            filename_header: 'filename="contract.pdf"',
            content_type: "application/pdf",
            data: pdf_bytes,
          }),
        ]),
        'Content-Type: application/pgp-signature; name="signature.asc"\r\n\r\n-----BEGIN PGP SIGNATURE-----\r\nAAAA\r\n-----END PGP SIGNATURE-----',
      ],
      '; protocol="application/pgp-signature"; micalg=pgp-sha256',
    );
    const armored = await encrypt_mime(recipient.publicKey, mime, sender.privateKey);
    const resolved = await resolve_inbound_pgp_body(armored, undefined, "mail-2");

    expect(resolved.decrypted).toBe(true);
    expect(get_decrypted_mime_attachments("mail-2").map((p) => p.filename)).toEqual([
      "contract.pdf",
    ]);
  }, 60_000);

  it("stores nothing for a plain encrypted text message", async () => {
    const key = await make_test_key("recipient@test.invalid");

    vault_state.vault = { identity_key: key.privateKey, previous_keys: [] };

    const armored = await encrypt_mime(key.publicKey, "just words");
    const resolved = await resolve_inbound_pgp_body(armored, undefined, "mail-3");

    expect(resolved.body).toBe("just words");
    expect(get_decrypted_mime_attachments("mail-3")).toEqual([]);
  }, 60_000);
});
