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

vi.mock("@/services/routing/routing_provider", () => ({
  routed_fetch: vi.fn(),
  get_effective_base_url: (default_base_url: string) => default_base_url,
  get_effective_timeout: (default_timeout: number) => default_timeout,
  get_effective_retry_count: (default_retry: number) => default_retry,
  get_effective_retry_delay: () => 1,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("./client");

function response_with_failing_body(): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.reject(new TypeError("body stream interrupted")),
  } as unknown as Response;
}

function response_with_json(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

describe("api client body download failure", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
  });

  it("returns a network error instead of a silent empty success", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(response_with_failing_body());

    const result = await api_client.get("/mail/v1/messages?case=fail", {
      skip_cache: true,
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toBeTruthy();
    expect(result.code).toBe("NETWORK_ERROR");
  });

  it("retries body failures on idempotent requests when retry is configured", async () => {
    vi.mocked(routed_fetch).mockResolvedValue(response_with_failing_body());

    const result = await api_client.get("/mail/v1/messages?case=retry", {
      skip_cache: true,
      retry: 2,
      retry_delay: 1,
    });

    expect(result.code).toBe("NETWORK_ERROR");
    expect(vi.mocked(routed_fetch)).toHaveBeenCalledTimes(3);
  });

  it("recovers when a retry succeeds after an interrupted body", async () => {
    vi.mocked(routed_fetch)
      .mockResolvedValueOnce(response_with_failing_body())
      .mockResolvedValueOnce(response_with_json({ items: [], total: 7 }));

    const result = await api_client.get<{ items: unknown[]; total: number }>(
      "/mail/v1/messages?case=recover",
      { skip_cache: true, retry: 2, retry_delay: 1 },
    );

    expect(result.error).toBeUndefined();
    expect(result.data?.total).toBe(7);
  });
});
