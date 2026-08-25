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
const { get_translations } = await import("@/lib/i18n/translations");

const SERVER_MESSAGE = "Rate limit exceeded. Please try again later";

function rate_limited(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: { "content-type": "application/json" },
  });
}

describe("rate limit error messages", () => {
  beforeEach(() => {
    localStorage.clear();
    routed_fetch.mockReset();
  });

  it("replaces the untranslated server text with the active language", async () => {
    localStorage.setItem("astermail_language", "de");
    routed_fetch.mockResolvedValue(
      rate_limited({ error: SERVER_MESSAGE, code: "RATE_LIMIT_EXCEEDED" }),
    );

    const response = await new ApiClient().get("/feedback/v1");

    expect(response.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(response.error).toBe(get_translations("de").errors.rate_limited);
    expect(response.error).not.toBe(SERVER_MESSAGE);
  });

  it("keeps a server message that carries a reset time", async () => {
    const resets_at = "2026-01-01T00:00:00Z";

    routed_fetch.mockResolvedValue(
      rate_limited({
        error: "Too many sign-in attempts.",
        code: "RATE_LIMIT_EXCEEDED",
        resets_at,
      }),
    );

    const response = await new ApiClient().get("/auth/v1/login");

    expect(response.error).toBe("Too many sign-in attempts.");
    expect(response.resets_at).toBe(resets_at);
  });
});
