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

const list_attachments = vi.fn();
const update_attachment_meta = vi.fn();
const list_encrypted_mail_items = vi.fn();
const update_mail_item = vi.fn();

vi.mock("./api/attachments", () => ({
  list_attachments: (id: string) => list_attachments(id),
  update_attachment_meta: (id: string, body: unknown) =>
    update_attachment_meta(id, body),
}));

vi.mock("./api/mail", () => ({
  list_encrypted_mail_items: (query: unknown) =>
    list_encrypted_mail_items(query),
  update_mail_item: (id: string, body: unknown) => update_mail_item(id, body),
}));

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: () => null,
}));

vi.mock("./crypto/envelope", () => ({
  array_to_base64: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  base64_to_array: (value: string) =>
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
  normalize_parsed_envelope: (value: unknown) => value,
  decrypt_envelope_with_bytes: async (sealed: string, bytes: Uint8Array) =>
    sealed === btoa(`sealed:${new TextDecoder().decode(bytes)}`)
      ? { subject: "kept" }
      : null,
  encrypt_envelope_with_bytes: async (_value: object, bytes: Uint8Array) => ({
    encrypted: btoa(`sealed:${new TextDecoder().decode(bytes)}`),
    nonce: btoa(String.fromCharCode(1)),
  }),
}));

import { reencrypt_all_sent_mail } from "./sent_mail_reseal";
import {
  decrypt_envelope_v2_plaintext,
  envelope_sha256_hex,
} from "./crypto/envelope_v2";
import { ATTACHMENT_META_V2_NONCE } from "./crypto/attachment_meta_v2";

const DATA_KEK = Uint8Array.from({ length: 32 }, (_, i) => i);

function listing(items: unknown[], drafts: unknown[] = []) {
  list_encrypted_mail_items.mockImplementation(
    async (query: { item_type: string }) => ({
      data: {
        items: query.item_type === "draft" ? drafts : items,
        next_cursor: null,
      },
    }),
  );
}

const OLD_META = btoa("sealed:old-pw");
const PASSWORD_META_NONCE = btoa(String.fromCharCode(...new Array(12).fill(9)));

function attachments_for(rows: Record<string, unknown[]>) {
  list_attachments.mockImplementation(async (id: string) => ({
    data: { attachments: rows[id] ?? [] },
  }));
}

