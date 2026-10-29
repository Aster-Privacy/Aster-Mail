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

vi.mock("./crypto/envelope", () => ({
  array_to_base64: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  base64_to_array: (value: string) =>
    Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
  decrypt_envelope_with_bytes: async (sealed: string, bytes: Uint8Array) =>
    sealed === `sealed:${new TextDecoder().decode(bytes)}`
      ? { name: "file.pdf" }
      : null,
  encrypt_envelope_with_bytes: async (_value: object, bytes: Uint8Array) => ({
    encrypted: `sealed:${new TextDecoder().decode(bytes)}`,
    nonce: btoa(String.fromCharCode(1)),
  }),
}));

import { reencrypt_all_sent_mail } from "./sent_mail_reseal";

const PGP_NONCE = "";

describe("reencrypt_all_sent_mail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update_attachment_meta.mockResolvedValue({ data: { success: true } });
    update_mail_item.mockResolvedValue({ data: { success: true } });
  });

  it("reseals password-sealed attachment details on an already converted item", async () => {
    list_encrypted_mail_items.mockResolvedValue({
      data: {
        items: [
          {
            id: "item-1",
            encrypted_envelope: "-----BEGIN PGP MESSAGE-----",
            envelope_nonce: PGP_NONCE,
            has_attachments: true,
          },
        ],
        next_cursor: null,
      },
    });
    list_attachments.mockResolvedValue({
      data: {
        attachments: [
          { id: "att-old", encrypted_meta: "sealed:old-pw" },
          { id: "att-pgp", encrypted_meta: "-----BEGIN PGP MESSAGE-----" },
        ],
      },
    });

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw");

    expect(update_mail_item).not.toHaveBeenCalled();
    expect(update_attachment_meta).toHaveBeenCalledTimes(1);
    expect(update_attachment_meta).toHaveBeenCalledWith(
      "att-old",
      expect.objectContaining({ encrypted_meta: "sealed:new-pw" }),
    );
    expect(summary).toMatchObject({ rewritten: 1, failed: 0 });
  });

  it("skips a converted item without attachments", async () => {
    list_encrypted_mail_items.mockResolvedValue({
      data: {
        items: [
          {
            id: "item-1",
            encrypted_envelope: "-----BEGIN PGP MESSAGE-----",
            envelope_nonce: PGP_NONCE,
          },
        ],
        next_cursor: null,
      },
    });

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw");

    expect(list_attachments).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ rewritten: 0, failed: 0 });
  });

  it("reports a failure when the attachment list cannot be read", async () => {
    list_encrypted_mail_items.mockResolvedValue({
      data: {
        items: [
          {
            id: "item-1",
            encrypted_envelope: "-----BEGIN PGP MESSAGE-----",
            envelope_nonce: PGP_NONCE,
            attachment_count: 2,
          },
        ],
        next_cursor: null,
      },
    });
    list_attachments.mockResolvedValue({ error: "offline" });

    const summary = await reencrypt_all_sent_mail("old-pw", "new-pw");

    expect(summary).toMatchObject({ failed: 1 });
  });
});
