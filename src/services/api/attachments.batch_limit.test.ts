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

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./folder_unlock_retry", () => ({
  with_folder_unlock: (
    token: string | undefined,
    run: (token: string | undefined) => unknown,
  ) => run(token),
}));

vi.mock("@/services/folder_context", () => ({
  resolve_item_unlock_token: () => undefined,
  resolve_items_unlock_token: () => undefined,
}));

const { batch_attachment_meta, MAX_ATTACHMENT_META_BATCH } =
  await import("./attachments");

function make_ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `mail-${index}`);
}

function sent_ids(call_index: number): string[] {
  return (post.mock.calls[call_index][1] as { mail_ids: string[] }).mail_ids;
}

beforeEach(() => {
  post.mockReset();
  post.mockImplementation(
    async (_path: string, body: { mail_ids: string[] }) => ({
      data: {
        items: Object.fromEntries(body.mail_ids.map((id) => [id, []])),
      },
    }),
  );
});

describe("batch_attachment_meta", () => {
  it("sends a small list in one request", async () => {
    const response = await batch_attachment_meta(make_ids(50));

    expect(post).toHaveBeenCalledTimes(1);
    expect(Object.keys(response.data?.items ?? {})).toHaveLength(50);
  });

  it("splits a long list so no request exceeds the limit", async () => {
    const ids = make_ids(120);
    const response = await batch_attachment_meta(ids);

    expect(post).toHaveBeenCalledTimes(3);
    expect(sent_ids(0)).toHaveLength(MAX_ATTACHMENT_META_BATCH);
    expect(sent_ids(1)).toHaveLength(MAX_ATTACHMENT_META_BATCH);
    expect(sent_ids(2)).toHaveLength(20);
    expect(Object.keys(response.data?.items ?? {}).sort()).toEqual(
      [...ids].sort(),
    );
  });

  it("returns the failure when a request is rejected", async () => {
    post
      .mockResolvedValueOnce({ data: { items: {} } })
      .mockResolvedValueOnce({ error: "failed", code: "SERVER_ERROR" });

    const response = await batch_attachment_meta(make_ids(120));

    expect(post).toHaveBeenCalledTimes(2);
    expect(response.data).toBeUndefined();
    expect(response.error).toBe("failed");
  });
});
