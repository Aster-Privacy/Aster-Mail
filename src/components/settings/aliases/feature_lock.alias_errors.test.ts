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
import { describe, it, expect, vi } from "vitest";

vi.mock("@/stores/upgrade_store", () => ({
  show_plan_limit_upgrade: vi.fn(),
}));
vi.mock("@/stores/alias_cap_upsell_store", () => ({
  show_alias_cap_upsell: vi.fn(),
}));

import {
  is_alias_domain_plan_error,
  is_alias_limit_error,
} from "./feature_lock";

const plan_limit = {
  error: "Upgrade your plan to create aliases on it",
  server_code: "PLAN_LIMIT_EXCEEDED",
};

describe("alias create error classification", () => {
  it("treats a premium domain rejection on a free plan as a domain error", () => {
    expect(is_alias_domain_plan_error(plan_limit, "astermail.me", false)).toBe(
      true,
    );
    expect(is_alias_limit_error(plan_limit, "astermail.me", false)).toBe(false);
  });

  it("keeps the alias count limit for standard domains", () => {
    expect(is_alias_domain_plan_error(plan_limit, "astermail.org", false)).toBe(
      false,
    );
    expect(is_alias_limit_error(plan_limit, "astermail.org", false)).toBe(true);
  });

  it("keeps the alias count limit when the plan allows premium domains", () => {
    expect(is_alias_domain_plan_error(plan_limit, "astermail.net", true)).toBe(
      false,
    );
    expect(is_alias_limit_error(plan_limit, "astermail.net", true)).toBe(true);
  });

  it("keeps the old behavior when no domain is given", () => {
    expect(is_alias_limit_error(plan_limit)).toBe(true);
    expect(is_alias_limit_error({ error: "Alias limit reached" })).toBe(true);
    expect(
      is_alias_limit_error({ error: "Conflict", server_code: "CONFLICT" }),
    ).toBe(false);
  });
});
