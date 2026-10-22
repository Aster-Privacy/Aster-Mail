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
  encrypt_mail_metadata: vi.fn(),
  current: {} as Record<string, unknown>,
}));

vi.mock("./mail_metadata_core", () => ({
  blob_only_update_fields: () => [],
  create_default_metadata: () => ({ is_read: false }),
  decrypt_mail_metadata: async () => ({ ...hoisted.current }),
  encrypt_mail_metadata: (...a: unknown[]) =>
    hoisted.encrypt_mail_metadata(...a),
}));

vi.mock("@/services/api/mail", () => ({
  patch_mail_item_metadata: (...a: unknown[]) =>
    hoisted.patch_mail_item_metadata(...a),
  get_mail_item: vi.fn(),
}));

import { update_item_metadata } from "./mail_metadata_writer";

describe("update_item_metadata category state", () => {
  beforeEach(() => {
    hoisted.patch_mail_item_metadata.mockReset();
    hoisted.patch_mail_item_metadata.mockResolvedValue({
      data: { success: true },
    });
    hoisted.encrypt_mail_metadata.mockReset();
    hoisted.encrypt_mail_metadata.mockResolvedValue({
      encrypted_metadata: "enc",
      metadata_nonce: "nonce",
    });
  });

  it("reports the category state the blob held before the write", async () => {
    hoisted.current = {
      is_read: true,
      category: "promotions",
      future_field: "kept",
    };

    const result = await update_item_metadata(
      "p1",
      { encrypted_metadata: "e1", metadata_nonce: "n1", metadata_version: 4 },
      { category: "primary", category_pinned: true },
    );

    expect(result.previous).toEqual({
      category: "promotions",
      category_pinned: false,
    });
    expect(result.written_version).toBe(5);
    expect(hoisted.encrypt_mail_metadata.mock.calls[0]![0]).toMatchObject({
      is_read: true,
      category: "primary",
      category_pinned: true,
      future_field: "kept",
    });
  });

  it("clears the pin when the earlier state was unpinned", async () => {
    hoisted.current = {
      is_read: false,
      category: "primary",
      category_pinned: true,
    };

    const result = await update_item_metadata(
      "p2",
      { encrypted_metadata: "e2", metadata_nonce: "n2" },
      { category: "promotions", category_pinned: undefined },
    );

    expect(result.previous).toEqual({
      category: "primary",
      category_pinned: true,
    });

    const written = hoisted.encrypt_mail_metadata.mock.calls[0]![0] as Record<
      string,
      unknown
    >;

    expect(written.category).toBe("promotions");
    expect(written.category_pinned).toBeUndefined();
  });
});
