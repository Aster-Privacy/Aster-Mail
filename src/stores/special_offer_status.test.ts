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
import type { SpecialOfferStatus } from "@/services/api/offers";

import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  fetch_special_offer_status: vi.fn(),
  claim_special_offer: vi.fn(),
  accept_special_offer_on_server: vi.fn(),
  dismiss_special_offer_on_server: vi.fn(),
}));

vi.mock("@/services/api/offers", () => api);

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ is_authenticated: false, user: null }),
}));

import {
  claim_special_offer_slot,
  get_special_offer_status_snapshot,
  load_special_offer_status,
  record_special_offer_accepted,
  reset_special_offer_status,
} from "./special_offer_status";

function make_status(
  overrides: Partial<SpecialOfferStatus> = {},
): SpecialOfferStatus {
  return {
    available: true,
    auto_show: true,
    shown: false,
    dismissed: false,
    plan_code: "nova",
    percent_off: 50,
    duration_months: 12,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

describe("special_offer_status account scoping", () => {
  beforeEach(() => {
    reset_special_offer_status();
    vi.clearAllMocks();
  });

  it("keys the loaded status to the account it was fetched for", async () => {
    api.fetch_special_offer_status.mockResolvedValueOnce(make_status());

    await load_special_offer_status("user_a");

    const state = get_special_offer_status_snapshot();

    expect(state.user_id).toBe("user_a");
    expect(state.is_loaded).toBe(true);
    expect(state.status?.auto_show).toBe(true);
  });

  it("reloads when a different account signs in", async () => {
    api.fetch_special_offer_status
      .mockResolvedValueOnce(make_status())
      .mockResolvedValueOnce(
        make_status({ available: false, auto_show: false }),
      );

    await load_special_offer_status("user_a");
    await load_special_offer_status("user_b");

    const state = get_special_offer_status_snapshot();

    expect(api.fetch_special_offer_status).toHaveBeenCalledTimes(2);
    expect(state.user_id).toBe("user_b");
    expect(state.status?.available).toBe(false);
  });

  it("drops a response that belongs to the previous account", async () => {
    const first = deferred<SpecialOfferStatus | null>();

    api.fetch_special_offer_status
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(make_status({ auto_show: false }));

    const stale = load_special_offer_status("user_a");

    await load_special_offer_status("user_b");
    first.resolve(make_status({ auto_show: true }));
    await stale;

    const state = get_special_offer_status_snapshot();

    expect(state.user_id).toBe("user_b");
    expect(state.status?.auto_show).toBe(false);
  });

  it("does not latch a response that lands after a reset", async () => {
    const pending = deferred<SpecialOfferStatus | null>();

    api.fetch_special_offer_status.mockReturnValueOnce(pending.promise);

    const request = load_special_offer_status("user_a");

    reset_special_offer_status();
    pending.resolve(null);
    await request;

    const state = get_special_offer_status_snapshot();

    expect(state.is_loaded).toBe(false);
    expect(state.user_id).toBeNull();
  });

  it("ignores a claim that resolves after the account changed", async () => {
    const claim = deferred<boolean>();

    api.fetch_special_offer_status.mockResolvedValue(make_status());
    api.claim_special_offer.mockReturnValueOnce(claim.promise);

    await load_special_offer_status("user_a");

    const granted = claim_special_offer_slot();

    reset_special_offer_status();
    await load_special_offer_status("user_b");
    claim.resolve(true);

    expect(await granted).toBe(false);
    expect(get_special_offer_status_snapshot().status?.auto_show).toBe(true);
  });
});

describe("record_special_offer_accepted", () => {
  beforeEach(() => {
    reset_special_offer_status();
    vi.clearAllMocks();
  });

  it("leaves the status untouched when the server refuses", async () => {
    api.fetch_special_offer_status.mockResolvedValueOnce(make_status());
    api.accept_special_offer_on_server.mockResolvedValueOnce(false);

    await load_special_offer_status("user_a");

    expect(await record_special_offer_accepted()).toBe(false);

    const status = get_special_offer_status_snapshot().status;

    expect(status?.shown).toBe(false);
    expect(status?.auto_show).toBe(true);
  });

  it("reports failure when the request throws", async () => {
    api.fetch_special_offer_status.mockResolvedValueOnce(make_status());
    api.accept_special_offer_on_server.mockRejectedValueOnce(
      new Error("offline"),
    );

    await load_special_offer_status("user_a");

    expect(await record_special_offer_accepted()).toBe(false);
  });

  it("marks the offer shown and keeps it available once accepted", async () => {
    api.fetch_special_offer_status.mockResolvedValueOnce(make_status());
    api.accept_special_offer_on_server.mockResolvedValueOnce(true);

    await load_special_offer_status("user_a");

    expect(await record_special_offer_accepted()).toBe(true);

    const status = get_special_offer_status_snapshot().status;

    expect(status?.shown).toBe(true);
    expect(status?.auto_show).toBe(false);
    expect(status?.available).toBe(true);
  });
});
