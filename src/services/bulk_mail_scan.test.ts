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

const list_mail_items = vi.fn();
const list_encrypted_mail_items = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => list_mail_items(...args),
  list_encrypted_mail_items: (...args: unknown[]) =>
    list_encrypted_mail_items(...args),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(async () => ({ is_read: true })),
  create_default_metadata: vi.fn(() => ({ is_read: false })),
}));

import {
  scan_received_items,
  scan_encrypted_items,
  decrypt_items_metadata_for_action,
  SCAN_PAGE_SIZE,
  SCAN_ITEM_CAP,
} from "@/services/bulk_mail_scan";

function make_page(count: number, next_cursor?: string) {
  return {
    data: {
      items: Array.from({ length: count }, (_v, i) => ({
        id: `${next_cursor ?? "end"}_${i}`,
        item_type: "received",
      })),
      next_cursor,
    },
  };
}

describe("bulk_mail_scan", () => {
  beforeEach(() => {
    list_mail_items.mockReset();
    list_encrypted_mail_items.mockReset();
  });

  it("requests a bounded page size instead of the server default", async () => {
    list_mail_items.mockResolvedValueOnce(make_page(3));

    await scan_received_items();

    expect(list_mail_items).toHaveBeenCalledWith({
      item_type: "received",
      limit: SCAN_PAGE_SIZE,
    });
  });

  it("omits the cursor on the first page and sends it afterwards", async () => {
    list_mail_items
      .mockResolvedValueOnce(make_page(2, "c1"))
      .mockResolvedValueOnce(make_page(2));

    await scan_received_items();

    expect(list_mail_items.mock.calls[0][0]).not.toHaveProperty("cursor");
    expect(list_mail_items.mock.calls[1][0].cursor).toBe("c1");
  });

  it("stops at the item cap rather than paging the whole mailbox", async () => {
    list_mail_items.mockImplementation(async () =>
      make_page(SCAN_PAGE_SIZE, "more"),
    );

    const result = await scan_received_items();

    expect(result.reached_cap).toBe(true);
    expect(result.items).toHaveLength(SCAN_ITEM_CAP);
    expect(list_mail_items.mock.calls.length).toBeLessThanOrEqual(
      Math.ceil(SCAN_ITEM_CAP / SCAN_PAGE_SIZE),
    );
  });

  it("honors a caller supplied cap and still reports truncation", async () => {
    list_mail_items.mockImplementation(async () =>
      make_page(SCAN_PAGE_SIZE, "more"),
    );

    const cap = SCAN_PAGE_SIZE * 4;
    const result = await scan_received_items(undefined, undefined, cap);

    expect(result.items).toHaveLength(cap);
    expect(result.reached_cap).toBe(true);
  });

  it("stops paging when the signal aborts", async () => {
    const controller = new AbortController();

    list_mail_items.mockImplementation(async () => {
      controller.abort();

      return make_page(SCAN_PAGE_SIZE, "more");
    });

    const result = await scan_received_items(controller.signal);

    expect(list_mail_items).toHaveBeenCalledTimes(1);
    expect(result.reached_cap).toBe(false);
  });

  it("reports progress per page with a has_more flag", async () => {
    list_mail_items
      .mockResolvedValueOnce(make_page(2, "c1"))
      .mockResolvedValueOnce(make_page(2));

    const seen: Array<[number, boolean]> = [];

    await scan_received_items(undefined, (page, has_more) =>
      seen.push([page, has_more]),
    );

    expect(seen).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("scans the encrypted listing through the same bounded path", async () => {
    list_encrypted_mail_items.mockResolvedValueOnce(make_page(2));

    const result = await scan_encrypted_items();

    expect(list_encrypted_mail_items).toHaveBeenCalledWith({
      limit: SCAN_PAGE_SIZE,
    });
    expect(result.items).toHaveLength(2);
  });

  it("halts metadata decryption when the signal aborts", async () => {
    const controller = new AbortController();
    const items = Array.from({ length: 200 }, (_v, i) => ({
      id: `i${i}`,
      item_type: "received",
      encrypted_metadata: "x",
      metadata_nonce: "n",
    }));

    controller.abort();
    await decrypt_items_metadata_for_action(items as never, controller.signal);

    expect(items.every((item) => !("metadata" in item))).toBe(true);
  });
});
