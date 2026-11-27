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

const list_imported_password_meta = vi.fn();
const update_attachment_meta = vi.fn();

vi.mock("./api/attachments", () => ({
  list_imported_password_meta: (after?: string, limit?: number) =>
    list_imported_password_meta(after, limit),
  update_attachment_meta: (id: string, body: unknown) =>
    update_attachment_meta(id, body),
}));

const { sealed_with } = vi.hoisted(() => ({
  sealed_with: (password: string) => `sealed:${password}:${"A".repeat(200)}`,
}));

vi.mock("./crypto/envelope", () => ({
  array_to_base64: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decrypt_envelope_with_bytes: async (sealed: string, bytes: Uint8Array) =>
    sealed === sealed_with(new TextDecoder().decode(bytes))
      ? { filename: "file.pdf" }
      : null,
  encrypt_envelope_with_bytes: async (_value: object, bytes: Uint8Array) => ({
    encrypted: sealed_with(new TextDecoder().decode(bytes)),
    nonce: btoa(String.fromCharCode(1)),
  }),
}));

const get_mail_item = vi.fn();
const decrypt_mail_envelope = vi.fn();
const get_attachment_key = vi.fn();

vi.mock("./api/mail", () => ({
  get_mail_item: (id: string) => get_mail_item(id),
}));

vi.mock("@/components/email/shared/decrypt_envelope", () => ({
  decrypt_mail_envelope: (...args: unknown[]) => decrypt_mail_envelope(...args),
}));

vi.mock("./crypto/inbound_attachment_keys", () => ({
  get_attachment_key: (id: string, seq: number) => get_attachment_key(id, seq),
}));

vi.mock("./crypto/attachment_meta_v2", () => ({
  seal_attachment_meta_v2: async () => ({
    encrypted_meta: "v2-sealed",
    meta_nonce: "AgAAAAAAAAAAAAAA",
  }),
}));

const vault_in_memory = vi.fn(() => ({ identity_key: "k" }) as unknown);

vi.mock("./crypto/memory_key_store", () => ({
  get_vault_from_memory: () => vault_in_memory(),
}));

vi.mock("./crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: async (encrypted_meta: string) => {
    if (encrypted_meta.startsWith("key-sealed:")) {
      return { filename: "file.pdf", content_type: "application/pdf" };
    }
    throw new Error("unreadable");
  },
}));

import {
  envelope_carries_attachment_key,
  imported_attachments_locked,
  reseal_imported_attachment_row,
  reseal_imported_attachments,
  type ImportedResealOutcome,
} from "./imported_attachment_meta";

const encode = (value: string) => new TextEncoder().encode(value);
const no_envelope_key = async () => false;
const envelope_key = async () => true;

function server_sealed_meta(length = 88) {
  return btoa(String.fromCharCode(...new Uint8Array(length).fill(7)));
}

function row(id: string, encrypted_meta: string) {
  return {
    id,
    mail_item_id: `mail-${id}`,
    encrypted_meta,
    meta_nonce: "cmFuZG9tbm9uY2Ux",
    size_bytes: 10,
    seq_num: 0,
  };
}

async function collect(old_password: string, new_password: string) {
  const outcomes: ImportedResealOutcome[] = [];

  await reseal_imported_attachments(
    encode(old_password),
    encode(new_password),
    null,
    (outcome) => outcomes.push(outcome),
    no_envelope_key,
  );

  return outcomes;
}

