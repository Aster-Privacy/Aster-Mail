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
import type { PlanLimitsResponse } from "@/services/api/billing";

import { describe, it, expect } from "vitest";

import { resolve_feature_locked } from "./use_plan_limits";

function make_limits(entries: Record<string, number>): PlanLimitsResponse {
  const limits: PlanLimitsResponse["limits"] = {};

  for (const [key, limit] of Object.entries(entries)) {
    limits[key] = { limit, current: 0, is_at_limit: false };
  }

  return {
    plan_code: "free",
    plan_name: "Free",
    limits,
    storage: {} as never,
  };
}

describe("resolve_feature_locked", () => {
  it("treats every feature as locked until limits load", () => {
    expect(resolve_feature_locked(null, "has_email_expiration")).toBe(true);
  });

  it("locks a feature whose limit is zero", () => {
    const limits = make_limits({ has_email_expiration: 0 });

    expect(resolve_feature_locked(limits, "has_email_expiration")).toBe(true);
  });

  it("unlocks a feature whose limit is positive or unlimited", () => {
    const limits = make_limits({
      has_email_expiration: 1,
      max_alias_directories: -1,
    });

    expect(resolve_feature_locked(limits, "has_email_expiration")).toBe(false);
    expect(resolve_feature_locked(limits, "max_alias_directories")).toBe(false);
  });

  it("locks a feature the loaded plan does not list", () => {
    const limits = make_limits({ has_email_expiration: 1 });

    expect(
      resolve_feature_locked(limits, "has_password_protected_messages"),
    ).toBe(true);
  });
});
