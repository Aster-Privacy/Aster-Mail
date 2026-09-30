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

const { get_account_limit, link_account_device, unlink_account_device } =
  await import("./switch");

function plan_limited(): Response {
  return new Response(
    JSON.stringify({
      error: "Plan limit exceeded: linked accounts",
      code: "PLAN_LIMIT_EXCEEDED",
      details: { resource: "linked accounts" },
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

describe("account limit lookups never raise the upgrade modal", () => {
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

  it("stays silent when linking the device exceeds the plan limit", async () => {
    routed_fetch.mockResolvedValue(plan_limited());

    const response = await link_account_device();

    expect(response.server_code).toBe("PLAN_LIMIT_EXCEEDED");
    expect(on_plan_limit).not.toHaveBeenCalled();
  });

  it("stays silent when reading the limit exceeds the plan limit", async () => {
    routed_fetch.mockResolvedValue(plan_limited());

    const response = await get_account_limit();

    expect(response.server_code).toBe("PLAN_LIMIT_EXCEEDED");
    expect(on_plan_limit).not.toHaveBeenCalled();
  });

  it("still raises the modal for calls a person started", async () => {
    routed_fetch.mockResolvedValue(plan_limited());

    await unlink_account_device("user-1");

    expect(on_plan_limit).toHaveBeenCalledTimes(1);
  });
});
