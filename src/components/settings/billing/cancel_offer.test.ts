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

import {
  get_cancel_offers,
  get_downgrade_offer,
  get_yearly_offer,
  read_billing_interval,
} from "./cancel_offer";

describe("read_billing_interval", () => {
  it("maps the stored billing period onto a term", () => {
    expect(read_billing_interval(null)).toBe("month");
    expect(read_billing_interval("month")).toBe("month");
    expect(read_billing_interval("monthly")).toBe("month");
    expect(read_billing_interval("year")).toBe("year");
    expect(read_billing_interval("yearly")).toBe("year");
    expect(read_billing_interval("biennial")).toBe("biennial");
    expect(read_billing_interval("two_year")).toBe("biennial");
  });
});

describe("get_downgrade_offer", () => {
  it("offers the next cheaper individual plan", () => {
    const offer = get_downgrade_offer("nova", "month");

    expect(offer?.plan_code).toBe("star");
    expect(offer?.is_family).toBe(false);
    expect(offer?.monthly_cents).toBe(299);

    expect(get_downgrade_offer("supernova", "month")?.plan_code).toBe("nova");
  });

  it("offers duo to a family subscriber", () => {
    const offer = get_downgrade_offer("family", "month");

    expect(offer?.plan_code).toBe("duo");
    expect(offer?.is_family).toBe(true);
    expect(offer?.monthly_cents).toBe(1299);
  });

  it("has nothing to offer on the cheapest rungs", () => {
    expect(get_downgrade_offer("star", "month")).toBeNull();
    expect(get_downgrade_offer("duo", "month")).toBeNull();
    expect(get_downgrade_offer("free", "month")).toBeNull();
    expect(get_downgrade_offer(null, "month")).toBeNull();
    expect(get_downgrade_offer("unknown_plan", "month")).toBeNull();
  });

  it("quotes the monthly equivalent of the current term", () => {
    expect(get_downgrade_offer("nova", "year")?.monthly_cents).toBe(242);
    expect(get_downgrade_offer("nova", "biennial")?.monthly_cents).toBe(208);
    expect(get_downgrade_offer("supernova", "year")?.monthly_cents).toBe(725);
  });
});

describe("get_yearly_offer", () => {
  it("offers yearly billing on the current plan with the real saving", () => {
    const offer = get_yearly_offer("nova", "month");

    expect(offer).toEqual({
      plan_code: "nova",
      plan_name: "Nova",
      is_family: false,
      yearly_monthly_cents: Math.round(8699 / 12),
      saving_cents: 899 * 12 - 8699,
    });
  });

  it("marks family plans", () => {
    expect(get_yearly_offer("duo", "month")?.is_family).toBe(true);
  });

  it("offers nothing to yearly, biennial, free, or unknown plans", () => {
    expect(get_yearly_offer("nova", "year")).toBeNull();
    expect(get_yearly_offer("nova", "biennial")).toBeNull();
    expect(get_yearly_offer("free", "month")).toBeNull();
    expect(get_yearly_offer("missing", "month")).toBeNull();
    expect(get_yearly_offer(null, "month")).toBeNull();
  });
});

describe("get_cancel_offers", () => {
  const monthly_nova = {
    cancel_at_period_end: false,
    has_stripe_subscription: true,
    payment_provider: "stripe",
    plan: { code: "nova", billing_period: "month" },
  };

  it("offers both a step down and yearly billing to monthly card plans", () => {
    const offers = get_cancel_offers(monthly_nova);

    expect(offers.downgrade?.plan_code).toBe("star");
    expect(offers.downgrade?.monthly_cents).toBe(299);
    expect(offers.yearly?.plan_code).toBe("nova");
  });

  it("prices the step down at the current yearly term without a yearly row", () => {
    const offers = get_cancel_offers({
      ...monthly_nova,
      plan: { code: "nova", billing_period: "year" },
    });

    expect(offers.downgrade?.monthly_cents).toBe(Math.round(2899 / 12));
    expect(offers.yearly).toBeNull();
  });

  it("hides the yearly row for lifetime plans", () => {
    expect(
      get_cancel_offers({ ...monthly_nova, is_lifetime: true }).yearly,
    ).toBeNull();
  });

  it("offers nothing to store, crypto, or already canceling plans", () => {
    const empty = { downgrade: null, yearly: null };

    expect(
      get_cancel_offers({ ...monthly_nova, has_stripe_subscription: false }),
    ).toEqual(empty);
    expect(
      get_cancel_offers({ ...monthly_nova, payment_provider: "crypto_native" }),
    ).toEqual(empty);
    expect(
      get_cancel_offers({ ...monthly_nova, cancel_at_period_end: true }),
    ).toEqual(empty);
    expect(get_cancel_offers(null)).toEqual(empty);
  });

  it("uses the server price when the server reports a yearly offer", () => {
    const offers = get_cancel_offers({
      ...monthly_nova,
      yearly_switch_offer: {
        plan_code: "nova",
        yearly_price_cents: 8400,
        saving_cents: 2388,
      },
    });

    expect(offers.yearly?.yearly_monthly_cents).toBe(700);
    expect(offers.yearly?.saving_cents).toBe(2388);
  });
});
