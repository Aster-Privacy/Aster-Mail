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

const h = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: { get: vi.fn(), post: h.post },
}));

import {
  clear_external_key_cache,
  discover_external_keys_batch,
  MAX_EXTERNAL_DISCOVERY_BATCH,
} from "./keys";

function make_emails(count: number): string[] {
  return Array.from(
    { length: count },
    (_, index) => `person${index}@example.com`,
  );
}

function not_found(email: string) {
  return {
    email,
    found: false,
    public_key: null,
    fingerprint: null,
    source: null,
    expires_at: null,
    will_encrypt: false,
    fingerprint_change: null,
  };
}

function sent_emails(call_index: number): string[] {
  return (h.post.mock.calls[call_index][1] as { emails: string[] }).emails;
}

describe("external key batch discovery limit", () => {
  beforeEach(() => {
    clear_external_key_cache();
    h.post.mockReset();
    h.post.mockImplementation(
      async (_path: string, body: { emails: string[] }) => ({
        data: { keys: body.emails.map(not_found) },
      }),
    );
  });

  it("matches the server batch limit", () => {
    expect(MAX_EXTERNAL_DISCOVERY_BATCH).toBe(20);
  });

  it("sends one request when the list fits in a batch", async () => {
    const response = await discover_external_keys_batch(make_emails(20));

    expect(h.post).toHaveBeenCalledTimes(1);
    expect(response.error).toBeUndefined();
    expect(response.data).toHaveLength(20);
  });

  it("splits long recipient lists into server-sized batches", async () => {
    const emails = make_emails(45);
    const response = await discover_external_keys_batch(emails);

    expect(h.post).toHaveBeenCalledTimes(3);
    expect(sent_emails(0)).toHaveLength(20);
    expect(sent_emails(1)).toHaveLength(20);
    expect(sent_emails(2)).toHaveLength(5);
    expect([0, 1, 2].flatMap(sent_emails)).toEqual(emails);
    expect(response.error).toBeUndefined();
    expect(response.data?.map((key) => key.email)).toEqual(emails);
  });

  it("asks for a repeated address once", async () => {
    await discover_external_keys_batch([
      "a@example.com",
      "A@example.com",
      "b@example.com",
    ]);

    expect(h.post).toHaveBeenCalledTimes(1);
    expect(sent_emails(0)).toEqual(["a@example.com", "b@example.com"]);
  });

  it("keeps the batches that succeed when one fails", async () => {
    h.post.mockImplementation(
      async (_path: string, body: { emails: string[] }) =>
        body.emails[0] === "person20@example.com"
          ? { error: "Server error" }
          : { data: { keys: body.emails.map(not_found) } },
    );

    const response = await discover_external_keys_batch(make_emails(25));

    expect(h.post).toHaveBeenCalledTimes(2);
    expect(response.error).toBe("Server error");
    expect(response.data).toHaveLength(20);
  });

  it("does not call the server for cached addresses", async () => {
    const emails = make_emails(3);

    await discover_external_keys_batch(emails);
    h.post.mockClear();

    const response = await discover_external_keys_batch(emails);

    expect(h.post).not.toHaveBeenCalled();
    expect(response.data).toHaveLength(3);
  });
});
