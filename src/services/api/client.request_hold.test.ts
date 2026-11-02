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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

vi.mock("@/services/account_manager", () => ({
  read_stored_refresh_token: vi.fn().mockResolvedValue(null),
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");

const DATA_ENDPOINT = "/core/v1/preferences";

function json_response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

function deferred_verdict() {
  let settle: (value: boolean) => void = () => undefined;
  const verdict = new Promise<boolean>((resolve) => {
    settle = resolve;
  });

  return { verdict, settle };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("api client request hold", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
    vi.mocked(routed_fetch).mockResolvedValue(json_response({ ok: true }));
    api_client.set_authenticated(true);
  });

  afterEach(() => {
    api_client.set_authenticated(false);
  });

  it("sends a held request once the session is confirmed", async () => {
    const { verdict, settle } = deferred_verdict();
    const held = api_client.hold_requests_until(verdict);
    const request = api_client.get(DATA_ENDPOINT, { skip_cache: true });

    await flush();
    expect(routed_fetch).not.toHaveBeenCalled();

    settle(true);

    expect(await held).toBe(true);
    expect((await request).error).toBeUndefined();
    expect(routed_fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses held requests without sending them when the session is rejected", async () => {
    const { verdict, settle } = deferred_verdict();
    const held = api_client.hold_requests_until(verdict);
    const request = api_client.get(DATA_ENDPOINT, { skip_cache: true });

    settle(false);

    expect(await held).toBe(false);
    expect((await request).code).toBe("UNAUTHORIZED");
    expect(routed_fetch).not.toHaveBeenCalled();
  });

  it("treats a failed session check as a rejection", async () => {
    const held = api_client.hold_requests_until(
      Promise.reject(new Error("offline")),
    );
    const request = api_client.get(DATA_ENDPOINT, { skip_cache: true });

    expect(await held).toBe(false);
    expect((await request).code).toBe("UNAUTHORIZED");
    expect(routed_fetch).not.toHaveBeenCalled();
  });

  it("lets the session check itself through while requests are held", async () => {
    const { verdict, settle } = deferred_verdict();

    api_client.hold_requests_until(verdict);
    vi.mocked(routed_fetch).mockResolvedValue(
      json_response({ user_id: "someone" }),
    );

    const me = api_client.get("/core/v1/auth/me", { skip_cache: true });

    await flush();
    expect(routed_fetch).toHaveBeenCalledTimes(1);

    settle(true);
    await me;
  });

  it("drops held requests when the session ends before the check returns", async () => {
    const { verdict, settle } = deferred_verdict();
    const held = api_client.hold_requests_until(verdict);
    const request = api_client.get(DATA_ENDPOINT, { skip_cache: true });

    api_client.set_authenticated(false);

    expect(await held).toBeNull();
    expect((await request).code).toBe("UNAUTHORIZED");

    settle(true);
    await flush();
    expect(routed_fetch).not.toHaveBeenCalled();
  });

  it("stops holding once the check has settled", async () => {
    await api_client.hold_requests_until(Promise.resolve(true));

    const request = api_client.get(DATA_ENDPOINT, { skip_cache: true });

    expect((await request).error).toBeUndefined();
    expect(routed_fetch).toHaveBeenCalledTimes(1);
  });
});
