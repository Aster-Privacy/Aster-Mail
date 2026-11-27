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
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  status: vi.fn(),
}));

vi.mock("@/services/api/vanguard", () => ({
  get_vanguard_status: () => h.status(),
}));

import {
  is_vanguard_enabled,
  load_vanguard_state,
  set_vanguard_enabled,
} from "@/services/vanguard_store";

describe("load_vanguard_state", () => {
  beforeEach(() => {
    localStorage.clear();
    h.status.mockReset();
  });

  it("returns server eligibility and stores the enabled flag", async () => {
    h.status.mockResolvedValue({
      data: { enabled: true, eligible: true, lockdown_enabled: false },
    });

    const state = await load_vanguard_state("acct");

    expect(state).toEqual({ enabled: true, eligible: true, from_server: true });
    expect(is_vanguard_enabled("acct")).toBe(true);
  });

  it("treats a missing eligible field as unknown", async () => {
    h.status.mockResolvedValue({ data: { enabled: false } });

    const state = await load_vanguard_state("acct");

    expect(state.eligible).toBeNull();
    expect(state.from_server).toBe(true);
  });

  it("falls back to the cached flag when the request fails", async () => {
    set_vanguard_enabled("acct", true);
    h.status.mockResolvedValue({ error: "network" });

    const state = await load_vanguard_state("acct");

    expect(state).toEqual({ enabled: true, eligible: null, from_server: false });
  });
});
