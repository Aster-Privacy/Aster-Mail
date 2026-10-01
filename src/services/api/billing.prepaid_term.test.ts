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
import { describe, it, expect } from "vitest";

import { with_prepaid_term, type SubscriptionResponse } from "./billing";

function subscription(
  overrides: Partial<SubscriptionResponse> = {},
): SubscriptionResponse {
  return {
    plan: {
      id: "plan",
      code: "star",
      name: "Star",
      description: null,
      storage_limit_bytes: 0,
      price_cents: 5000,
      billing_period: "year",
    },
    status: "active",
    cancel_at_period_end: false,
    current_period_start: null,
    current_period_end: null,
    storage: {
      used_bytes: 0,
      limit_bytes: 0,
      total_limit_bytes: 0,
      percentage_used: 0,
      is_over_limit: false,
    },
    currency: "usd",
    payment_failed_at: null,
    grace_period_end: null,
    payment_provider: "crypto",
    ...overrides,
  } as SubscriptionResponse;
}

describe("with_prepaid_term", () => {
  it("shows a two-year crypto term as biennial at the term price", () => {
    const result = with_prepaid_term(
      subscription({ prepaid_term_months: 24, prepaid_term_price_cents: 9000 }),
    );

    expect(result.plan.billing_period).toBe("biennial");
    expect(result.plan.price_cents).toBe(9000);
  });

  it("leaves a yearly term unchanged", () => {
    const input = subscription({
      prepaid_term_months: 12,
      prepaid_term_price_cents: null,
    });

    expect(with_prepaid_term(input)).toBe(input);
  });

  it("leaves the subscription unchanged without term data", () => {
    const input = subscription();

    expect(with_prepaid_term(input)).toBe(input);
  });
});
