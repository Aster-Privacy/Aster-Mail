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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const get = vi.fn();

vi.mock("../api/client", () => ({
  api_client: { get: (...args: unknown[]) => get(...args), put: vi.fn() },
}));

const {
  clear_ratchet_lookup_misses,
  fetch_prekey_bundle,
  fetch_published_identity_history,
  fetch_ratchet_identity,
} = await import("./ratchet_prekey_bundle");

function not_found() {
  return { error: "not found", code: "NOT_FOUND", status: 404 };
}

describe("ratchet lookup miss cache", () => {
  beforeEach(() => {
    get.mockReset();
    clear_ratchet_lookup_misses();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not ask again for an identity the server just reported missing", async () => {
    get.mockResolvedValue(not_found());

    expect(await fetch_ratchet_identity("nobody")).toBeNull();
    expect(await fetch_ratchet_identity("nobody")).toBeNull();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it("asks again once the miss has expired", async () => {
    get.mockResolvedValue(not_found());

    await fetch_prekey_bundle("nobody");
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetch_prekey_bundle("nobody");

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("keeps misses separate per address", async () => {
    get.mockResolvedValue(not_found());

    await fetch_published_identity_history("nobody", "a@example.com");
    await fetch_published_identity_history("nobody", "b@example.com");

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("does not remember transient failures", async () => {
    get.mockResolvedValue({ error: "unavailable", status: 503 });

    await fetch_ratchet_identity("someone");
    await fetch_ratchet_identity("someone");

    expect(get).toHaveBeenCalledTimes(2);
  });

  it("returns a published identity after a later success", async () => {
    const identity = {
      user_id: "u",
      kem_identity_key: "k",
      signed_prekey: "s",
      signed_prekey_signature: "sig",
    };

    get.mockResolvedValueOnce(not_found());
    await fetch_ratchet_identity("late");

    clear_ratchet_lookup_misses();
    get.mockResolvedValueOnce({ data: identity, status: 200 });

    expect(await fetch_ratchet_identity("late")).toEqual(identity);
  });
});
