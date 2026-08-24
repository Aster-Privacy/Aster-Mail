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
  get_downgrade_offer,
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
