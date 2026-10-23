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
import type { Attachment } from "@/components/compose/compose_shared";
import type { ExternalKeyInfo } from "./api/keys";

import * as openpgp from "openpgp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const discover = vi.fn();
const signed_payload = vi.fn();

vi.mock("./api/keys", () => ({
  discover_external_keys_batch: (emails: string[]) => discover(emails),
}));

vi.mock("./send_queue_signed_mime", () => ({
  build_signed_mime_payload: (params: unknown) => signed_payload(params),
}));

import {
  build_client_pgp_copies,
  build_signed_mime_entity,
  decide_recipient_encryption,
  type ClientPgpCopyParams,
} from "./client_pgp_copies";

interface TestKey {
  public_key: string;
  private_key: string;
}

let pal: TestKey;
let bob: TestKey;

async function make_key(email: string): Promise<TestKey> {
  const generated = await openpgp.generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ email }],
    format: "armored",
  });

  return {
    public_key: generated.publicKey,
    private_key: generated.privateKey,
  };
}

function key_info(
  email: string,
  key: TestKey | null,
  overrides: Partial<ExternalKeyInfo> = {},
): ExternalKeyInfo {
  return {
    email,
    found: key !== null,
    public_key: key?.public_key ?? null,
    fingerprint: key ? "fp" : null,
    source: key ? "wkd" : null,
    expires_at: null,
    will_encrypt: key !== null,
    fingerprint_change: null,
    ...overrides,
  };
}

function params(
  overrides: Partial<ClientPgpCopyParams> = {},
): ClientPgpCopyParams {
  return {
    outside_recipients: ["pal@example.com", "Bob@Example.org"],
    subject: "Quarterly numbers",
    body: "<p>Here are the numbers</p>",
    from: "me@astermail.org",
    to: ["pal@example.com", "Bob@Example.org"],
    cc: [],
    bcc: [],
    attachments: [],
    ...overrides,
  };
}

async function decrypt_with(armored: string, key: TestKey): Promise<string> {
  const message = await openpgp.readMessage({ armoredMessage: armored });
  const private_key = await openpgp.readPrivateKey({
    armoredKey: key.private_key,
  });
  const result = await openpgp.decrypt({
    message,
    decryptionKeys: private_key,
    format: "binary",
  });

  return new TextDecoder().decode(result.data as Uint8Array);
}

function attachment(size: number): Attachment {
  return {
    id: "att",
    name: "report.pdf",
    size: `${size}`,
    size_bytes: size,
    mime_type: "application/pdf",
    data: new Uint8Array(Math.min(size, 16)).buffer,
  } as Attachment;
}

beforeAll(async () => {
  pal = await make_key("pal@example.com");
  bob = await make_key("bob@example.org");
}, 60000);

beforeEach(() => {
  discover.mockReset();
  signed_payload.mockReset();
  signed_payload.mockResolvedValue(undefined);
});

describe("decide_recipient_encryption", () => {
  it("follows the server trust rules", () => {
    const trusted = key_info("pal@example.com", {
      public_key: "k",
      private_key: "",
    });
    const keyserver = key_info(
      "pal@example.com",
      { public_key: "k", private_key: "" },
      { source: "keyserver", will_encrypt: false },
    );
    const missing = key_info("pal@example.com", null);

    expect(decide_recipient_encryption(trusted, {})).toBe("encrypt");
    expect(decide_recipient_encryption(keyserver, {})).toBe("plain");
    expect(decide_recipient_encryption(keyserver, { force_pgp: true })).toBe(
      "encrypt",
    );
    expect(
      decide_recipient_encryption(keyserver, { require_encryption: true }),
    ).toBe("encrypt");
    expect(decide_recipient_encryption(trusted, { force_pgp: false })).toBe(
      "plain",
    );
    expect(decide_recipient_encryption(missing, { force_pgp: true })).toBe(
      "server",
    );
    expect(decide_recipient_encryption(undefined, {})).toBe("plain");
  });
});

