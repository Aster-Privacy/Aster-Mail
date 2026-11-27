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

const routed_fetch = vi.fn();

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch,
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: () => 0,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/services/account_manager", () => ({
  update_account_tokens: async () => true,
  get_current_account_id: async () => null,
  get_account_tokens: async () => ({ access_token: null, refresh_token: null }),
}));

const { ApiClient } = await import("./client/api_client");
const { is_background_paused, reset_request_governor } =
  await import("./client/request_governor");

function rate_limited(retry_after?: string): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests", code: "RATE_LIMIT_EXCEEDED" }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        ...(retry_after ? { "retry-after": retry_after } : {}),
      },
    },
  );
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function settle<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();

  return pending;
}

describe("rate limited request retry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    routed_fetch.mockReset();
    reset_request_governor();
  });

  afterEach(() => {
    reset_request_governor();
    vi.useRealTimers();
  });

  it("retries a read after Retry-After and returns the data", async () => {
    routed_fetch
      .mockResolvedValueOnce(rate_limited("1"))
      .mockResolvedValueOnce(rate_limited("2"))
      .mockResolvedValueOnce(ok({ value: 42 }));

    const response = await settle(
      new ApiClient().get<{ value: number }>("/payments/v1/referrals"),
    );

    expect(routed_fetch).toHaveBeenCalledTimes(3);
    expect(response.error).toBeUndefined();
    expect(response.data?.value).toBe(42);
  });

  it("waits out the Retry-After window before trying again", async () => {
    routed_fetch
      .mockResolvedValueOnce(rate_limited("3"))
      .mockResolvedValueOnce(ok({ value: 1 }));

    const pending = new ApiClient().get("/payments/v1/referrals");

    await vi.advanceTimersByTimeAsync(2500);
    expect(routed_fetch).toHaveBeenCalledTimes(1);

    await settle(pending);
    expect(routed_fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after three tries and returns the error", async () => {
    routed_fetch.mockImplementation(async () => rate_limited("1"));

    const response = await settle(
      new ApiClient().get("/payments/v1/referrals"),
    );

    expect(routed_fetch).toHaveBeenCalledTimes(3);
    expect(response.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("does not retry when the server asks for a long wait", async () => {
    routed_fetch.mockImplementation(async () => rate_limited("30"));

    const response = await settle(
      new ApiClient().get("/payments/v1/referrals"),
    );

    expect(routed_fetch).toHaveBeenCalledTimes(1);
    expect(response.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("never replays a request that changes state", async () => {
    routed_fetch.mockImplementation(async () => rate_limited("1"));

    const response = await settle(
      new ApiClient().post("/payments/v1/referrals/share", {}),
    );

    expect(routed_fetch).toHaveBeenCalledTimes(1);
    expect(response.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("pauses background work after a rate limit", async () => {
    routed_fetch.mockImplementation(async () => rate_limited("5"));

    const pending = new ApiClient().post("/payments/v1/referrals/share", {});

    await vi.advanceTimersByTimeAsync(0);
    await pending;

    expect(is_background_paused()).toBe(true);
  });

  it("keeps the session when the identity check is rate limited", async () => {
    routed_fetch.mockImplementation(async () => rate_limited("1"));

    const client = new ApiClient();

    client.set_authenticated(true);

    const pending = client.check_auth_status();

    await vi.advanceTimersByTimeAsync(20_000);

    const still_signed_in = await pending;

    expect(still_signed_in).toBe(true);
    expect(client.is_authenticated()).toBe(true);
  });
});
