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
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ resolved: false }));

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => ({
    data: {
      items: Object.fromEntries(
        ids.map((id) => [
          id,
          [
            {
              id: `att-${id}`,
              mail_item_id: id,
              seq_num: 0,
              size_bytes: 10,
              encrypted_meta: id,
              meta_nonce: "n",
            },
          ],
        ]),
      ),
    },
  }),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  resolve_attachment_meta: async ({ size_bytes }: { size_bytes: number }) => ({
    filename: state.resolved ? "invoice.pdf" : null,
    content_type: state.resolved ? "application/pdf" : null,
    session_key: "",
    size_bytes,
    is_placeholder: !state.resolved,
  }),
}));

const {
  prefetch_attachment_meta,
  get_cached_attachment_meta,
  clear_attachment_meta_cache,
} = await import("@/services/attachment_meta_cache");

describe("attachment meta cache", () => {
  beforeEach(() => {
    clear_attachment_meta_cache();
    state.resolved = false;
  });

  it("does not cache a batch whose key could not be resolved", async () => {
    await prefetch_attachment_meta(["m1"]);

    expect(get_cached_attachment_meta("m1")).toBeNull();
  });

  it("caches once the key becomes available", async () => {
    await prefetch_attachment_meta(["m1"]);

    state.resolved = true;

    await prefetch_attachment_meta(["m1"]);

    expect(get_cached_attachment_meta("m1")?.[0].filename).toBe("invoice.pdf");
  });
});
