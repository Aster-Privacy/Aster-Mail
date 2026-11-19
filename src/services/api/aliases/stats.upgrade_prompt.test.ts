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

const { get_alias_stats, restore_alias } = await import("./deleted");

function plan_limited(): Response {
  return new Response(
    JSON.stringify({
      error: "You've reached the alias analytics limit for your current plan",
      code: "PLAN_LIMIT_EXCEEDED",
      details: { resource: "alias analytics" },
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

describe("alias reads never raise the upgrade modal", () => {
  const on_plan_limit = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    routed_fetch.mockReset();
    on_plan_limit.mockReset();
    window.addEventListener("aster:plan-limit-hit", on_plan_limit);
  });

  afterEach(() => {
    window.removeEventListener("aster:plan-limit-hit", on_plan_limit);
  });

  it("stays silent when a paid alias read is refused", async () => {
    routed_fetch.mockResolvedValue(plan_limited());

    const response = await get_alias_stats("alias-1");

    expect(response.server_code).toBe("PLAN_LIMIT_EXCEEDED");
    expect(on_plan_limit).not.toHaveBeenCalled();
  });

  it("still raises the modal when a person restores an alias", async () => {
    routed_fetch.mockResolvedValue(plan_limited());

    await restore_alias("alias-1");

    expect(on_plan_limit).toHaveBeenCalledTimes(1);
  });
});