describe("build_client_pgp_copies", () => {
  it("encrypts one copy per recipient that only that recipient can open", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", bob),
      ],
    });

    const copies = await build_client_pgp_copies(params());

    expect(copies).toBeDefined();
    expect(Object.keys(copies!).sort()).toEqual([
      "Bob@Example.org",
      "pal@example.com",
    ]);

    const pal_plain = await decrypt_with(copies!["pal@example.com"], pal);

    expect(pal_plain).toContain("Subject: Quarterly numbers");
    expect(pal_plain).toContain('protected-headers="v1"');

    await expect(
      decrypt_with(copies!["pal@example.com"], bob),
    ).rejects.toThrow();
    await expect(
      decrypt_with(copies!["Bob@Example.org"], bob),
    ).resolves.toContain("Quarterly numbers");
  });

  it("leaves the send to the existing path when any recipient lacks a trusted key", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", null),
      ],
    });
    expect(await build_client_pgp_copies(params())).toBeUndefined();

    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", bob, {
          source: "keyserver",
          will_encrypt: false,
        }),
      ],
    });
    expect(await build_client_pgp_copies(params())).toBeUndefined();

    discover.mockResolvedValue({ data: [key_info("pal@example.com", pal)] });
    expect(await build_client_pgp_copies(params())).toBeUndefined();
  });

  it("uses a keyserver key when the sender asks for encryption", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal, {
          source: "keyserver",
          will_encrypt: false,
        }),
        key_info("bob@example.org", bob, {
          source: "keyserver",
          will_encrypt: false,
        }),
      ],
    });

    const copies = await build_client_pgp_copies(params({ force_pgp: true }));

    expect(copies && Object.keys(copies)).toHaveLength(2);
  });

  it("refuses to fall back when the sender asked for encryption", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", null),
      ],
    });
    await expect(
      build_client_pgp_copies(params({ force_pgp: true })),
    ).rejects.toMatchObject({ type: "encryption_failed" });
    await expect(
      build_client_pgp_copies(params({ require_encryption: true })),
    ).rejects.toMatchObject({ type: "encryption_failed" });

  });

  it("leaves encryption to the server when copies cannot be built", async () => {
    discover.mockRejectedValue(new Error("offline"));
    expect(
      await build_client_pgp_copies(params({ require_encryption: true })),
    ).toBeUndefined();

    discover.mockReset();
    expect(
      await build_client_pgp_copies(
        params({
          force_pgp: true,
          attachments: [attachment(12 * 1024 * 1024)],
        }),
      ),
    ).toBeUndefined();
    expect(discover).not.toHaveBeenCalled();
  });

  it("makes no copies and raises nothing when there are no outside recipients", async () => {
    expect(
      await build_client_pgp_copies(
        params({ outside_recipients: [], require_encryption: true }),
      ),
    ).toBeUndefined();
  });

  it("makes no copies when the sender turned encryption off", async () => {
    expect(
      await build_client_pgp_copies(params({ force_pgp: false })),
    ).toBeUndefined();
    expect(discover).not.toHaveBeenCalled();
  });

  it("falls back when discovery fails, even with cached keys", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", bob),
      ],
      error: "network",
    });
    expect(await build_client_pgp_copies(params())).toBeUndefined();

    discover.mockRejectedValue(new Error("offline"));
    expect(await build_client_pgp_copies(params())).toBeUndefined();
  });

  it("falls back for a key that cannot encrypt", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", {
          public_key: "not a key",
          private_key: "",
        }),
      ],
    });
    expect(await build_client_pgp_copies(params())).toBeUndefined();
  });

  it("falls back for attachments larger than the signed limit", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", bob),
      ],
    });
    expect(
      await build_client_pgp_copies(
        params({ attachments: [attachment(12 * 1024 * 1024)] }),
      ),
    ).toBeUndefined();
    expect(discover).not.toHaveBeenCalled();
  });

  it("carries attachments inside the encrypted copy", async () => {
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", bob),
      ],
    });

    const copies = await build_client_pgp_copies(
      params({ attachments: [attachment(16)] }),
    );
    const plain = await decrypt_with(copies!["pal@example.com"], pal);

    expect(plain).toContain('filename="report.pdf"');
  });

  it("wraps a signed entity exactly like the server", async () => {
    const inner = "Content-Type: text/plain\r\n\r\nhello";

    signed_payload.mockResolvedValue({
      signed_mime: btoa(inner),
      signed_mime_signature:
        "-----BEGIN PGP SIGNATURE-----\n\nabc\n-----END PGP SIGNATURE-----\n",
      signed_mime_micalg: "pgp-sha512",
    });
    discover.mockResolvedValue({
      data: [
        key_info("pal@example.com", pal),
        key_info("bob@example.org", bob),
      ],
    });

    const copies = await build_client_pgp_copies(params());
    const plain = await decrypt_with(copies!["pal@example.com"], pal);
    const boundary = /boundary="([^"]+)"/.exec(plain)?.[1];

    expect(boundary).toMatch(/^--=_astermail_signed_[0-9a-f]{32}$/);
    expect(plain).toBe(
      `Content-Type: multipart/signed; micalg="pgp-sha512"; protocol="application/pgp-signature"; boundary="${boundary}"\r\n\r\n` +
        `--${boundary}\r\n${inner}\r\n--${boundary}\r\n` +
        'Content-Type: application/pgp-signature; name="signature.asc"\r\n' +
        "Content-Description: OpenPGP digital signature\r\n" +
        'Content-Disposition: attachment; filename="signature.asc"\r\n\r\n' +
        "-----BEGIN PGP SIGNATURE-----\r\n\r\nabc\r\n-----END PGP SIGNATURE-----" +
        `\r\n--${boundary}--\r\n`,
    );
  });

  it("uses a fresh boundary for every signed entity", () => {
    const mime = new TextEncoder().encode("x");
    const first = new TextDecoder().decode(
      build_signed_mime_entity(mime, "s", "pgp-sha256"),
    );
    const second = new TextDecoder().decode(
      build_signed_mime_entity(mime, "s", "pgp-sha256"),
    );

    expect(first).not.toBe(second);
  });

  it("dedupes recipients that differ only by case", async () => {
    discover.mockResolvedValue({ data: [key_info("pal@example.com", pal)] });

    const copies = await build_client_pgp_copies(
      params({ outside_recipients: ["pal@example.com", "PAL@example.com"] }),
    );

    expect(copies && Object.keys(copies)).toEqual(["pal@example.com"]);
    expect(discover).toHaveBeenCalledWith(["pal@example.com"]);
  });
});
