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
  get_effective_retry_count: () => 0,
  get_effective_retry_delay: () => 1,
}));

const { routed_fetch } = await import("@/services/routing/routing_provider");
const { api_client } = await import("../client");
const { capture_decrypt_readiness } =
  await import("@/services/crypto/decrypt_readiness");

function reply(status: number, payload: Record<string, unknown>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    headers: { get: () => null },
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

async function transient_epoch_after(run: () => Promise<unknown>) {
  const before = capture_decrypt_readiness().transient_epoch;

  await run();

  return capture_decrypt_readiness().transient_epoch - before;
}

describe("api client transient failures", () => {
  beforeEach(() => {
    vi.mocked(routed_fetch).mockReset();
  });

  it.each([401, 403, 408, 425, 429, 500, 502, 503])(
    "marks a %i reply as transient",
    async (status) => {
      vi.mocked(routed_fetch).mockResolvedValue(
        reply(status, { error: "unavailable" }),
      );

      const delta = await transient_epoch_after(() =>
        api_client.get(`/mail/v1/escrow?case=${status}`, { skip_cache: true }),
      );

      expect(delta).toBeGreaterThan(0);
    },
  );

  it("marks a network failure as transient", async () => {
    vi.mocked(routed_fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    const delta = await transient_epoch_after(() =>
      api_client.get("/mail/v1/escrow?case=network", { skip_cache: true }),
    );

    expect(delta).toBeGreaterThan(0);
  });

  it.each([200, 400, 404])("does not mark a %i reply", async (status) => {
    vi.mocked(routed_fetch).mockResolvedValue(reply(status, { ok: true }));

    const delta = await transient_epoch_after(() =>
      api_client.get(`/mail/v1/escrow?case=ok${status}`, { skip_cache: true }),
    );

    expect(delta).toBe(0);
  });
});
