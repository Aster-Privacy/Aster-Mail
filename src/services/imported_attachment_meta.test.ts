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

vi.mock("./crypto/envelope", () => ({
  array_to_base64: (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)),
  decrypt_envelope_with_bytes: async (sealed: string, bytes: Uint8Array) =>
    sealed === `sealed:${new TextDecoder().decode(bytes)}`
      ? { filename: "file.pdf" }
      : null,
  encrypt_envelope_with_bytes: async (_value: object, bytes: Uint8Array) => ({
    encrypted: `sealed:${new TextDecoder().decode(bytes)}`,
    nonce: btoa(String.fromCharCode(1)),
  }),
}));

vi.mock("./crypto/attachment_meta_v2", () => ({
  seal_attachment_meta_v2: async () => ({
    encrypted_meta: "v2-sealed",
    meta_nonce: "AgAAAAAAAAAAAAAA",
  }),
}));

import {
  imported_attachments_locked,
  reseal_imported_attachment_row,
  reseal_imported_attachments,
  type ImportedResealOutcome,
} from "./imported_attachment_meta";

const encode = (value: string) => new TextEncoder().encode(value);

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
      row("a1", "sealed:old-pw"),
      encode("old-pw"),
      encode("new-pw"),
      null,
    );

    expect(outcome).toBe("rewritten");
    expect(update_attachment_meta).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ encrypted_meta: "sealed:new-pw" }),
    );

    const body = update_attachment_meta.mock.calls[0][1] as {
      meta_nonce: string;
    };

    expect(atob(body.meta_nonce)).toHaveLength(12);
  });

  it("seals to the storage key when one is available", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", "sealed:old-pw"),
      encode("old-pw"),
      encode("new-pw"),
      new Uint8Array(32),
    );

    expect(outcome).toBe("rewritten");
    expect(update_attachment_meta).toHaveBeenCalledWith("a1", {
      encrypted_meta: "v2-sealed",
      meta_nonce: "AgAAAAAAAAAAAAAA",
    });
  });

  it("leaves details that already open with the new password", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", "sealed:new-pw"),
      encode("old-pw"),
      encode("new-pw"),
      null,
    );

    expect(outcome).toBe("skipped");
    expect(update_attachment_meta).not.toHaveBeenCalled();
  });

  it("reports details neither password opens as unreadable", async () => {
    const outcome = await reseal_imported_attachment_row(
      row("a1", "sealed:older-pw"),
      encode("old-pw"),
      encode("new-pw"),
      null,
    );

    expect(outcome).toBe("unreadable");
    expect(update_attachment_meta).not.toHaveBeenCalled();
  });

  it("reports a rejected write as failed", async () => {
    update_attachment_meta.mockResolvedValue({ error: "not found" });

    const outcome = await reseal_imported_attachment_row(
      row("a1", "sealed:old-pw"),
      encode("old-pw"),
      encode("new-pw"),
      null,
    );

    expect(outcome).toBe("failed");
  });

  it("follows the cursor across every page", async () => {
    list_imported_password_meta
      .mockResolvedValueOnce({
        data: { attachments: [row("a1", "sealed:old-pw")], next_cursor: "a1" },
      })
      .mockResolvedValueOnce({
        data: {
          attachments: [row("a2", "sealed:old-pw"), row("a3", "sealed:x")],
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

  it("finds details the current password cannot open", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: {
        attachments: [row("a1", "sealed:pw"), row("a2", "sealed:old-pw")],
        next_cursor: "a2",
      },
    });

    expect(await imported_attachments_locked(encode("pw"))).toBe(true);
    expect(list_imported_password_meta).toHaveBeenCalledWith(undefined, 5);
  });

  it("reports nothing locked when the current password opens every row", async () => {
    list_imported_password_meta.mockResolvedValue({
      data: { attachments: [row("a1", "sealed:pw")], next_cursor: null },
    });

    expect(await imported_attachments_locked(encode("pw"))).toBe(false);
  });
});
