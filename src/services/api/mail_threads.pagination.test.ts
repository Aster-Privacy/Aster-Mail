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

const get = vi.fn();
const remember = vi.fn();

vi.mock("@/services/api/client", () => ({
  api_client: {
    get: (endpoint: string, options?: unknown) => get(endpoint, options),
  },
}));

vi.mock("@/services/folder_context", () => ({
  resolve_thread_unlock_token: () => undefined,
  remember_thread_message_ids: (token: string, ids: string[]) =>
    remember(token, ids),
}));

vi.mock("./folder_unlock_retry", () => ({
  with_folder_unlock: <T,>(_token: unknown, run: (t?: string) => Promise<T>) =>
    run(undefined),
}));

import { get_thread_messages } from "./mail_threads";

function thread_page(count: number, start: number, has_more: boolean) {
  return {
    data: {
      thread: { thread_token: "t1" },
      messages: Array.from({ length: count }, (_, index) => ({
        id: `m_${start + index}`,
      })),
      has_more,
      next_cursor: has_more ? `cursor_${start + count}` : null,
    },
  };
}

describe("get_thread_messages pagination", () => {
  beforeEach(() => {
    get.mockReset();
    remember.mockReset();
  });

  it("collects every message past the first page", async () => {
    get
      .mockResolvedValueOnce(thread_page(100, 0, true))
      .mockResolvedValueOnce(thread_page(20, 100, false));

    const result = await get_thread_messages("t1");

    expect(get).toHaveBeenCalledTimes(2);
    expect(result.data?.messages).toHaveLength(120);
    expect(result.data?.messages[119].id).toBe("m_119");
    expect(result.data?.has_more).toBe(false);
    expect(String(get.mock.calls[1][0])).toContain("cursor=cursor_100");
    expect(remember).toHaveBeenCalledWith(
      "t1",
      expect.arrayContaining(["m_119"]),
    );
  });

  it("stops after one page when the server returns everything", async () => {
    get.mockResolvedValueOnce(thread_page(3, 0, false));

    const result = await get_thread_messages("t1");

    expect(get).toHaveBeenCalledTimes(1);
    expect(result.data?.messages).toHaveLength(3);
  });

  it("keeps the pages it already collected when a later page fails", async () => {
    get
      .mockResolvedValueOnce(thread_page(100, 0, true))
      .mockResolvedValueOnce({ error: "boom" });

    const result = await get_thread_messages("t1");

    expect(result.error).toBeUndefined();
    expect(result.data?.messages).toHaveLength(100);
  });

  it("reports the error when the first page fails", async () => {
    get.mockResolvedValueOnce({ error: "boom" });

    const result = await get_thread_messages("t1");

    expect(result.error).toBe("boom");
  });
});
