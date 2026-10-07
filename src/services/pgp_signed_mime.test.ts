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
import { writeFileSync } from "node:fs";

import * as openpgp from "openpgp";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { sign_detached } from "./crypto/key_manager";
import {
  OBSCURED_SUBJECT_PLACEHOLDER,
  build_protected_mime_entity,
} from "./pgp_protected_mime";
import {
  build_signed_mime_payload,
  get_last_signing_skip_reason,
  should_attach_signed_mime,
  should_obscure_outer_subject,
} from "./send_queue_signed_mime";

const PASSPHRASE = "signed-mime-test";

let sender_public: string;
let sender_private: string;

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: () => ({ identity_key: memory_identity_key }),
  get_passphrase_from_memory: () => memory_passphrase,
}));

let memory_identity_key: string | undefined;
let memory_passphrase: string | undefined;

const encoder = new TextEncoder();

function decode_base64_utf8(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return new TextDecoder().decode(bytes);
}

function sample_entity(obscure_subject = false): string {
  return build_protected_mime_entity({
    obscure_subject,
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
    curve: "ed25519Legacy",
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
    expect(mime).toContain(
      'Content-Disposition: attachment; filename="note.txt"',
    );
    expect(mime).not.toContain("\n\n");
  });

  it("keeps the subject out of plain view while carrying it inside", () => {
    const mime = sample_entity();

    expect(mime).not.toContain("Signed and encrypted ✓");
  });

  it("carries an html alternative for a body that has no visible tags", () => {
    const mime = build_protected_mime_entity({
      subject: "Test",
      body: "Test test&nbsp;",
      is_html: true,
      from: "sender@astermail.org",
      to: ["external@example.org"],
      cc: [],
      attachments: [],
      date: new Date(Date.UTC(2026, 7, 14, 12, 0, 0)),
    });

    expect(mime).toContain("multipart/alternative");
    expect(mime).toContain("Content-Type: text/html; charset=utf-8");

    const html_marker =
      "Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n";
    const html_payload = mime
      .slice(mime.indexOf(html_marker) + html_marker.length)
      .split("\r\n")[0];

    expect(decode_base64_utf8(html_payload)).toBe("Test test&nbsp;");
  });

  it("omits the legacy display part unless obscuring is requested", () => {
    const mime = sample_entity();

    expect(mime).not.toContain(
      'text/plain; charset=utf-8; protected-headers="v1"',
    );
    expect(mime.match(/protected-headers="v1"/g)).toHaveLength(2);
  });

  it("adds a legacy display part carrying the real subject when obscuring", () => {
    const mime = sample_entity(true);
    const legacy_header =
      'Content-Type: text/plain; charset=utf-8; protected-headers="v1"\r\n' +
      "Content-Transfer-Encoding: base64\r\n" +
      "Content-Disposition: inline\r\n\r\n";

    expect(mime).toContain(legacy_header);

    const payload = mime
      .slice(mime.indexOf(legacy_header) + legacy_header.length)
      .split("\r\n")[0];

    expect(decode_base64_utf8(payload)).toBe(
      "Subject: Signed and encrypted ✓\r\n",
    );
  });

  it("still protects the real subject inside the entity when obscuring", () => {
    const mime = sample_entity(true);

    expect(mime).not.toContain("Signed and encrypted ✓");
    expect(mime).toContain("Subject: =?UTF-8?B?");
  });

  it("places the legacy display part before the message body", () => {
    const mime = sample_entity(true);

    expect(mime.indexOf("Content-Disposition: inline\r\n\r\n")).toBeLessThan(
      mime.indexOf("multipart/alternative"),
    );
  });

  it("keeps the entity free of bare newlines when obscuring", () => {
    expect(sample_entity(true)).not.toContain("\n\n");
  });
});

