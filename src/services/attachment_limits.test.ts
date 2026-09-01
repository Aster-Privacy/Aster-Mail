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
  get_current_plan: vi.fn(),
}));

vi.mock("@/services/api/client", () => ({
  api_client: { is_authenticated: vi.fn(() => true) },
}));

import {
  clear_attachment_limits_cache,
  ensure_attachment_limits,
  get_max_attachment_size,
  FREE_MAX_ATTACHMENT_SIZE,
} from "./attachment_limits";

import { get_current_plan } from "@/services/api/billing";

const PAID_LIMIT = 250 * 1024 * 1024;

describe("ensure_attachment_limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clear_attachment_limits_cache();
    vi.mocked(get_current_plan).mockResolvedValue({
      data: {
        plan: { code: "supernova", max_attachment_size_bytes: PAID_LIMIT },
      },
    } as never);
  });

  it("fetches the plan limit before the first size check", async () => {
    expect(get_max_attachment_size()).toBe(FREE_MAX_ATTACHMENT_SIZE);

    await ensure_attachment_limits();

    expect(get_max_attachment_size()).toBe(PAID_LIMIT);
  });

  it("does not refetch once the limit is known", async () => {
    await ensure_attachment_limits();
    await ensure_attachment_limits();

    expect(vi.mocked(get_current_plan)).toHaveBeenCalledTimes(1);
  });

  it("keeps the free limit when the plan lookup fails", async () => {
    vi.mocked(get_current_plan).mockResolvedValue({ data: null } as never);

    await ensure_attachment_limits();

    expect(get_max_attachment_size()).toBe(FREE_MAX_ATTACHMENT_SIZE);
  });
});