describe("imported attachment details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update_attachment_meta.mockResolvedValue({ data: { success: true } });
  });

  it("reseals details sealed with the previous password", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", sealed_with("old-pw")),
      encode("old-pw"),
      encode("new-pw"),
      null,
      no_envelope_key,
    );

    expect(outcome).toBe("rewritten");
    expect(update_attachment_meta).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ encrypted_meta: sealed_with("new-pw") }),
    );

    const body = update_attachment_meta.mock.calls[0][1] as {
      meta_nonce: string;
    };

    expect(atob(body.meta_nonce)).toHaveLength(12);
  });

  it("seals to the storage key when one is available", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", sealed_with("old-pw")),
      encode("old-pw"),
      encode("new-pw"),
      new Uint8Array(32),
      no_envelope_key,
    );

    expect(outcome).toBe("rewritten");
    expect(update_attachment_meta).toHaveBeenCalledWith("a1", {
      encrypted_meta: "v2-sealed",
      meta_nonce: "AgAAAAAAAAAAAAAA",
    });
  });

  it("leaves details that already open with the new password", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", sealed_with("new-pw")),
      encode("old-pw"),
      encode("new-pw"),
      null,
      no_envelope_key,
    );

    expect(outcome).toBe("skipped");
    expect(update_attachment_meta).not.toHaveBeenCalled();
  });

  it("leaves short server sealed details whose key travels in the message", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", server_sealed_meta()),
      encode("old-pw"),
      encode("new-pw"),
      null,
      envelope_key,
    );

    expect(outcome).toBe("skipped");
    expect(update_attachment_meta).not.toHaveBeenCalled();
  });

  it("leaves details whose key travels in the message", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", sealed_with("older-pw")),
      encode("old-pw"),
      encode("new-pw"),
      null,
      envelope_key,
    );

    expect(outcome).toBe("skipped");
    expect(update_attachment_meta).not.toHaveBeenCalled();
  });

  it("reports details neither password opens as unreadable", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", sealed_with("older-pw")),
      encode("old-pw"),
      encode("new-pw"),
      null,
      no_envelope_key,
    );

    expect(outcome).toBe("unreadable");
    expect(update_attachment_meta).not.toHaveBeenCalled();
  });

  it("reports a rejected write as failed", async () => {
    update_attachment_meta.mockResolvedValue({ error: "not found" });

    const outcome = await reseal_imported_attachment_row(
      row("a1", sealed_with("old-pw")),
      encode("old-pw"),
      encode("new-pw"),
      null,
      no_envelope_key,
    );

    expect(outcome).toBe("failed");
  });

  it("follows the cursor across every page", async () => {
    list_imported_password_meta
      .mockResolvedValueOnce({
        data: {
          attachments: [row("a1", sealed_with("old-pw"))],
          next_cursor: "a1",
        },
      })
      .mockResolvedValueOnce({
        data: {
          attachments: [
            row("a2", sealed_with("old-pw")),
            row("a3", sealed_with("x")),
          ],
          next_cursor: null,
        },
      });

    const outcomes = await collect("old-pw", "new-pw");

    expect(
      list_imported_password_meta.mock.calls.map((call) => call[0]),
    ).toEqual([undefined, "a1"]);
    expect(outcomes).toEqual(["rewritten", "rewritten", "unreadable"]);
  });

  it("reports a listing that keeps failing as one failure", async () => {
    list_imported_password_meta.mockResolvedValue({ error: "offline" });

    const outcomes = await collect("old-pw", "new-pw");

    expect(list_imported_password_meta).toHaveBeenCalledTimes(3);
    expect(outcomes).toEqual(["failed"]);
  });

  it("stops when the cursor does not advance", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [row("a1", sealed_with("new-pw"))],
        next_cursor: "a1",
      },
    });

    const outcomes = await collect("old-pw", "new-pw");

    expect(list_imported_password_meta).toHaveBeenCalledTimes(2);
    expect(outcomes).toEqual(["skipped", "skipped"]);
  });

  it("treats a server without the listing as having no rows", async () => {
    list_imported_password_meta.mockResolvedValue({
      error: "not found",
      status: 404,
    });

    const outcomes = await collect("old-pw", "new-pw");

    expect(list_imported_password_meta).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual([]);
  });

  it("finds details the current password cannot open", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [
          row("a1", sealed_with("pw")),
          row("a2", sealed_with("old-pw")),
        ],
        next_cursor: "a2",
      },
    });

    expect(
      await imported_attachments_locked(encode("pw"), no_envelope_key),
    ).toBe(true);
    expect(list_imported_password_meta).toHaveBeenCalledWith(undefined, 5);
  });

  it("ignores details the server sealed during an import", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [
          row("a1", server_sealed_meta(88)),
          row("a2", server_sealed_meta(93)),
        ],
        next_cursor: null,
      },
    });

    expect(await imported_attachments_locked(encode("pw"), envelope_key)).toBe(
      false,
    );
  });

  it("does not trust the length of details alone", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [row("a1", server_sealed_meta(88))],
        next_cursor: null,
      },
    });

    expect(
      await imported_attachments_locked(encode("pw"), no_envelope_key),
    ).toBe(true);
  });

  it("reports nothing locked when the current password opens every row", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: { attachments: [row("a1", sealed_with("pw"))], next_cursor: null },
    });

    expect(
      await imported_attachments_locked(encode("pw"), no_envelope_key),
    ).toBe(false);
  });

  it("ignores long server sealed details whose key travels in the message", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [row("a1", server_sealed_meta(240))],
        next_cursor: null,
      },
    });

    expect(await imported_attachments_locked(encode("pw"), envelope_key)).toBe(
      false,
    );
  });

  it("reads the attachment key from the message envelope", async () => {
    get_attachment_key.mockReturnValueOnce("").mockReturnValueOnce("a2V5");
    get_mail_item.mockResolvedValue({
      data: { encrypted_envelope: "ZW52", envelope_nonce: "bm9uY2U=" },
    });
    decrypt_mail_envelope.mockResolvedValue({ subject: "s" });

    expect(
      await envelope_carries_attachment_key({ mail_item_id: "m1", seq_num: 0 }),
    ).toBe(true);
    expect(decrypt_mail_envelope).toHaveBeenCalledWith(
      "ZW52",
      "bm9uY2U=",
      "m1",
    );
  });

  it("treats a message without the attachment key as password bound", async () => {
    get_attachment_key.mockReturnValue("");
    get_mail_item.mockResolvedValue({
      data: { encrypted_envelope: "ZW52", envelope_nonce: "bm9uY2U=" },
    });
    decrypt_mail_envelope.mockResolvedValue({ subject: "s" });

    expect(
      await envelope_carries_attachment_key({ mail_item_id: "m1", seq_num: 0 }),
    ).toBe(false);
  });

  it("treats a message it cannot read as password bound", async () => {
    get_attachment_key.mockReturnValue("");
    get_mail_item.mockRejectedValue(new Error("offline"));

    expect(
      await envelope_carries_attachment_key({ mail_item_id: "m1", seq_num: 0 }),
    ).toBe(false);

    get_mail_item.mockResolvedValue({ data: null });

    expect(
      await envelope_carries_attachment_key({ mail_item_id: "m1", seq_num: 0 }),
    ).toBe(false);
  });

  it("reports nothing locked when the account keys open the other rows", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [row("a1", sealed_with("pw")), row("a2", "key-sealed:identity")],
        next_cursor: null,
      },
    });

    expect(await imported_attachments_locked(encode("pw"))).toBe(false);
  });

  it("reports nothing locked while the account keys are not loaded", async () => {
    vault_in_memory.mockReturnValueOnce(null);
    list_imported_password_meta.mockResolvedValue({
      data: { attachments: [row("a1", "sealed:old-pw")], next_cursor: null },
    });

    expect(await imported_attachments_locked(encode("pw"))).toBe(false);
  });
});
