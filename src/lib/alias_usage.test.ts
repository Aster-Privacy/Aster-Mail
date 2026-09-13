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
import { describe, expect, it } from "vitest";

import {
  alias_cap_offer_for_plan,
  compute_alias_usage,
} from "@/lib/alias_usage";

describe("compute_alias_usage", () => {
  it("reports room left below the warning ratio", () => {
    const usage = compute_alias_usage(2, 5);

    expect(usage.level).toBe("normal");
    expect(usage.remaining).toBe(3);
    expect(usage.percent).toBe(40);
  });

  it("turns prominent as the cap gets close", () => {
    expect(compute_alias_usage(4, 5).level).toBe("approaching");
  });

  it("reports the cap once every alias is used", () => {
    const usage = compute_alias_usage(5, 5);

    expect(usage.level).toBe("at_limit");
    expect(usage.remaining).toBe(0);
    expect(usage.percent).toBe(100);
  });

  it("stays at the cap when the count runs past the limit", () => {
    const usage = compute_alias_usage(7, 5);

    expect(usage.level).toBe("at_limit");
    expect(usage.percent).toBe(100);
  });

  it("treats a negative limit as unlimited", () => {
    const usage = compute_alias_usage(40, -1);

    expect(usage.is_unlimited).toBe(true);
    expect(usage.level).toBe("normal");
    expect(usage.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("clamps unusable input", () => {
    const usage = compute_alias_usage(Number.NaN, 5);

    expect(usage.used).toBe(0);
    expect(usage.level).toBe("normal");
  });
});

describe("alias_cap_offer_for_plan", () => {
  it("offers Star to free accounts", () => {
    expect(alias_cap_offer_for_plan("free")).toEqual({
      plan_code: "star",
      alias_allowance: 15,
      is_unlimited: false,
    });
  });

  it("offers Star when the plan is unknown", () => {
    expect(alias_cap_offer_for_plan(null)?.plan_code).toBe("star");
  });

  it("offers unlimited aliases to Star accounts", () => {
    expect(alias_cap_offer_for_plan("Star")?.is_unlimited).toBe(true);
  });

  it("offers nothing above Nova", () => {
    expect(alias_cap_offer_for_plan("supernova")).toBeNull();
  });
});
