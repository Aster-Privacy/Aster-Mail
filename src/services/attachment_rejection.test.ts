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

vi.mock("@/services/api/billing", () => ({
  get_available_plans: vi.fn(),
  get_current_plan: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { is_authenticated: vi.fn(() => true) },
}));

vi.mock("@/stores/upgrade_store", () => ({
  show_plan_limit_upgrade: vi.fn(),
}));

import {
  clear_attachment_limits_cache,
  refresh_attachment_limits,
} from "./attachment_limits";
import { describe_oversized_file } from "./attachment_rejection";

import { get_available_plans, get_current_plan } from "@/services/api/billing";

const PROD_PLANS = [
  { code: "free", max_attachment_size_bytes: 26214400, is_current: false },
  { code: "star", max_attachment_size_bytes: 52428800, is_current: false },
  { code: "nova", max_attachment_size_bytes: 104857600, is_current: false },
  {
    code: "supernova",
    max_attachment_size_bytes: 262144000,
    is_current: false,
  },
  { code: "duo", max_attachment_size_bytes: 104857600, is_current: false },
  { code: "family", max_attachment_size_bytes: 104857600, is_current: false },
];

const t = ((key: string, params?: Record<string, string | number>) =>
  `${key}|${JSON.stringify(params ?? {})}`) as never;

async function load_plans(current_code: string) {
  vi.mocked(get_available_plans).mockResolvedValue({
    data: {
      plans: PROD_PLANS.map((plan) => ({
        ...plan,
        is_current: plan.code === current_code,
      })),
    },
  } as never);
  vi.mocked(get_current_plan).mockResolvedValue({
    data: {
      plan: PROD_PLANS.find((plan) => plan.code === current_code),
    },
  } as never);

  clear_attachment_limits_cache();
  await refresh_attachment_limits(true);
}

describe("describe_oversized_file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("quotes the star limit and the cheapest plan that fits the file", async () => {
    await load_plans("star");

    const result = describe_oversized_file(t, "will.pdf", 26 * 1024 * 1024);

    expect(result.can_upgrade).toBe(true);
    expect(result.upgrade_plan_code).toBe("nova");
    expect(result.message).toContain("50 MB");
    expect(result.message).toContain("100 MB");
    expect(result.message).not.toContain("250 MB");
  });

  it("reaches for supernova when nothing smaller fits the file", async () => {
    await load_plans("star");

    const result = describe_oversized_file(t, "huge.zip", 200 * 1024 * 1024);

    expect(result.upgrade_plan_code).toBe("supernova");
    expect(result.message).toContain("250 MB");
  });

  it("never offers a shared plan as the upgrade target", async () => {
    await load_plans("free");

    const result = describe_oversized_file(t, "will.pdf", 90 * 1024 * 1024);

    expect(result.upgrade_plan_code).toBe("nova");
  });

  it("offers no upgrade on the highest plan", async () => {
    await load_plans("supernova");

    const result = describe_oversized_file(t, "huge.zip", 900 * 1024 * 1024);

    expect(result.can_upgrade).toBe(false);
    expect(result.upgrade_plan_code).toBe(null);
    expect(result.message).toContain("file_exceeds_max_size|");
  });
});
