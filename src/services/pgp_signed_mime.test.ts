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
import * as openpgp from "openpgp";
import { beforeAll, describe, expect, it } from "vitest";
import { sign_detached } from "./crypto/key_manager";
import {
  body_looks_like_html,
  build_protected_mime_entity,
} from "./pgp_protected_mime";
import { should_attach_signed_mime } from "./send_queue_signed_mime";

const PASSPHRASE = "signed-mime-test";

let sender_public: string;
let sender_private: string;

const encoder = new TextEncoder();

function sample_entity(): string {
  return build_protected_mime_entity({
    subject: "Signed and encrypted ✓",
    body: "<p>Hello there</p><div>second line</div>",
    is_html: true,
    from: "sender@astermail.org",
    to: ["external@example.org"],
    cc: [],
    attachments: [
      {
        filename: "note.txt",
        content_type: "text/plain",
        data_base64: btoa("attachment payload"),
      },
    ],
    date: new Date(Date.UTC(2026, 7, 12, 12, 0, 0)),
  });
}

beforeAll(async () => {
  const key = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519",
    userIDs: [{ name: "Sender", email: "sender@astermail.org" }],
    passphrase: PASSPHRASE,
    format: "armored",
  });

  sender_public = key.publicKey;
  sender_private = key.privateKey;
}, 60000);

describe("build_protected_mime_entity", () => {
  it("produces a protected-headers multipart entity", () => {
    const mime = sample_entity();

    expect(mime.startsWith("Content-Type: multipart/mixed;")).toBe(true);
    expect(mime).toContain('protected-headers="v1"');
    expect(mime).toContain("Content-Type: text/rfc822-headers");
    expect(mime).toContain("From: sender@astermail.org");
    expect(mime).toContain("To: external@example.org");
    expect(mime).toContain("Subject: =?UTF-8?B?");
    expect(mime).toContain("multipart/alternative");
    expect(mime).toContain('Content-Disposition: attachment; filename="note.txt"');
    expect(mime).not.toContain("\n\n");
  });

  it("keeps the subject out of plain view while carrying it inside", () => {
    const mime = sample_entity();

    expect(mime).not.toContain("Signed and encrypted ✓");
  });

  it("detects html bodies the backend would also treat as html", () => {
    expect(body_looks_like_html("<p>hi</p>")).toBe(true);
    expect(body_looks_like_html("plain text")).toBe(false);
  });
});

describe("sign_detached", () => {
  it("signs the exact entity bytes so a recipient can verify them", async () => {
    const mime = sample_entity();
    const bytes = encoder.encode(mime);
    const signed = await sign_detached(bytes, {
      armored_secret_key: sender_private,
      passphrase: PASSPHRASE,
    });

    expect(signed).not.toBeNull();
    expect(signed?.signature).toContain("-----BEGIN PGP SIGNATURE-----");
    expect(signed?.micalg.startsWith("pgp-")).toBe(true);

    const verification = await openpgp.verify({
      message: await openpgp.createMessage({ binary: bytes }),
      signature: await openpgp.readSignature({
        armoredSignature: signed!.signature,
      }),
      verificationKeys: await openpgp.readKey({ armoredKey: sender_public }),
      format: "binary",
    });

    await expect(verification.signatures[0].verified).resolves.toBe(true);
  }, 60000);

  it("fails verification when a single byte of the entity changes", async () => {
    const bytes = encoder.encode(sample_entity());
    const signed = await sign_detached(bytes, {
      armored_secret_key: sender_private,
      passphrase: PASSPHRASE,
    });

    const tampered = new Uint8Array(bytes);

    tampered[tampered.length - 5] ^= 0x01;

    const verification = await openpgp.verify({
      message: await openpgp.createMessage({ binary: tampered }),
      signature: await openpgp.readSignature({
        armoredSignature: signed!.signature,
      }),
      verificationKeys: await openpgp.readKey({ armoredKey: sender_public }),
      format: "binary",
    });

    await expect(verification.signatures[0].verified).rejects.toThrow();
  }, 60000);

  it("returns null when the passphrase does not open the key", async () => {
    const signed = await sign_detached(encoder.encode("data"), {
      armored_secret_key: sender_private,
      passphrase: "wrong",
    });

    expect(signed).toBeNull();
  }, 60000);
});

describe("should_attach_signed_mime", () => {
  const external = ["external@example.org"];

  it("signs plain sends to external recipients", () => {
    expect(should_attach_signed_mime({ recipients: external })).toBe(true);
  });

  it("never signs secure external sends", () => {
    expect(
      should_attach_signed_mime({ recipients: external, secure_external: true }),
    ).toBe(false);
  });

  it("skips internal-only sends", () => {
    expect(
      should_attach_signed_mime({ recipients: ["friend@astermail.org"] }),
    ).toBe(false);
  });

  it("signs attachment-bearing sends only when pgp is indicated", () => {
    const attachments = [
      {
        name: "a.bin",
        mime_type: "application/octet-stream",
        data: new ArrayBuffer(2048),
        size_bytes: 2048,
      },
    ] as never;

    expect(should_attach_signed_mime({ recipients: external, attachments })).toBe(
      false,
    );
    expect(
      should_attach_signed_mime({
        recipients: external,
        attachments,
        encrypt_emails: true,
      }),
    ).toBe(true);
    expect(
      should_attach_signed_mime({
        recipients: external,
        attachments,
        require_encryption: true,
      }),
    ).toBe(true);
  });
});
