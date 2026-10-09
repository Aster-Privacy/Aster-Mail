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

const post = vi.fn();
const del = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    delete: (...args: unknown[]) => del(...args),
    put: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("./folder_unlock_retry", () => ({
  with_folder_unlock: (
    token: string | undefined,
    run: (token: string | undefined) => unknown,
  ) => run(token),
}));

const { list_mail_items } = await import("./mail");
const { bulk_unblock_senders_by_tokens } = await import("./blocked_senders");
const { bulk_remove_allowed_senders_by_tokens } =
  await import("./allowed_senders");
const { BULK_REQUEST_LIMIT } = await import("./chunked_request");

function make_ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `id-${index}`);
}

function body_tokens(call: unknown[]): string[] {
  const options = call[1] as { body: string };

  return (JSON.parse(options.body) as { sender_tokens: string[] })
    .sender_tokens;
}

beforeEach(() => {
  post.mockReset();
  del.mockReset();
});

describe("bulk requests stay under the server id limit", () => {
  it("fetches a large id list in batches and merges every item", async () => {
    post.mockImplementation(async (_path: string, body: { ids: string[] }) => ({
      data: {
        items: body.ids.map((id) => ({ id })),
        total: body.ids.length,
        has_more: false,
      },
    }));

    const ids = make_ids(300);
    const response = await list_mail_items({ ids });

    expect(post).toHaveBeenCalledTimes(3);
    for (const call of post.mock.calls) {
      expect(call[0]).toBe("/mail/v1/messages/batch");
      expect((call[1] as { ids: string[] }).ids.length).toBeLessThanOrEqual(
        BULK_REQUEST_LIMIT,
      );
    }
    expect(response.data?.items.map((item) => item.id)).toEqual(ids);
    expect(response.data?.total).toBe(300);
  });

  it("unblocks every sender when more than the limit are selected", async () => {
    del.mockImplementation(
      async (_path: string, options: { body: string }) => ({
        data: {
          success: true,
          unblocked_count: (
            JSON.parse(options.body) as { sender_tokens: string[] }
          ).sender_tokens.length,
        },
      }),
    );

    const tokens = make_ids(250);
    const response = await bulk_unblock_senders_by_tokens(tokens);

    expect(del).toHaveBeenCalledTimes(3);
    expect(del.mock.calls.flatMap(body_tokens)).toEqual(tokens);
    expect(response.data).toEqual({ success: true, unblocked_count: 250 });
  });

  it("removes every allowed sender when more than the limit are selected", async () => {
    del.mockImplementation(
      async (_path: string, options: { body: string }) => ({
        data: {
          success: true,
          removed_count: (
            JSON.parse(options.body) as { sender_tokens: string[] }
          ).sender_tokens.length,
        },
      }),
    );

    const tokens = make_ids(201);
    const response = await bulk_remove_allowed_senders_by_tokens(tokens);

    expect(del).toHaveBeenCalledTimes(3);
    for (const call of del.mock.calls) {
      expect(body_tokens(call).length).toBeLessThanOrEqual(BULK_REQUEST_LIMIT);
    }
    expect(response.data).toEqual({ success: true, removed_count: 201 });
  });

  it("reports the error when a later batch fails", async () => {
    del
      .mockResolvedValueOnce({ data: { success: true, removed_count: 100 } })
      .mockResolvedValueOnce({ error: "nope" });

    const response = await bulk_remove_allowed_senders_by_tokens(make_ids(150));

    expect(response.error).toBe("nope");
  });
});
