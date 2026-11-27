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
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./client", () => ({
  api_client: { get: h.get, post: h.post },
}));

import {
  clear_external_key_cache,
  get_recipient_public_key,
  RECIPIENT_KEY_MISS_TTL_MS,
} from "./keys";

const NOT_FOUND = { error: "User not found", code: "NOT_FOUND", status: 404 };

describe("recipient public key lookup", () => {
  beforeEach(() => {
    vi.useRealTimers();
    clear_external_key_cache();
    h.get.mockReset();
  });

  it("asks for an empty answer for an outside address", async () => {
    h.get.mockResolvedValue({ data: { found: false } });

    const response = await get_recipient_public_key(
      "friend",
      "friend@example.com",
    );

    expect(h.get).toHaveBeenCalledWith(
      "/crypto/v1/keys/public/friend?email=friend%40example.com&missing=empty",
    );
    expect(response.status).toBe(404);
    expect(response.code).toBe("NOT_FOUND");
    expect(response.data).toBeUndefined();
  });

  it("keeps the plain request for an Aster address", async () => {
    h.get.mockResolvedValue(NOT_FOUND);

    await get_recipient_public_key("someone", "someone@astermail.org");

    expect(h.get).toHaveBeenCalledWith(
      "/crypto/v1/keys/public/someone?email=someone%40astermail.org",
    );
  });

  it("shares one request between concurrent lookups", async () => {
    let resolve: (value: unknown) => void = () => undefined;

    h.get.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const first = get_recipient_public_key("friend", "friend@example.com");
    const second = get_recipient_public_key("friend", "Friend@Example.com");

    resolve(NOT_FOUND);
    await Promise.all([first, second]);

    expect(h.get).toHaveBeenCalledTimes(1);
  });

  it("remembers a missing outside key without asking again", async () => {
    h.get.mockResolvedValue(NOT_FOUND);

    await get_recipient_public_key("friend", "friend@example.com");
    const again = await get_recipient_public_key(
      "friend",
      "friend@example.com",
    );

    expect(h.get).toHaveBeenCalledTimes(1);
    expect(again.status).toBe(404);
  });

  it("asks again once the remembered miss expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T00:00:00Z"));
    h.get.mockResolvedValue(NOT_FOUND);

    await get_recipient_public_key("friend", "friend@example.com");
    vi.setSystemTime(Date.now() + RECIPIENT_KEY_MISS_TTL_MS + 1);
    await get_recipient_public_key("friend", "friend@example.com");

    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("never remembers a miss for an Aster address", async () => {
    h.get.mockResolvedValue(NOT_FOUND);

    await get_recipient_public_key("someone", "someone@astermail.org");
    await get_recipient_public_key("someone", "someone@astermail.org");

    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failed lookup", async () => {
    h.get.mockResolvedValue({ error: "Server error", status: 500 });

    await get_recipient_public_key("friend", "friend@example.com");
    await get_recipient_public_key("friend", "friend@example.com");

    expect(h.get).toHaveBeenCalledTimes(2);
  });

  it("forgets remembered misses when the cache is cleared", async () => {
    h.get.mockResolvedValue(NOT_FOUND);

    await get_recipient_public_key("friend", "friend@example.com");
    clear_external_key_cache();
    await get_recipient_public_key("friend", "friend@example.com");

    expect(h.get).toHaveBeenCalledTimes(2);
  });
});
