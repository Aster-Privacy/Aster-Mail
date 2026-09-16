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
import { describe, it, expect, beforeEach, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  patch_mail_item_metadata: vi.fn(),
}));

vi.mock("./mail_metadata_core", () => ({
  blob_only_update_fields: () => [],
  create_default_metadata: () => ({ is_read: false }),
  decrypt_mail_metadata: async () => ({ is_read: false }),
  encrypt_mail_metadata: async () => ({
    encrypted_metadata: "enc",
    metadata_nonce: "nonce",
  }),
}));

vi.mock("@/services/api/mail", () => ({
  patch_mail_item_metadata: (...a: unknown[]) =>
    hoisted.patch_mail_item_metadata(...a),
  get_mail_item: vi.fn(),
}));

import { update_item_metadata } from "./mail_metadata_writer";

const fields = { encrypted_metadata: "e1", metadata_nonce: "n1" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

describe("update_item_metadata force", () => {
  beforeEach(() => {
    hoisted.patch_mail_item_metadata.mockReset();
    hoisted.patch_mail_item_metadata.mockResolvedValue({
      data: { success: true },
    });
  });

  it("dedupes an identical write without force", async () => {
    await update_item_metadata("a1", fields, { is_read: false });
    await update_item_metadata("a1", fields, { is_read: false });

    expect(hoisted.patch_mail_item_metadata).toHaveBeenCalledTimes(1);
  });

  it("sends a recently completed write again with force", async () => {
    await update_item_metadata("a2", fields, { is_read: false });
    await update_item_metadata(
      "a2",
      fields,
      { is_read: false },
      { force: true },
    );

    expect(hoisted.patch_mail_item_metadata).toHaveBeenCalledTimes(2);
    expect(hoisted.patch_mail_item_metadata).toHaveBeenLastCalledWith(
      "a2",
      expect.objectContaining({ is_read: false }),
    );
  });

  it("does not reuse an in-flight write with force", async () => {
    const first = deferred<{ data: { success: boolean } }>();

    hoisted.patch_mail_item_metadata.mockReturnValueOnce(first.promise);

    const pending = update_item_metadata("a3", fields, { is_read: false });

    await new Promise((r) => setTimeout(r, 0));

    const forced = update_item_metadata(
      "a3",
      fields,
      { is_read: false },
      { force: true },
    );

    first.resolve({ data: { success: true } });
    await Promise.all([pending, forced]);

    expect(hoisted.patch_mail_item_metadata).toHaveBeenCalledTimes(2);
  });
});