describe("should_obscure_outer_subject", () => {
  const enabled = {
    obscure_subject_preference: true,
    encryption_active: true,
    signed_mime_attached: true,
  };

  it("obscures only when the user opted in", () => {
    expect(should_obscure_outer_subject(enabled)).toBe(true);
    expect(
      should_obscure_outer_subject({
        ...enabled,
        obscure_subject_preference: false,
      }),
    ).toBe(false);
    expect(
      should_obscure_outer_subject({
        ...enabled,
        obscure_subject_preference: undefined,
      }),
    ).toBe(false);
  });

  it("never obscures a subject that ships unencrypted", () => {
    expect(
      should_obscure_outer_subject({ ...enabled, encryption_active: false }),
    ).toBe(false);
  });

  it("never obscures without protected headers to carry the subject", () => {
    expect(
      should_obscure_outer_subject({ ...enabled, signed_mime_attached: false }),
    ).toBe(false);
  });

  it("never obscures secure external sends", () => {
    expect(
      should_obscure_outer_subject({ ...enabled, secure_external: true }),
    ).toBe(false);
  });

  it("uses three full stops as the placeholder", () => {
    expect(OBSCURED_SUBJECT_PLACEHOLDER).toBe("...");
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
      should_attach_signed_mime({
        recipients: external,
        secure_external: true,
      }),
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

    expect(
      should_attach_signed_mime({ recipients: external, attachments }),
    ).toBe(false);
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

describe("build_signed_mime_payload", () => {
  it("signs an entity that keeps the html body intact", async () => {
    memory_identity_key = sender_private;
    memory_passphrase = PASSPHRASE;

    const payload = await build_signed_mime_payload({
      subject: "Test",
      body: "Test test&nbsp;",
      from: "sender@astermail.org",
      to: ["external@example.org"],
      cc: [],
    });

    expect(payload).toBeDefined();

    const entity = decode_base64_utf8(payload!.signed_mime);

    expect(entity).toContain("Content-Type: text/html; charset=utf-8");
    expect(entity).not.toContain(
      "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit",
    );

    const verified = await openpgp.verify({
      message: await openpgp.createMessage({ binary: encoder.encode(entity) }),
      signature: await openpgp.readSignature({
        armoredSignature: payload!.signed_mime_signature,
      }),
      verificationKeys: await openpgp.readKey({ armoredKey: sender_public }),
    });

    expect(await verified.signatures[0].verified).toBe(true);
  });

  it("writes the interop fixture the backend end-to-end test consumes", async () => {
    const destination = process.env.ASTER_SIGNED_MIME_FIXTURE_OUT;

    if (!destination) return;

    memory_identity_key = sender_private;
    memory_passphrase = PASSPHRASE;

    const recipient = await openpgp.generateKey({
      type: "ecc",
      curve: "ed25519Legacy",
      userIDs: [{ name: "External", email: "external@example.org" }],
      format: "armored",
    });

    const payload = await build_signed_mime_payload({
      subject: "Test",
      body: "Test test&nbsp;",
      from: "sender@astermail.org",
      to: ["external@example.org"],
      cc: [],
    });

    expect(payload).toBeDefined();

    writeFileSync(
      destination,
      JSON.stringify(
        {
          mime_base64: payload!.signed_mime,
          signature: payload!.signed_mime_signature,
          micalg: payload!.signed_mime_micalg,
          sender_public_key: sender_public,
          recipient_public_key: recipient.publicKey,
          recipient_private_key: recipient.privateKey,
          expected_subject: "Test",
          expected_html: "Test test&nbsp;",
        },
        null,
        2,
      ),
    );
  }, 60000);

  it("reports why a message goes out unsigned", async () => {
    memory_identity_key = undefined;
    memory_passphrase = undefined;

    const payload = await build_signed_mime_payload({
      subject: "Test",
      body: "Test",
      from: "sender@astermail.org",
      to: ["external@example.org"],
      cc: [],
    });

    expect(payload).toBeUndefined();
    expect(get_last_signing_skip_reason()).toBe(
      "vault_identity_key_unavailable",
    );
  });
});

describe("plain text mode", () => {
  function body_parts(entity: string): string[] {
    const outer = /boundary="([^"]+)"/.exec(entity)![1];

    return entity
      .split(`--${outer}`)
      .slice(1, -1)
      .filter((part) => !part.includes("text/rfc822-headers"));
  }

  function decode_part(part: string): string {
    const [, payload] = part.split("\r\n\r\n");

    return decode_base64_utf8(payload.replace(/\r\n/g, ""));
  }

  async function sign_plain(body: string) {
    memory_identity_key = sender_private;
    memory_passphrase = PASSPHRASE;

    const payload = await build_signed_mime_payload({
      subject: "Plain",
      body,
      from: "sender@astermail.org",
      to: ["external@example.org"],
      cc: [],
      is_plain_text: true,
    });

    expect(payload).toBeDefined();

    return {
      payload: payload!,
      entity: decode_base64_utf8(payload!.signed_mime),
    };
  }

  it("signs a single text/plain part with no html alternative", async () => {
    const { payload, entity } = await sign_plain(
      "Don&#039;t &lt;panic&gt; &amp; olá<br>second line",
    );
    const parts = body_parts(entity);

    expect(entity).not.toContain("text/html");
    expect(entity).not.toContain("multipart/alternative");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain(
      "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n",
    );
    expect(decode_part(parts[0])).toBe("Don't <panic> & olá\r\nsecond line");

    const verified = await openpgp.verify({
      message: await openpgp.createMessage({ binary: encoder.encode(entity) }),
      signature: await openpgp.readSignature({
        armoredSignature: payload.signed_mime_signature,
      }),
      verificationKeys: await openpgp.readKey({ armoredKey: sender_public }),
    });

    expect(await verified.signatures[0].verified).toBe(true);
  });

  it("sends the signature as text", async () => {
    const { entity } = await sign_plain(
      'Thanks<div data-aster-signature="1">--<br><b>Jane Doe</b><br><a href="https://example.org/jane">My page</a></div>',
    );
    const [part] = body_parts(entity);

    expect(decode_part(part)).toBe(
      "Thanks\r\n--\r\nJane Doe\r\nMy page <https://example.org/jane>",
    );
  });

  it("sends a reply quote as > lines", async () => {
    const { entity } = await sign_plain(
      "Sounds good<br><br><div>Sam &lt;sam@example.org&gt; wrote:<br><br>&gt; First line<br>&gt; Second line</div>",
    );
    const [part] = body_parts(entity);

    expect(decode_part(part)).toBe(
      "Sounds good\r\n\r\nSam <sam@example.org> wrote:\r\n\r\n> First line\r\n> Second line",
    );
  });

  it("keeps attachments next to the single text part", async () => {
    memory_identity_key = sender_private;
    memory_passphrase = PASSPHRASE;

    const payload = await build_signed_mime_payload({
      subject: "Plain",
      body: "See attached",
      from: "sender@astermail.org",
      to: ["external@example.org"],
      cc: [],
      is_plain_text: true,
      attachments: [
        {
          id: "a1",
          name: "note.txt",
          size: "1 B",
          size_bytes: 1,
          mime_type: "text/plain",
          data: new TextEncoder().encode("x").buffer,
        },
      ],
    });
    const parts = body_parts(decode_base64_utf8(payload!.signed_mime));

    expect(parts).toHaveLength(2);
    expect(decode_part(parts[0])).toBe("See attached");
    expect(parts[1]).toContain('filename="note.txt"');
  });
});
