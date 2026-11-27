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

const state = vi.hoisted(() => ({ calls: 0, fail: true }));

vi.mock("@/services/api/attachments", () => ({
  batch_attachment_meta: async (ids: string[]) => {
    state.calls += 1;

    if (state.fail) {
      return { error: "forbidden", code: "FORBIDDEN", status: 403 };
    }

    return { data: { items: Object.fromEntries(ids.map((id) => [id, []])) } };
  },
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  resolve_attachment_meta: async ({ size_bytes }: { size_bytes: number }) => ({
    filename: null,
    content_type: null,
    session_key: "",
    size_bytes,
    is_placeholder: true,
  }),
}));

const { prefetch_attachment_meta, clear_attachment_meta_cache } = await import(
  "@/services/attachment_meta_cache"
);

describe("attachment meta prefetch pause", () => {
  beforeEach(() => {
    clear_attachment_meta_cache();
    state.calls = 0;
    state.fail = true;
  });

  it("pauses prefetching after a failed batch", async () => {
    await prefetch_attachment_meta(["m1"]);
    await prefetch_attachment_meta(["m2"]);
    await prefetch_attachment_meta(["m3"]);

    expect(state.calls).toBe(1);
  });

  it("resumes after the cache is cleared", async () => {
    await prefetch_attachment_meta(["m1"]);
    clear_attachment_meta_cache();
    state.fail = false;
    await prefetch_attachment_meta(["m2"]);

    expect(state.calls).toBe(2);
  });

  it("resumes once the pause runs out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      await prefetch_attachment_meta(["m1"]);
      vi.setSystemTime(Date.now() + 31_000);
      state.fail = false;
      await prefetch_attachment_meta(["m2"]);
    } finally {
      vi.useRealTimers();
    }

    expect(state.calls).toBe(2);
  });
});
