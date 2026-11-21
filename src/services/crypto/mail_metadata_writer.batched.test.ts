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
  batched_bulk_patch_metadata: vi.fn(),
  list_mail_items: vi.fn(),
  in_flight: 0,
  peak: 0,
}));

vi.mock("./mail_metadata_core", () => ({
  blob_only_update_fields: () => ["category"],
  create_default_metadata: () => ({ is_read: false }),
  decrypt_mail_metadata: async () => {
    hoisted.in_flight += 1;
    hoisted.peak = Math.max(hoisted.peak, hoisted.in_flight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    hoisted.in_flight -= 1;

    return { is_read: true, category: "primary" };
  },
  encrypt_mail_metadata: async () => ({
    encrypted_metadata: "enc",
    metadata_nonce: "nonce",
  }),
}));

vi.mock("@/services/api/mail", () => ({
  batched_bulk_patch_metadata: (...a: unknown[]) =>
    hoisted.batched_bulk_patch_metadata(...a),
  list_mail_items: (...a: unknown[]) => hoisted.list_mail_items(...a),
  patch_mail_item_metadata: vi.fn(),
  get_mail_item: vi.fn(),
}));

import {
  bulk_update_metadata_by_ids,
  write_items_metadata,
} from "./mail_metadata_writer";

function list_response(ids: string[]) {
  return {
    data: {
      items: ids.map((id) => ({
        id,
        encrypted_metadata: `blob-${id}`,
        metadata_nonce: `nonce-${id}`,
        metadata_version: 3,
      })),
    },
  };
}

describe("batched metadata writes", () => {
  beforeEach(() => {
    hoisted.in_flight = 0;
    hoisted.peak = 0;
    hoisted.batched_bulk_patch_metadata.mockReset();
    hoisted.batched_bulk_patch_metadata.mockImplementation(
      async (items: Array<{ id: string }>) => ({
        succeeded_ids: items.map((item) => item.id),
        failed_ids: [],
        was_cancelled: false,
      }),
    );
    hoisted.list_mail_items.mockReset();
    hoisted.list_mail_items.mockImplementation(
      async ({ ids }: { ids: string[] }) => list_response(ids),
    );
  });

  it("writes many items with one bulk request and fetches only missing blobs", async () => {
    const results = await write_items_metadata([
      {
        id: "a",
        current: { encrypted_metadata: "e", metadata_nonce: "n" },
        updates: { category: "social" },
      },
      { id: "b", current: {}, updates: { category: "social" } },
      {
        id: "c",
        current: {
          encrypted_metadata: "e",
          metadata_nonce: "n",
          metadata_version: 7,
        },
        updates: { category: "social" },
      },
    ]);

    expect(hoisted.list_mail_items).toHaveBeenCalledTimes(1);
    expect(hoisted.list_mail_items.mock.calls[0]![0]).toEqual({ ids: ["b"] });
    expect(hoisted.batched_bulk_patch_metadata).toHaveBeenCalledTimes(1);
    expect(hoisted.batched_bulk_patch_metadata.mock.calls[0]![0]).toHaveLength(
      3,
    );
    expect(results.get("a")?.success).toBe(true);
    expect(results.get("b")?.written_version).toBe(4);
    expect(results.get("c")?.written_version).toBe(8);
    expect(results.get("c")?.previous).toEqual({
      category: "primary",
      category_pinned: false,
    });
  });

  it("reports items the server rejected as failed", async () => {
    hoisted.batched_bulk_patch_metadata.mockResolvedValue({
      succeeded_ids: ["x"],
      failed_ids: ["y"],
      was_cancelled: false,
    });

    const results = await write_items_metadata(
      ["x", "y"].map((id) => ({
        id,
        current: { encrypted_metadata: "e", metadata_nonce: "n" },
        updates: { category: "updates" },
      })),
    );

    expect(results.get("x")?.success).toBe(true);
    expect(results.get("y")?.success).toBe(false);
  });

  it("decrypts a select-all scope concurrently and keeps every id", async () => {
    const ids = Array.from({ length: 240 }, (_, index) => `s${index}`);
    const result = await bulk_update_metadata_by_ids(ids, {
      category: "promotions",
      category_pinned: true,
    });

    expect(result.updated_count).toBe(240);
    expect(hoisted.peak).toBeGreaterThan(1);

    const sent = hoisted.batched_bulk_patch_metadata.mock.calls[0]![0] as Array<{
      id: string;
    }>;

    expect(sent.map((item) => item.id)).toEqual(ids);
  });
});
