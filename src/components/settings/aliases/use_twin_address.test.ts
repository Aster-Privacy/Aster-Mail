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
import type { TwinAddressResponse } from "@/services/api/aliases";

import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/api/aliases", () => ({
  get_twin_address: vi.fn(),
}));

import { claimable_siblings } from "./use_twin_address";

const twin = {
  address: "sam@astermail.org",
  domain: "astermail.org",
  local_part: "sam",
  state: "taken",
  siblings: [
    {
      address: "sam@astermail.org",
      domain: "astermail.org",
      local_part: "sam",
      state: "taken",
    },
    {
      address: "sam@astermail.me",
      domain: "astermail.me",
      local_part: "sam",
      state: "available",
    },
    {
      address: "sam@astermail.net",
      domain: "astermail.net",
      local_part: "sam",
      state: "reserved",
    },
    {
      address: "sam@aster.cx",
      domain: "aster.cx",
      local_part: "sam",
      state: "available",
    },
  ],
} as unknown as TwinAddressResponse;

const domains = (allowed: boolean) =>
  claimable_siblings(twin, allowed).map((s) => s.domain);

describe("claimable_siblings", () => {
  it("drops premium domains when the plan does not allow them", () => {
    expect(domains(false)).toEqual(["aster.cx"]);
  });

  it("keeps premium domains for plans that allow them", () => {
    expect(domains(true)).toEqual([
      "astermail.me",
      "astermail.net",
      "aster.cx",
    ]);
  });

  it("returns nothing when only premium siblings are claimable", () => {
    const premium_only = {
      ...twin,
      siblings: twin.siblings!.filter((s) => s.domain !== "aster.cx"),
    } as TwinAddressResponse;

    expect(claimable_siblings(premium_only, false)).toEqual([]);
  });
});