describe("reencrypt_all_sent_mail with level 2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update_mail_item.mockResolvedValue({ data: { success: true } });
    update_attachment_meta.mockResolvedValue({ data: { status: "ok" } });
    attachments_for({});
  });

  it("moves a password envelope to v2 with the stored envelope hash", async () => {
    const stored = btoa("sealed:old-pw");

    listing([{ id: "a", encrypted_envelope: stored, envelope_nonce: "AQ==" }]);

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => DATA_KEK.slice(),
    });

    expect(summary.rewritten).toBe(1);
    expect(update_mail_item).toHaveBeenCalledTimes(1);

    const [id, body] = update_mail_item.mock.calls[0] as [
      string,
      {
        encrypted_envelope: string;
        envelope_nonce: string;
        expected_envelope_sha256: string;
      },
    ];

    expect(id).toBe("a");
    expect(body.envelope_nonce).toBe("Ag==");
    expect(body.expected_envelope_sha256).toBe(
      await envelope_sha256_hex(stored),
    );
    expect(
      await decrypt_envelope_v2_plaintext(body.encrypted_envelope, [DATA_KEK]),
    ).toBe('{"subject":"kept"}');
  });

  it("never rewrites an envelope that is already v2", async () => {
    listing([
      {
        id: "b",
        encrypted_envelope: btoa("anything"),
        envelope_nonce: "Ag==",
      },
    ]);

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => DATA_KEK.slice(),
    });

    expect(summary.rewritten).toBe(0);
    expect(update_mail_item).not.toHaveBeenCalled();
  });

  it("counts a changed envelope as failed instead of overwriting it", async () => {
    listing([
      {
        id: "a",
        encrypted_envelope: btoa("sealed:old-pw"),
        envelope_nonce: "AQ==",
      },
    ]);
    update_mail_item.mockResolvedValue({
      error: "x",
      status: 409,
      server_code: "ENVELOPE_CHANGED",
    });

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => DATA_KEK.slice(),
    });

    expect(summary.failed).toBe(1);
    expect(update_mail_item).toHaveBeenCalledTimes(1);
  });

  it("keeps the password envelope when the account is not admitted", async () => {
    listing([
      {
        id: "a",
        encrypted_envelope: btoa("sealed:old-pw"),
        envelope_nonce: "AQ==",
      },
    ]);

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => null,
    });

    expect(summary.rewritten).toBe(1);
    expect(update_mail_item).toHaveBeenCalledWith("a", {
      encrypted_envelope: btoa("sealed:new-pw"),
      envelope_nonce: "AQ==",
    });
  });

  it("moves password attachment metas under the data key", async () => {
    listing([
      {
        id: "a",
        encrypted_envelope: btoa("sealed:old-pw"),
        envelope_nonce: "AQ==",
        has_attachments: true,
      },
    ]);
    attachments_for({
      a: [
        { id: "m1", encrypted_meta: OLD_META, meta_nonce: PASSWORD_META_NONCE },
        {
          id: "m2",
          encrypted_meta: btoa("already"),
          meta_nonce: ATTACHMENT_META_V2_NONCE,
        },
      ],
    });

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => DATA_KEK.slice(),
    });

    expect(summary.rewritten).toBe(1);
    expect(update_attachment_meta).toHaveBeenCalledTimes(1);

    const [id, body] = update_attachment_meta.mock.calls[0] as [
      string,
      { encrypted_meta: string; meta_nonce: string },
    ];

    expect(id).toBe("m1");
    expect(body.meta_nonce).toBe(ATTACHMENT_META_V2_NONCE);
    expect(body.encrypted_meta).not.toContain(btoa("sealed:new-pw"));
    expect(
      await decrypt_envelope_v2_plaintext(body.encrypted_meta, [DATA_KEK]),
    ).toBe('{"subject":"kept"}');
  });

  it("moves draft attachment metas under the data key on a password change", async () => {
    listing(
      [],
      [
        {
          id: "d",
          encrypted_envelope: btoa("v2-draft"),
          envelope_nonce: "Ag==",
          has_attachments: true,
        },
      ],
    );
    attachments_for({
      d: [
        { id: "m3", encrypted_meta: OLD_META, meta_nonce: PASSWORD_META_NONCE },
      ],
    });

    await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => DATA_KEK.slice(),
    });

    expect(
      list_encrypted_mail_items.mock.calls.map(
        (call) => (call[0] as { item_type: string }).item_type,
      ),
    ).toEqual(["sent", "draft"]);
    expect(update_mail_item).not.toHaveBeenCalled();
    expect(update_attachment_meta).toHaveBeenCalledTimes(1);

    const [id, body] = update_attachment_meta.mock.calls[0] as [
      string,
      { encrypted_meta: string; meta_nonce: string },
    ];

    expect(id).toBe("m3");
    expect(body.meta_nonce).toBe(ATTACHMENT_META_V2_NONCE);
    expect(
      await decrypt_envelope_v2_plaintext(body.encrypted_meta, [DATA_KEK]),
    ).toBe('{"subject":"kept"}');
  });

  it("keeps password metas and lists only sent mail when not admitted", async () => {
    listing(
      [
        {
          id: "a",
          encrypted_envelope: btoa("sealed:old-pw"),
          envelope_nonce: "AQ==",
          has_attachments: true,
        },
      ],
      [{ id: "d", has_attachments: true }],
    );
    attachments_for({
      a: [
        { id: "m1", encrypted_meta: OLD_META, meta_nonce: PASSWORD_META_NONCE },
      ],
    });

    await reencrypt_all_sent_mail("old-pw", "new-pw", {
      envelope_v2_key: () => null,
    });

    expect(list_encrypted_mail_items).toHaveBeenCalledTimes(1);

    const body = update_attachment_meta.mock.calls[0]?.[1] as {
      encrypted_meta: string;
      meta_nonce: string;
    };

    expect(body.encrypted_meta).toBe(btoa("sealed:new-pw"));
    expect(body.meta_nonce).not.toBe(ATTACHMENT_META_V2_NONCE);
  });
});
