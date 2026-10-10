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
import type { ApiResponse } from "./client";

import { describe, it, expect, vi, beforeEach } from "vitest";

const post = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const { send_in_chunks, merge_affected } = await import("./chunked_request");
const { bulk_add_tag } = await import("./tags");

beforeEach(() => {
  post.mockReset();
});

type Affected = { affected: number };
type SendFn = (chunk: string[]) => Promise<ApiResponse<Affected>>;

const make_ids = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `id-${i}`);

describe("send_in_chunks", () => {
  it("sends a small list in one request", async () => {
    const send = vi.fn<SendFn>().mockResolvedValue({ data: { affected: 3 } });
    const result = await send_in_chunks(make_ids(3), 100, send, merge_affected);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.data?.affected).toBe(3);
  });

  it("splits a large list and merges every chunk", async () => {
    const send = vi.fn<SendFn>((chunk) =>
      Promise.resolve({ data: { affected: chunk.length } }),
    );
    const result = await send_in_chunks(
      make_ids(300),
      100,
      send,
      merge_affected,
    );

    expect(send).toHaveBeenCalledTimes(3);
    for (const call of send.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(100);
    }
    expect(result.data?.affected).toBe(300);
  });

  it("stops and returns the error when a chunk fails", async () => {
    const send = vi
      .fn<SendFn>()
      .mockResolvedValueOnce({ data: { affected: 100 } })
      .mockResolvedValueOnce({ error: "bad request" });
    const result = await send_in_chunks(
      make_ids(300),
      100,
      send,
      merge_affected,
    );

    expect(send).toHaveBeenCalledTimes(2);
    expect(result.error).toBe("bad request");
  });
});

describe("bulk_add_tag", () => {
  it("never sends more than 100 ids in one request", async () => {
    post.mockImplementation((_url: string, body: { ids: string[] }) =>
      Promise.resolve({ data: { status: "ok", affected: body.ids.length } }),
    );

    const result = await bulk_add_tag(make_ids(300), "tag");

    expect(post).toHaveBeenCalledTimes(3);
    for (const call of post.mock.calls) {
      expect((call[1] as { ids: string[] }).ids.length).toBeLessThanOrEqual(
        100,
      );
    }
    expect(result.data?.affected).toBe(300);
  });
});
